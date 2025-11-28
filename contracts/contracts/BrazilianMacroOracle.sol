// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BrazilianMacroOracle
 * @notice On-chain storage for Brazilian macroeconomic indicators (IPCA, CDI, SELIC, PTAX, IGPM, TR)
 * @dev Implements Chainlink AggregatorV3Interface compatibility with 8 decimal precision
 * @author Pedro Todescan - Delos
 * 
 * Value Encoding (Chainlink Standard - 8 decimals):
 * - 4.50% interest rate → 450000000 (4.5 × 10^8)
 * - 10.90% CDI rate    → 1090000000 (10.9 × 10^8)
 * - 5.81 BRL/USD       → 581000000 (5.81 × 10^8)
 */
contract BrazilianMacroOracle is AccessControl, Pausable {
    
    // ============ Constants ============
    uint8 public constant CHAINLINK_DECIMALS = 8;
    uint256 public constant PRECISION = 10 ** 8; // 100,000,000

    // ============ Roles ============
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    // ============ Structs ============
    struct RateData {
        int256 answer;          // Rate scaled by 10^8 (Chainlink standard), signed for negative rates
        uint256 timestamp;      // Block timestamp when updated
        uint256 realWorldDate;  // BCB reference date (YYYYMMDD format)
        string source;          // Data source (e.g., "BCB-433" for IPCA)
        address updater;        // Address that performed the update
    }

    struct RateMetadata {
        string name;            // "IPCA - Índice de Preços ao Consumidor"
        string description;     // Full description
        uint8 decimals;         // Always 8 for Chainlink compatibility
        uint256 heartbeat;      // Expected max time between updates (seconds)
        int256 minAnswer;       // Circuit breaker: minimum value (scaled)
        int256 maxAnswer;       // Circuit breaker: maximum value (scaled)
        bool isActive;          // Whether rate is actively maintained
    }

    // ============ State Variables ============
    mapping(string => RateData) public currentRates;
    mapping(string => RateData[]) public rateHistory;
    mapping(string => RateMetadata) public rateMetadata;
    string[] public supportedRates;
    mapping(string => bool) public rateExists;
    mapping(string => uint80) public roundIds;

    // ============ Events ============
    event RateUpdated(
        string indexed rateType,
        int256 answer,
        uint256 realWorldDate,
        string source,
        address indexed updater,
        uint256 timestamp
    );
    
    event RateAdded(
        string indexed rateType,
        string name,
        uint8 decimals,
        uint256 heartbeat
    );
    
    event RateDeactivated(string indexed rateType);
    event RateReactivated(string indexed rateType);

    // ============ Errors ============
    error RateDoesNotExist(string rateType);
    error RateAlreadyExists(string rateType);
    error InvalidDate();
    error RateNotActive(string rateType);
    error EmptyRateType();
    error AnswerBelowMin(string rateType, int256 answer, int256 min);
    error AnswerAboveMax(string rateType, int256 answer, int256 max);
    error SameDateUpdate(string rateType, uint256 date);
    error ArrayLengthMismatch();

    // ============ Constructor ============
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);

        // Initialize standard Brazilian macro rates with Chainlink-compatible config
        // All use 8 decimals, values scaled by 10^8
        
        // IPCA: Monthly inflation, typically -2% to 2% monthly
        _addRate(
            "IPCA", 
            "IPCA - Indice de Precos ao Consumidor Amplo", 
            "Brazilian consumer price index, monthly inflation measure",
            CHAINLINK_DECIMALS,
            35 days,        // heartbeat: monthly + buffer
            -10_00000000,   // min: -10%
            100_00000000    // max: 100%
        );
        
        // CDI: Daily interbank rate, typically 0% to 30%
        _addRate(
            "CDI", 
            "CDI - Certificado de Deposito Interbancario", 
            "Interbank deposit rate, daily benchmark",
            CHAINLINK_DECIMALS,
            2 days,         // heartbeat: daily + buffer
            0,              // min: 0%
            50_00000000     // max: 50%
        );
        
        // SELIC: Central bank target rate
        _addRate(
            "SELIC", 
            "SELIC - Sistema Especial de Liquidacao e Custodia", 
            "Central bank base rate, monetary policy target",
            CHAINLINK_DECIMALS,
            2 days,
            0,
            50_00000000
        );
        
        // PTAX: USD/BRL exchange rate, typically 1.0 to 10.0
        _addRate(
            "PTAX", 
            "PTAX - Taxa de Cambio USD/BRL", 
            "Official USD/BRL exchange rate from BCB",
            CHAINLINK_DECIMALS,
            2 days,
            1_00000000,     // min: 1.0 BRL/USD
            15_00000000     // max: 15.0 BRL/USD
        );
        
        // IGPM: General market price index
        _addRate(
            "IGPM", 
            "IGPM - Indice Geral de Precos do Mercado", 
            "General market price index, monthly",
            CHAINLINK_DECIMALS,
            35 days,
            -10_00000000,
            100_00000000
        );
        
        // TR: Reference rate for savings
        _addRate(
            "TR", 
            "TR - Taxa Referencial", 
            "Reference rate for savings and loans",
            CHAINLINK_DECIMALS,
            2 days,
            0,
            50_00000000
        );
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Add a new rate type to the oracle
     * @param rateType Unique identifier for the rate (e.g., "IPCA")
     * @param name Human-readable name
     * @param description Full description of the rate
     * @param decimals Number of decimal places (should be 8 for Chainlink compatibility)
     * @param heartbeat Expected max time between updates in seconds
     * @param minAnswer Circuit breaker minimum (scaled by 10^decimals)
     * @param maxAnswer Circuit breaker maximum (scaled by 10^decimals)
     */
    function addRate(
        string calldata rateType,
        string calldata name,
        string calldata description,
        uint8 decimals,
        uint256 heartbeat,
        int256 minAnswer,
        int256 maxAnswer
    ) external onlyRole(ADMIN_ROLE) {
        _addRate(rateType, name, description, decimals, heartbeat, minAnswer, maxAnswer);
    }

    function _addRate(
        string memory rateType,
        string memory name,
        string memory description,
        uint8 decimals,
        uint256 heartbeat,
        int256 minAnswer,
        int256 maxAnswer
    ) internal {
        if (bytes(rateType).length == 0) revert EmptyRateType();
        if (rateExists[rateType]) revert RateAlreadyExists(rateType);

        rateMetadata[rateType] = RateMetadata({
            name: name,
            description: description,
            decimals: decimals,
            heartbeat: heartbeat,
            minAnswer: minAnswer,
            maxAnswer: maxAnswer,
            isActive: true
        });

        rateExists[rateType] = true;
        supportedRates.push(rateType);
        roundIds[rateType] = 0;

        emit RateAdded(rateType, name, decimals, heartbeat);
    }

    /**
     * @notice Deactivate a rate type (stops updates but preserves history)
     */
    function deactivateRate(string calldata rateType) external onlyRole(ADMIN_ROLE) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        rateMetadata[rateType].isActive = false;
        emit RateDeactivated(rateType);
    }

    /**
     * @notice Reactivate a previously deactivated rate
     */
    function reactivateRate(string calldata rateType) external onlyRole(ADMIN_ROLE) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        rateMetadata[rateType].isActive = true;
        emit RateReactivated(rateType);
    }

    /**
     * @notice Update circuit breaker bounds for a rate
     */
    function updateBounds(
        string calldata rateType, 
        int256 minAnswer, 
        int256 maxAnswer
    ) external onlyRole(ADMIN_ROLE) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        rateMetadata[rateType].minAnswer = minAnswer;
        rateMetadata[rateType].maxAnswer = maxAnswer;
    }

    /**
     * @notice Pause all oracle updates (emergency)
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause oracle updates
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ Updater Functions ============

    /**
     * @notice Update a single rate
     * @param rateType The rate identifier (e.g., "IPCA", "CDI")
     * @param answer Rate value scaled by 10^8 (e.g., 1090000000 = 10.90%)
     * @param realWorldDate Date in YYYYMMDD format (e.g., 20241126)
     * @param source Data source identifier (e.g., "BCB-433")
     */
    function updateRate(
        string calldata rateType,
        int256 answer,
        uint256 realWorldDate,
        string calldata source
    ) external onlyRole(UPDATER_ROLE) whenNotPaused {
        _updateRate(rateType, answer, realWorldDate, source);
    }

    function _updateRate(
        string calldata rateType,
        int256 answer,
        uint256 realWorldDate,
        string calldata source
    ) internal {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        if (!rateMetadata[rateType].isActive) revert RateNotActive(rateType);
        if (!_isValidDate(realWorldDate)) revert InvalidDate();
        
        // Check if same date (skip update)
        if (currentRates[rateType].realWorldDate == realWorldDate && 
            currentRates[rateType].timestamp > 0) {
            revert SameDateUpdate(rateType, realWorldDate);
        }
        
        // Circuit breaker validation
        RateMetadata storage meta = rateMetadata[rateType];
        if (answer < meta.minAnswer) revert AnswerBelowMin(rateType, answer, meta.minAnswer);
        if (answer > meta.maxAnswer) revert AnswerAboveMax(rateType, answer, meta.maxAnswer);

        RateData memory newRate = RateData({
            answer: answer,
            timestamp: block.timestamp,
            realWorldDate: realWorldDate,
            source: source,
            updater: msg.sender
        });

        // Store current as history before updating
        if (currentRates[rateType].timestamp > 0) {
            rateHistory[rateType].push(currentRates[rateType]);
        }

        currentRates[rateType] = newRate;
        roundIds[rateType]++;

        emit RateUpdated(rateType, answer, realWorldDate, source, msg.sender, block.timestamp);
    }

    /**
     * @notice Batch update multiple rates in a single transaction
     * @dev Skips rates where the date hasn't changed (no revert, just skip)
     * @param rateTypes Array of rate identifiers
     * @param answers Array of values scaled by 10^8
     * @param realWorldDates Array of dates in YYYYMMDD format
     * @param sources Array of source identifiers
     * @return updated Number of rates actually updated
     */
    function batchUpdateRates(
        string[] calldata rateTypes,
        int256[] calldata answers,
        uint256[] calldata realWorldDates,
        string[] calldata sources
    ) external onlyRole(UPDATER_ROLE) whenNotPaused returns (uint256 updated) {
        if (rateTypes.length != answers.length ||
            answers.length != realWorldDates.length ||
            realWorldDates.length != sources.length) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i = 0; i < rateTypes.length; i++) {
            string calldata rateType = rateTypes[i];
            
            if (!rateExists[rateType]) continue;
            if (!rateMetadata[rateType].isActive) continue;
            if (!_isValidDate(realWorldDates[i])) continue;
            
            // Skip if same date
            if (currentRates[rateType].realWorldDate == realWorldDates[i] && 
                currentRates[rateType].timestamp > 0) {
                continue;
            }
            
            // Circuit breaker check
            RateMetadata storage meta = rateMetadata[rateType];
            if (answers[i] < meta.minAnswer || answers[i] > meta.maxAnswer) {
                continue;
            }

            RateData memory newRate = RateData({
                answer: answers[i],
                timestamp: block.timestamp,
                realWorldDate: realWorldDates[i],
                source: sources[i],
                updater: msg.sender
            });

            if (currentRates[rateType].timestamp > 0) {
                rateHistory[rateType].push(currentRates[rateType]);
            }

            currentRates[rateType] = newRate;
            roundIds[rateType]++;
            updated++;

            emit RateUpdated(rateType, answers[i], realWorldDates[i], sources[i], msg.sender, block.timestamp);
        }
        
        return updated;
    }

    // ============ View Functions ============

    /**
     * @notice Get the current rate data for a rate type
     * @param rateType The rate identifier
     * @return answer Rate scaled by 10^8
     * @return timestamp Block timestamp of last update
     * @return realWorldDate BCB reference date (YYYYMMDD)
     */
    function getRate(string calldata rateType) 
        external 
        view 
        returns (
            int256 answer,
            uint256 timestamp,
            uint256 realWorldDate
        ) 
    {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        RateData storage rate = currentRates[rateType];
        return (rate.answer, rate.timestamp, rate.realWorldDate);
    }

    /**
     * @notice Get full rate data including source and updater
     * @param rateType The rate identifier
     */
    function getRateFull(string calldata rateType) 
        external 
        view 
        returns (RateData memory) 
    {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        return currentRates[rateType];
    }

    /**
     * @notice Get historical rate data
     * @param rateType The rate identifier
     * @param count Number of historical entries to return (0 = all)
     */
    function getRateHistory(string calldata rateType, uint256 count) 
        external 
        view 
        returns (RateData[] memory) 
    {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        
        RateData[] storage history = rateHistory[rateType];
        uint256 historyLength = history.length;
        
        if (count == 0 || count > historyLength) {
            count = historyLength;
        }

        RateData[] memory result = new RateData[](count);
        
        // Return most recent first
        for (uint256 i = 0; i < count; i++) {
            result[i] = history[historyLength - 1 - i];
        }
        
        return result;
    }

    /**
     * @notice Get metadata for a rate type
     */
    function getRateMetadata(string calldata rateType) 
        external 
        view 
        returns (RateMetadata memory) 
    {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        return rateMetadata[rateType];
    }

    /**
     * @notice Get all supported rate types
     */
    function getSupportedRates() external view returns (string[] memory) {
        return supportedRates;
    }

    /**
     * @notice Get the number of supported rates
     */
    function getSupportedRatesCount() external view returns (uint256) {
        return supportedRates.length;
    }

    /**
     * @notice Check if a rate is stale (not updated within heartbeat)
     * @param rateType The rate identifier
     */
    function isRateStale(string calldata rateType) external view returns (bool) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        
        RateData storage rate = currentRates[rateType];
        RateMetadata storage meta = rateMetadata[rateType];
        
        if (rate.timestamp == 0) return true;
        
        return (block.timestamp - rate.timestamp) > meta.heartbeat;
    }

    // ============ Chainlink AggregatorV3Interface Compatibility ============

    /**
     * @notice Chainlink-compatible interface for rate data
     * @param rateType The rate identifier
     * @dev Allows seamless integration with protocols expecting Chainlink feeds
     */
    function latestRoundData(string calldata rateType)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        
        RateData storage rate = currentRates[rateType];
        uint80 currentRound = roundIds[rateType];
        
        return (
            currentRound,
            rate.answer,
            rate.timestamp,
            rate.timestamp,
            currentRound
        );
    }

    /**
     * @notice Get decimals for a rate (Chainlink compatibility)
     * @dev Always returns 8 for Chainlink standard compliance
     */
    function decimals(string calldata rateType) external view returns (uint8) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        return rateMetadata[rateType].decimals;
    }

    /**
     * @notice Get description for a rate (Chainlink compatibility)
     */
    function description(string calldata rateType) external view returns (string memory) {
        if (!rateExists[rateType]) revert RateDoesNotExist(rateType);
        return rateMetadata[rateType].description;
    }

    /**
     * @notice Get version (Chainlink compatibility)
     */
    function version() external pure returns (uint256) {
        return 1;
    }

    // ============ Helper Functions ============

    /**
     * @notice Convert answer to human-readable percentage
     * @param answer Scaled answer (10^8)
     * @return whole Whole number part
     * @return fractional Fractional part (8 decimals)
     */
    function answerToPercentage(int256 answer) 
        external 
        pure 
        returns (int256 whole, uint256 fractional) 
    {
        whole = answer / int256(PRECISION);
        fractional = uint256(answer >= 0 ? answer : -answer) % PRECISION;
    }

    // ============ Internal Functions ============

    /**
     * @notice Validate date format (basic YYYYMMDD validation)
     */
    function _isValidDate(uint256 date) internal pure returns (bool) {
        if (date < 19000101 || date > 29991231) return false;
        
        uint256 year = date / 10000;
        uint256 month = (date / 100) % 100;
        uint256 day = date % 100;
        
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        if (year < 1900 || year > 2999) return false;
        
        return true;
    }
}

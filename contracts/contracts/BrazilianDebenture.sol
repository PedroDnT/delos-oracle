// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BrazilianDebenture
 * @author Pedro Todescan
 * @notice Tokenized Brazilian corporate bond (debênture) following ANBIMA methodology
 * @dev Implements ERC-1404 transfer restrictions with ANBIMA-compliant pricing parameters
 * 
 * Reference: Metodologia ANBIMA de Precificação de Debêntures (Dezembro/2023)
 * 
 * Key ANBIMA Parameters Implemented:
 * - Rate Types: DI+Spread, %DI, IPCA+Spread, Prefixado
 * - VNE/VNA tracking with 6 decimal precision
 * - Anniversary date for IPCA indexation
 * - Flexible amortization schedules
 * - Combo series support
 */

/**
 * @title IBrazilianMacroOracle
 * @notice Interface matching BrazilianMacroOracle contract
 * @dev Returns int256 for answer to support negative rates (deflation scenarios)
 */
interface IBrazilianMacroOracle {
    function getRate(string calldata rateType) external view returns (
        int256 answer,           // Rate scaled by 10^8 (Chainlink standard), signed
        uint256 timestamp,       // Block timestamp when updated
        uint256 realWorldDate    // BCB reference date (YYYYMMDD format)
    );

    function getRateMetadata(string calldata rateType) external view returns (
        string memory name,
        string memory description,
        uint8 decimals,
        uint256 heartbeat,
        int256 minAnswer,
        int256 maxAnswer,
        bool isActive
    );
}

contract BrazilianDebenture is ERC20, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant TRUSTEE_ROLE = keccak256("TRUSTEE_ROLE");
    bytes32 public constant WHITELIST_ADMIN_ROLE = keccak256("WHITELIST_ADMIN_ROLE");

    // ANBIMA precision: 6 decimals for PU, 4 for rates, 2 for %DI
    uint256 public constant PRECISION_PU = 1e6;          // 6 decimal places for PU
    uint256 public constant PRECISION_RATE = 1e4;        // 4 decimal places for rates (basis points)
    uint256 public constant PRECISION_PERCENT_DI = 1e2;  // 2 decimal places for %DI
    uint256 public constant BUSINESS_DAYS_YEAR = 252;    // Brazilian business days convention

    // ERC-1404 Transfer Restriction Codes
    uint8 public constant SUCCESS = 0;
    uint8 public constant NOT_WHITELISTED = 1;
    uint8 public constant PAUSED = 2;
    uint8 public constant BLACKLISTED = 3;
    uint8 public constant LOCK_UP_PERIOD = 4;

    // ============ Enums ============

    /**
     * @notice Rate indexation types per ANBIMA methodology
     * @dev PRE = Prefixado (fixed rate TIR)
     *      DI_SPREAD = DI + Spread (spread in basis points)
     *      DI_PERCENT = % do DI (percentage of DI rate)
     *      IPCA_SPREAD = IPCA + Spread (spread over closest NTN-B duration)
     *      IGPM_SPREAD = IGP-M + Spread
     */
    enum RateType {
        PRE,
        DI_SPREAD,
        DI_PERCENT,
        IPCA_SPREAD,
        IGPM_SPREAD
    }

    /**
     * @notice Amortization calculation basis
     * @dev PERCENT_VNE = Percentage over original VNE
     *      PERCENT_VNA = Percentage over current VNA (saldo)
     *      FIXED_VALUE = Fixed BRL amount
     */
    enum AmortizationType {
        PERCENT_VNE,
        PERCENT_VNA,
        FIXED_VALUE
    }

    enum DebentureStatus {
        ACTIVE,
        MATURED,
        DEFAULTED,
        EARLY_REDEEMED,
        REPACTUATED
    }

    // ============ Structs ============

    /**
     * @notice Core debenture terms following ANBIMA parameters
     * @dev All rates stored in basis points (1% = 100 bp)
     */
    struct DebentureTerms {
        // Value Parameters
        uint256 vne;                    // Valor Nominal de Emissão (6 decimals)
        uint256 totalSupplyUnits;       // Total units issued
        
        // Date Parameters
        uint256 issueDate;              // Data de emissão (timestamp)
        uint256 maturityDate;           // Data de vencimento (timestamp)
        uint8 anniversaryDay;           // Dia de aniversário (1-31, for IPCA indexation)
        uint256 lockUpEndDate;          // End of lock-up period (ICVM 160)
        
        // Rate Parameters
        RateType rateType;              // Tipo de indexador
        uint256 fixedRate;              // Taxa fixa ou spread (4 decimals, basis points)
        uint256 percentDI;              // Percentual do DI (2 decimals, only for DI_PERCENT)
        
        // Payment Structure
        uint256 couponFrequencyDays;    // Periodicidade de juros (business days: 126, 180, 252)
        AmortizationType amortType;     // Tipo de amortização
        
        // Identifiers
        string isinCode;                // ISIN code
        string cetipCode;               // CETIP/B3 code
        string series;                  // Série (e.g., "1ª Série")
        
        // Special Conditions
        bool hasRepactuacao;            // Cláusula de repactuação
        bool hasEarlyRedemption;        // Resgate antecipado facultativo
        bytes32 comboId;                // Combo identifier (0x0 if not combo)
    }

    /**
     * @notice Amortization schedule entry
     */
    struct AmortizationEntry {
        uint256 date;                   // Payment date (timestamp)
        uint256 percentage;             // Percentage (4 decimals) or fixed value
        bool executed;                  // Whether payment was made
    }

    /**
     * @notice Coupon payment record
     */
    struct CouponPayment {
        uint256 recordDate;             // Data de corte
        uint256 paymentDate;            // Data de pagamento
        uint256 rateUsed;               // Rate fetched from oracle (4 decimals)
        uint256 indexValue;             // Index value used (for IPCA/IGPM)
        uint256 couponAmount;           // Total coupon amount (6 decimals)
        uint256 amortAmount;            // Amortization amount if applicable
        bool calculated;                // Whether calculation is done
        bool paid;                      // Whether payment was distributed
    }

    /**
     * @notice VNA tracking per ANBIMA methodology
     */
    struct VNARecord {
        uint256 value;                  // Current VNA (6 decimals)
        uint256 lastUpdateDate;         // Last update timestamp
        uint256 lastIndexValue;         // Last index value used
        uint256 accumulatedFactor;      // Factor C (accumulated correction, 8 decimals)
    }

    // ============ State Variables ============

    DebentureTerms public terms;
    DebentureStatus public status;
    VNARecord public vnaRecord;
    
    IBrazilianMacroOracle public oracle;
    IERC20 public paymentToken;         // Stablecoin for payments (e.g., DREX, BRZ)
    
    address public issuer;
    address public trustee;             // Agente fiduciário
    
    // Amortization schedule
    AmortizationEntry[] public amortizationSchedule;
    
    // Coupon payments history
    CouponPayment[] public couponPayments;
    uint256 public nextCouponIndex;
    
    // Investor tracking
    mapping(address => bool) public whitelist;
    mapping(address => bool) public blacklist;
    mapping(address => uint256) public claimedCoupons; // Last claimed coupon index per investor
    
    // Accumulated DI factor for DI-indexed debentures
    uint256 public accumulatedDIFactor;  // 9 decimals per ANBIMA
    uint256 public lastDIUpdateDate;

    // ============ Events ============

    event DebentureIssued(
        string indexed isinCode,
        uint256 vne,
        uint256 totalUnits,
        RateType rateType
    );
    
    event VNAUpdated(
        uint256 oldVNA,
        uint256 newVNA,
        uint256 indexValue,
        uint256 timestamp
    );
    
    event CouponCalculated(
        uint256 indexed couponIndex,
        uint256 amount,
        uint256 rateUsed,
        uint256 recordDate
    );
    
    event CouponPaid(
        uint256 indexed couponIndex,
        uint256 totalAmount,
        uint256 timestamp
    );
    
    event CouponClaimed(
        address indexed investor,
        uint256 indexed couponIndex,
        uint256 amount
    );
    
    event AmortizationPaid(
        uint256 indexed scheduleIndex,
        uint256 amount,
        uint256 timestamp
    );
    
    event StatusChanged(
        DebentureStatus oldStatus,
        DebentureStatus newStatus,
        uint256 timestamp
    );
    
    event WhitelistUpdated(address indexed account, bool status);
    event BlacklistUpdated(address indexed account, bool status);
    event EarlyRedemptionExecuted(uint256 amount, uint256 timestamp);
    event RepactuationExecuted(uint256 newRate, uint256 timestamp);

    // ============ Modifiers ============

    modifier onlyIssuer() {
        require(hasRole(ISSUER_ROLE, msg.sender), "Caller is not issuer");
        _;
    }

    modifier onlyTrustee() {
        require(hasRole(TRUSTEE_ROLE, msg.sender), "Caller is not trustee");
        _;
    }

    modifier onlyActive() {
        require(status == DebentureStatus.ACTIVE, "Debenture not active");
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Deploy a new Brazilian Debenture
     * @param _name Token name (e.g., "Petrobras Debenture 2027 1S")
     * @param _symbol Token symbol (e.g., "PETR27-1")
     * @param _terms Debenture terms struct
     * @param _oracle Brazilian Macro Oracle address
     * @param _paymentToken Payment token address (stablecoin)
     * @param _issuer Issuer address
     * @param _trustee Trustee (agente fiduciário) address
     */
    constructor(
        string memory _name,
        string memory _symbol,
        DebentureTerms memory _terms,
        address _oracle,
        address _paymentToken,
        address _issuer,
        address _trustee
    ) ERC20(_name, _symbol) {
        require(_terms.vne > 0, "VNE must be positive");
        require(_terms.totalSupplyUnits > 0, "Supply must be positive");
        require(_terms.maturityDate > block.timestamp, "Invalid maturity");
        require(_terms.couponFrequencyDays > 0, "Invalid coupon frequency");
        require(_oracle != address(0), "Invalid oracle");
        require(_paymentToken != address(0), "Invalid payment token");
        require(_issuer != address(0), "Invalid issuer");
        
        terms = _terms;
        oracle = IBrazilianMacroOracle(_oracle);
        paymentToken = IERC20(_paymentToken);
        issuer = _issuer;
        trustee = _trustee;
        status = DebentureStatus.ACTIVE;
        
        // Initialize VNA = VNE at issuance
        vnaRecord = VNARecord({
            value: _terms.vne,
            lastUpdateDate: block.timestamp,
            lastIndexValue: 0,
            accumulatedFactor: 1e8  // Factor C starts at 1 (8 decimals)
        });
        
        // Initialize DI factor for DI-indexed debentures
        if (_terms.rateType == RateType.DI_SPREAD || _terms.rateType == RateType.DI_PERCENT) {
            accumulatedDIFactor = 1e9;  // 9 decimals per ANBIMA
            lastDIUpdateDate = block.timestamp;
        }
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _issuer);
        _grantRole(ADMIN_ROLE, _issuer);
        _grantRole(ISSUER_ROLE, _issuer);
        _grantRole(TRUSTEE_ROLE, _trustee);
        _grantRole(WHITELIST_ADMIN_ROLE, _issuer);
        _grantRole(WHITELIST_ADMIN_ROLE, _trustee);
        
        // Whitelist issuer and trustee
        whitelist[_issuer] = true;
        whitelist[_trustee] = true;
        
        // Mint tokens to issuer
        _mint(_issuer, _terms.totalSupplyUnits);
        
        emit DebentureIssued(
            _terms.isinCode,
            _terms.vne,
            _terms.totalSupplyUnits,
            _terms.rateType
        );
    }

    // ============ ERC-1404 Transfer Restrictions ============

    /**
     * @notice Detect transfer restriction code
     * @dev Implements ERC-1404 standard
     */
    function detectTransferRestriction(
        address from,
        address to,
        uint256 /* value */
    ) public view returns (uint8) {
        if (paused()) return PAUSED;
        if (blacklist[from] || blacklist[to]) return BLACKLISTED;
        if (!whitelist[from] || !whitelist[to]) return NOT_WHITELISTED;
        if (block.timestamp < terms.lockUpEndDate && from != issuer) return LOCK_UP_PERIOD;
        return SUCCESS;
    }

    /**
     * @notice Get message for restriction code
     */
    function messageForTransferRestriction(uint8 code) public pure returns (string memory) {
        if (code == SUCCESS) return "Success";
        if (code == NOT_WHITELISTED) return "Address not whitelisted";
        if (code == PAUSED) return "Transfers paused";
        if (code == BLACKLISTED) return "Address blacklisted";
        if (code == LOCK_UP_PERIOD) return "Lock-up period active";
        return "Unknown restriction";
    }

    /**
     * @notice Override transfer to enforce restrictions
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Allow minting and burning
        if (from != address(0) && to != address(0)) {
            uint8 code = detectTransferRestriction(from, to, value);
            require(code == SUCCESS, messageForTransferRestriction(code));
        }
        super._update(from, to, value);
    }

    // ============ Whitelist Management ============

    function addToWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE) {
        whitelist[account] = true;
        emit WhitelistUpdated(account, true);
    }

    function removeFromWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE) {
        whitelist[account] = false;
        emit WhitelistUpdated(account, false);
    }

    function addToBlacklist(address account) external onlyRole(TRUSTEE_ROLE) {
        blacklist[account] = true;
        emit BlacklistUpdated(account, true);
    }

    function removeFromBlacklist(address account) external onlyRole(TRUSTEE_ROLE) {
        blacklist[account] = false;
        emit BlacklistUpdated(account, false);
    }

    function batchWhitelist(address[] calldata accounts) external onlyRole(WHITELIST_ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = true;
            emit WhitelistUpdated(accounts[i], true);
        }
    }

    // ============ Amortization Schedule ============

    /**
     * @notice Set amortization schedule
     * @dev Can only be set once, before first coupon
     */
    function setAmortizationSchedule(
        uint256[] calldata dates,
        uint256[] calldata percentages
    ) external onlyIssuer {
        require(amortizationSchedule.length == 0, "Schedule already set");
        require(dates.length == percentages.length, "Length mismatch");
        
        uint256 totalPercent = 0;
        for (uint256 i = 0; i < dates.length; i++) {
            require(dates[i] <= terms.maturityDate, "Date after maturity");
            if (i > 0) require(dates[i] > dates[i-1], "Dates not ascending");
            
            amortizationSchedule.push(AmortizationEntry({
                date: dates[i],
                percentage: percentages[i],
                executed: false
            }));
            
            if (terms.amortType != AmortizationType.FIXED_VALUE) {
                totalPercent += percentages[i];
            }
        }
        
        // Verify total = 100% for percentage-based amortization
        if (terms.amortType != AmortizationType.FIXED_VALUE) {
            require(totalPercent == 10000, "Total must be 100%");
        }
    }

    // ============ VNA Update (IPCA/IGPM Indexation) ============

    /**
     * @notice Update VNA based on price index
     * @dev Follows ANBIMA methodology for pro-rata calculation
     *
     * Formula: VNA = VNE × C
     * Where C = Π(NIk/NIk-1) × (ProjIPCA)^(dp/dt)
     *
     * Note: Oracle returns 8 decimals, we convert to 6 for VNA
     */
    function updateVNA() external onlyActive {
        require(
            terms.rateType == RateType.IPCA_SPREAD || terms.rateType == RateType.IGPM_SPREAD,
            "Not index-linked"
        );

        string memory indexType = terms.rateType == RateType.IPCA_SPREAD ? "IPCA" : "IGPM";

        (int256 rawIndexValue, , uint256 indexDate) = oracle.getRate(indexType);
        require(rawIndexValue > 0, "Invalid index value");
        require(indexDate > vnaRecord.lastUpdateDate, "Index not updated");

        // Oracle returns int256, convert to uint256 after validation
        uint256 indexValue = uint256(rawIndexValue);
        uint256 oldVNA = vnaRecord.value;

        // Calculate new factor (simplified - full implementation needs dp/dt calculation)
        // Factor = previousFactor × (newIndex / oldIndex)
        if (vnaRecord.lastIndexValue > 0) {
            uint256 newFactor = (vnaRecord.accumulatedFactor * indexValue) / vnaRecord.lastIndexValue;
            vnaRecord.accumulatedFactor = newFactor;
            vnaRecord.value = (terms.vne * newFactor) / 1e8;
        } else {
            vnaRecord.lastIndexValue = indexValue;
        }

        vnaRecord.lastUpdateDate = block.timestamp;
        vnaRecord.lastIndexValue = indexValue;

        emit VNAUpdated(oldVNA, vnaRecord.value, indexValue, block.timestamp);
    }

    /**
     * @notice Update accumulated DI factor
     * @dev Called daily to accumulate DI rate
     * 
     * Formula: Factor = Π[(1 + DI/100)^(1/252)]
     */
    function updateDIFactor(uint256 diRate) external onlyRole(ADMIN_ROLE) onlyActive {
        require(
            terms.rateType == RateType.DI_SPREAD || terms.rateType == RateType.DI_PERCENT,
            "Not DI-linked"
        );
        
        // Calculate daily factor: (1 + DI/100)^(1/252)
        // Simplified: 1 + DI/(100*252) for small rates
        uint256 dailyFactor;
        
        if (terms.rateType == RateType.DI_PERCENT) {
            // % DI: Factor = [(1 + DI/100)^(1/252) - 1] × P/100 + 1
            uint256 adjustedRate = (diRate * terms.percentDI) / PRECISION_PERCENT_DI;
            dailyFactor = 1e9 + (adjustedRate * 1e9) / (100 * BUSINESS_DAYS_YEAR * PRECISION_RATE);
        } else {
            // DI + Spread: Factor = (1 + DI/100)^(1/252) × (1 + S/100)^(1/252)
            uint256 diDailyFactor = 1e9 + (diRate * 1e9) / (100 * BUSINESS_DAYS_YEAR * PRECISION_RATE);
            uint256 spreadDailyFactor = 1e9 + (terms.fixedRate * 1e9) / (100 * BUSINESS_DAYS_YEAR * PRECISION_RATE);
            dailyFactor = (diDailyFactor * spreadDailyFactor) / 1e9;
        }
        
        accumulatedDIFactor = (accumulatedDIFactor * dailyFactor) / 1e9;
        lastDIUpdateDate = block.timestamp;
    }

    // ============ Coupon Calculations ============

    /**
     * @notice Get current VNA
     */
    function getCurrentVNA() public view returns (uint256) {
        return vnaRecord.value;
    }

    /**
     * @notice Get PU PAR (VNA + accrued interest)
     * @dev PUPAR = VNA × (1 + Juros/100)
     */
    function getPUPar() public view returns (uint256) {
        uint256 vna = getCurrentVNA();
        
        if (terms.rateType == RateType.DI_SPREAD || terms.rateType == RateType.DI_PERCENT) {
            // For DI: PUPAR = VNA × accumulatedDIFactor
            return (vna * accumulatedDIFactor) / 1e9;
        } else if (terms.rateType == RateType.IPCA_SPREAD || terms.rateType == RateType.IGPM_SPREAD) {
            // For IPCA/IGPM: Calculate accrued fixed spread
            uint256 daysSinceLastCoupon = _getBusinessDaysSince(_getLastCouponDate());
            uint256 accruedInterest = (vna * terms.fixedRate * daysSinceLastCoupon) / 
                                      (BUSINESS_DAYS_YEAR * PRECISION_RATE * 100);
            return vna + accruedInterest;
        } else {
            // Prefixado
            uint256 daysSinceLastCoupon = _getBusinessDaysSince(_getLastCouponDate());
            uint256 accruedInterest = (vna * terms.fixedRate * daysSinceLastCoupon) / 
                                      (BUSINESS_DAYS_YEAR * PRECISION_RATE * 100);
            return vna + accruedInterest;
        }
    }

    /**
     * @notice Calculate next coupon payment
     * @dev Returns amount per unit in PU decimals (6 decimals)
     *
     * For DI-indexed: coupon = VNA × (factor - 1)
     * For IPCA+/IGPM+: coupon = VNA × (index + spread) × (days/252)
     * For PRE: coupon = VNA × rate × (days/252)
     */
    function calculateNextCoupon() public view returns (uint256 amount, uint256 rateUsed) {
        if (terms.rateType == RateType.DI_SPREAD || terms.rateType == RateType.DI_PERCENT) {
            // For DI-indexed: coupon = VNA × (factor - 1)
            uint256 vna = getCurrentVNA();
            amount = (vna * (accumulatedDIFactor - 1e9)) / 1e9;
            rateUsed = accumulatedDIFactor;
        } else {
            // For fixed rate / IPCA+ / IGPM+
            string memory oracleRateType = _getRateTypeString();
            (int256 rawOracleRate, , ) = oracle.getRate(oracleRateType);

            // Oracle returns 8 decimals, convert to basis points (4 decimals)
            // e.g., 450000000 (4.5% in 8 decimals) → 450 (4.5% in basis points)
            uint256 oracleRateBps = rawOracleRate > 0 ? uint256(rawOracleRate) / 1e4 : 0;

            uint256 totalRate;
            if (terms.rateType == RateType.IPCA_SPREAD || terms.rateType == RateType.IGPM_SPREAD) {
                totalRate = oracleRateBps + terms.fixedRate;
            } else {
                // PRE - fixed rate only
                totalRate = terms.fixedRate;
            }

            uint256 vna = getCurrentVNA();
            // Coupon = VNA × rate × (days/252)
            // rate is in basis points (PRECISION_RATE = 1e4), so divide by 10000 for percentage
            amount = (vna * totalRate * terms.couponFrequencyDays) /
                     (BUSINESS_DAYS_YEAR * PRECISION_RATE);
            rateUsed = totalRate;
        }
    }

    /**
     * @notice Record coupon calculation (callable by anyone when due)
     */
    function recordCouponCalculation() external onlyActive nonReentrant {
        uint256 nextCouponDate = _getNextCouponDate();
        require(block.timestamp >= nextCouponDate, "Coupon not due yet");
        
        (uint256 amount, uint256 rateUsed) = calculateNextCoupon();
        
        // Get amortization if scheduled
        uint256 amortAmount = 0;
        for (uint256 i = 0; i < amortizationSchedule.length; i++) {
            if (!amortizationSchedule[i].executed && 
                amortizationSchedule[i].date <= nextCouponDate) {
                amortAmount = _calculateAmortization(i);
                break;
            }
        }
        
        couponPayments.push(CouponPayment({
            recordDate: block.timestamp,
            paymentDate: 0,
            rateUsed: rateUsed,
            indexValue: vnaRecord.lastIndexValue,
            couponAmount: amount,
            amortAmount: amortAmount,
            calculated: true,
            paid: false
        }));
        
        emit CouponCalculated(
            couponPayments.length - 1,
            amount,
            rateUsed,
            block.timestamp
        );
        
        // Reset DI factor for next period
        if (terms.rateType == RateType.DI_SPREAD || terms.rateType == RateType.DI_PERCENT) {
            accumulatedDIFactor = 1e9;
        }
    }

    /**
     * @notice Pay coupon (issuer deposits funds)
     */
    function payCoupon(uint256 couponIndex) external onlyIssuer nonReentrant {
        require(couponIndex < couponPayments.length, "Invalid coupon index");
        CouponPayment storage coupon = couponPayments[couponIndex];
        require(coupon.calculated, "Coupon not calculated");
        require(!coupon.paid, "Coupon already paid");
        
        uint256 totalAmount = (coupon.couponAmount + coupon.amortAmount) * totalSupply() / PRECISION_PU;
        
        paymentToken.safeTransferFrom(msg.sender, address(this), totalAmount);
        
        coupon.paid = true;
        coupon.paymentDate = block.timestamp;
        
        emit CouponPaid(couponIndex, totalAmount, block.timestamp);
    }

    /**
     * @notice Claim coupon payment (investor withdraws)
     */
    function claimCoupon(uint256 couponIndex) external nonReentrant {
        require(couponIndex < couponPayments.length, "Invalid coupon index");
        require(couponIndex >= claimedCoupons[msg.sender], "Already claimed");

        CouponPayment storage coupon = couponPayments[couponIndex];
        require(coupon.paid, "Coupon not paid yet");

        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No balance");

        uint256 amount = ((coupon.couponAmount + coupon.amortAmount) * balance) / PRECISION_PU;

        claimedCoupons[msg.sender] = couponIndex + 1;

        paymentToken.safeTransfer(msg.sender, amount);

        emit CouponClaimed(msg.sender, couponIndex, amount);
    }

    /**
     * @notice Claim all pending coupon payments in a single transaction
     * @dev Gas-efficient batch claim for investors with multiple unclaimed coupons
     * @return totalClaimed Total amount claimed across all coupons
     */
    function claimAllCoupons() external nonReentrant returns (uint256 totalClaimed) {
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No balance");

        uint256 startIndex = claimedCoupons[msg.sender];
        uint256 endIndex = couponPayments.length;

        require(startIndex < endIndex, "No coupons to claim");

        totalClaimed = 0;
        uint256 lastClaimedIndex = startIndex;

        for (uint256 i = startIndex; i < endIndex; i++) {
            CouponPayment storage coupon = couponPayments[i];
            if (coupon.paid) {
                uint256 amount = ((coupon.couponAmount + coupon.amortAmount) * balance) / PRECISION_PU;
                totalClaimed += amount;
                lastClaimedIndex = i + 1;
                emit CouponClaimed(msg.sender, i, amount);
            } else {
                // Stop at first unpaid coupon (maintain ordering)
                break;
            }
        }

        require(totalClaimed > 0, "No paid coupons to claim");

        claimedCoupons[msg.sender] = lastClaimedIndex;
        paymentToken.safeTransfer(msg.sender, totalClaimed);
    }

    /**
     * @notice Get pending claimable amount for an investor
     * @param investor Address to check
     * @return pendingAmount Total amount available to claim
     * @return pendingCount Number of coupons available to claim
     */
    function getPendingClaims(address investor) external view returns (uint256 pendingAmount, uint256 pendingCount) {
        uint256 balance = balanceOf(investor);
        if (balance == 0) return (0, 0);

        uint256 startIndex = claimedCoupons[investor];
        for (uint256 i = startIndex; i < couponPayments.length; i++) {
            CouponPayment storage coupon = couponPayments[i];
            if (coupon.paid) {
                pendingAmount += ((coupon.couponAmount + coupon.amortAmount) * balance) / PRECISION_PU;
                pendingCount++;
            } else {
                break;
            }
        }
    }

    // ============ Special Conditions ============

    /**
     * @notice Execute early redemption (resgate antecipado)
     */
    function executeEarlyRedemption(uint256 redemptionPrice) external onlyIssuer onlyActive {
        require(terms.hasEarlyRedemption, "Early redemption not allowed");
        
        uint256 totalAmount = redemptionPrice * totalSupply();
        paymentToken.safeTransferFrom(msg.sender, address(this), totalAmount);
        
        DebentureStatus oldStatus = status;
        status = DebentureStatus.EARLY_REDEEMED;
        
        emit EarlyRedemptionExecuted(totalAmount, block.timestamp);
        emit StatusChanged(oldStatus, status, block.timestamp);
    }

    /**
     * @notice Execute repactuation (change rate terms)
     */
    function executeRepactuation(uint256 newFixedRate) external onlyTrustee onlyActive {
        require(terms.hasRepactuacao, "Repactuation not allowed");
        
        terms.fixedRate = newFixedRate;
        
        emit RepactuationExecuted(newFixedRate, block.timestamp);
    }

    /**
     * @notice Mark debenture as matured
     */
    function mature() external onlyActive {
        require(block.timestamp >= terms.maturityDate, "Not yet matured");
        
        DebentureStatus oldStatus = status;
        status = DebentureStatus.MATURED;
        
        emit StatusChanged(oldStatus, status, block.timestamp);
    }

    /**
     * @notice Mark debenture as defaulted (trustee only)
     */
    function declareDefault() external onlyTrustee onlyActive {
        DebentureStatus oldStatus = status;
        status = DebentureStatus.DEFAULTED;
        
        emit StatusChanged(oldStatus, status, block.timestamp);
    }

    // ============ View Functions ============

    function getTerms() external view returns (DebentureTerms memory) {
        return terms;
    }

    function getVNARecord() external view returns (VNARecord memory) {
        return vnaRecord;
    }

    function getCouponPayment(uint256 index) external view returns (CouponPayment memory) {
        require(index < couponPayments.length, "Invalid index");
        return couponPayments[index];
    }

    function getCouponCount() external view returns (uint256) {
        return couponPayments.length;
    }

    function getAmortizationSchedule() external view returns (AmortizationEntry[] memory) {
        return amortizationSchedule;
    }

    function isWhitelisted(address account) external view returns (bool) {
        return whitelist[account];
    }

    function isBlacklisted(address account) external view returns (bool) {
        return blacklist[account];
    }

    // ============ Admin Functions ============

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function setOracle(address newOracle) external onlyRole(ADMIN_ROLE) {
        require(newOracle != address(0), "Invalid oracle");
        oracle = IBrazilianMacroOracle(newOracle);
    }

    // ============ ERC-165 Interface Detection ============

    /**
     * @notice ERC-165 interface detection
     * @dev Returns true for ERC-20, ERC-1404, AccessControl, and ERC-165
     *
     * ERC-1404 interface ID: 0xaf1e6ec2
     * Calculated as: bytes4(keccak256('detectTransferRestriction(address,address,uint256)')) ^
     *                bytes4(keccak256('messageForTransferRestriction(uint8)'))
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        // ERC-1404 interface ID
        bytes4 ERC1404_INTERFACE_ID = 0xaf1e6ec2;

        return
            interfaceId == ERC1404_INTERFACE_ID ||
            interfaceId == type(IERC20).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ============ Internal Functions ============

    function _getNextCouponDate() internal view returns (uint256) {
        if (couponPayments.length == 0) {
            return terms.issueDate + (terms.couponFrequencyDays * 1 days);
        }
        return couponPayments[couponPayments.length - 1].recordDate + (terms.couponFrequencyDays * 1 days);
    }

    function _getLastCouponDate() internal view returns (uint256) {
        if (couponPayments.length == 0) {
            return terms.issueDate;
        }
        return couponPayments[couponPayments.length - 1].recordDate;
    }

    function _getBusinessDaysSince(uint256 fromDate) internal view returns (uint256) {
        // Simplified: assumes all days are business days
        // Production should use a proper business day calendar
        return (block.timestamp - fromDate) / 1 days;
    }

    function _getRateTypeString() internal view returns (string memory) {
        if (terms.rateType == RateType.IPCA_SPREAD) return "IPCA";
        if (terms.rateType == RateType.IGPM_SPREAD) return "IGPM";
        if (terms.rateType == RateType.DI_SPREAD || terms.rateType == RateType.DI_PERCENT) return "CDI";
        return "SELIC";
    }

    function _calculateAmortization(uint256 scheduleIndex) internal view returns (uint256) {
        AmortizationEntry storage entry = amortizationSchedule[scheduleIndex];
        
        if (terms.amortType == AmortizationType.FIXED_VALUE) {
            return entry.percentage;  // Actually a fixed value
        } else if (terms.amortType == AmortizationType.PERCENT_VNE) {
            return (terms.vne * entry.percentage) / PRECISION_RATE;
        } else {
            return (vnaRecord.value * entry.percentage) / PRECISION_RATE;
        }
    }

    /**
     * @notice Override decimals to match ANBIMA PU precision
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

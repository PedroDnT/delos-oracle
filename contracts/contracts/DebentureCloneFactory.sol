// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BrazilianDebentureCloneable.sol";

/**
 * @title DebentureCloneFactory
 * @author DELOS Team
 * @notice Factory for deploying Brazilian Debentures using EIP-1167 minimal proxy pattern
 * @dev Uses OpenZeppelin Clones library for gas-efficient deployment
 *
 * Benefits of Clone Pattern:
 * - Each clone is only ~45 bytes (vs 29KB for full contract)
 * - All clones share the same implementation bytecode
 * - Factory stays under 24KB deployment limit
 * - Gas efficient: ~45K gas per clone vs ~3M for full deployment
 *
 * Architecture:
 * 1. Deploy BrazilianDebentureCloneable once (implementation)
 * 2. Deploy DebentureCloneFactory pointing to implementation
 * 3. Call createDebenture() to deploy minimal proxies
 */
contract DebentureCloneFactory is Ownable {
    using Clones for address;

    // ============ State Variables ============

    /// @notice Implementation contract address
    address public immutable implementation;

    /// @notice Oracle address for all debentures
    address public oracle;

    /// @notice Default payment token (can be address(0))
    address public defaultPaymentToken;

    /// @notice All created debentures
    address[] public allDebentures;

    /// @notice ISIN to debenture address mapping
    mapping(string => address) public debenturesByISIN;

    /// @notice Issuer to their debentures mapping
    mapping(address => address[]) public issuerDebentures;

    /// @notice Authorized issuers who can create debentures
    mapping(address => bool) public authorizedIssuers;

    // ============ Events ============

    event DebentureCreated(
        address indexed debentureAddress,
        string indexed isinCode,
        string name,
        string symbol,
        address indexed issuer,
        uint256 vne,
        uint256 totalSupply
    );

    event IssuerAuthorized(address indexed issuer, bool authorized);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event DefaultPaymentTokenUpdated(address indexed oldToken, address indexed newToken);

    // ============ Modifiers ============

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender] || msg.sender == owner(), "Not authorized issuer");
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Deploy the factory
     * @param _implementation Address of BrazilianDebentureCloneable implementation
     * @param _oracle Address of BrazilianMacroOracle
     * @param _defaultPaymentToken Default payment token (or address(0))
     */
    constructor(
        address _implementation,
        address _oracle,
        address _defaultPaymentToken
    ) Ownable(msg.sender) {
        require(_implementation != address(0), "Invalid implementation");
        require(_oracle != address(0), "Invalid oracle");

        implementation = _implementation;
        oracle = _oracle;
        defaultPaymentToken = _defaultPaymentToken;

        // Owner is automatically an authorized issuer
        authorizedIssuers[msg.sender] = true;
    }

    // ============ Factory Functions ============

    /**
     * @notice Create a new debenture using Clone pattern
     * @param name Token name
     * @param symbol Token symbol
     * @param terms Debenture terms struct
     * @param paymentToken Payment token (or address(0) for default)
     * @param trustee Trustee address
     * @return debentureAddress Address of the new debenture
     */
    function createDebenture(
        string calldata name,
        string calldata symbol,
        BrazilianDebentureCloneable.DebentureTerms calldata terms,
        address paymentToken,
        address trustee
    ) external onlyAuthorizedIssuer returns (address debentureAddress) {
        // Validation
        require(bytes(terms.isinCode).length == 12, "Invalid ISIN code");
        require(debenturesByISIN[terms.isinCode] == address(0), "ISIN already exists");

        // Use default payment token if none specified
        address token = paymentToken == address(0) ? defaultPaymentToken : paymentToken;
        require(token != address(0), "Payment token required");

        // Trustee defaults to issuer if not specified
        address actualTrustee = trustee == address(0) ? msg.sender : trustee;

        // Create minimal proxy clone
        debentureAddress = implementation.clone();

        // Initialize the clone
        BrazilianDebentureCloneable(debentureAddress).initialize(
            name,
            symbol,
            terms,
            oracle,
            token,
            msg.sender, // issuer is the caller
            actualTrustee
        );

        // Register the debenture
        allDebentures.push(debentureAddress);
        debenturesByISIN[terms.isinCode] = debentureAddress;
        issuerDebentures[msg.sender].push(debentureAddress);

        emit DebentureCreated(
            debentureAddress,
            terms.isinCode,
            name,
            symbol,
            msg.sender,
            terms.vne,
            terms.totalSupplyUnits
        );

        return debentureAddress;
    }

    /**
     * @notice Create debenture with deterministic address using CREATE2
     * @param name Token name
     * @param symbol Token symbol
     * @param terms Debenture terms struct
     * @param paymentToken Payment token address
     * @param trustee Trustee address
     * @param salt Unique salt for CREATE2
     * @return debentureAddress Deterministic address of the new debenture
     */
    function createDeterministicDebenture(
        string calldata name,
        string calldata symbol,
        BrazilianDebentureCloneable.DebentureTerms calldata terms,
        address paymentToken,
        address trustee,
        bytes32 salt
    ) external onlyAuthorizedIssuer returns (address debentureAddress) {
        require(bytes(terms.isinCode).length == 12, "Invalid ISIN code");
        require(debenturesByISIN[terms.isinCode] == address(0), "ISIN already exists");

        address token = paymentToken == address(0) ? defaultPaymentToken : paymentToken;
        require(token != address(0), "Payment token required");

        address actualTrustee = trustee == address(0) ? msg.sender : trustee;

        // Create deterministic clone
        debentureAddress = implementation.cloneDeterministic(salt);

        // Initialize
        BrazilianDebentureCloneable(debentureAddress).initialize(
            name,
            symbol,
            terms,
            oracle,
            token,
            msg.sender,
            actualTrustee
        );

        // Register
        allDebentures.push(debentureAddress);
        debenturesByISIN[terms.isinCode] = debentureAddress;
        issuerDebentures[msg.sender].push(debentureAddress);

        emit DebentureCreated(
            debentureAddress,
            terms.isinCode,
            name,
            symbol,
            msg.sender,
            terms.vne,
            terms.totalSupplyUnits
        );

        return debentureAddress;
    }

    /**
     * @notice Predict deterministic address before deployment
     * @param salt The salt to use for CREATE2
     * @return The address the clone would be deployed to
     */
    function predictDeterministicAddress(bytes32 salt) external view returns (address) {
        return implementation.predictDeterministicAddress(salt);
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize or revoke an issuer
     * @param issuer Address to authorize/revoke
     * @param authorized Whether to authorize
     */
    function setAuthorizedIssuer(address issuer, bool authorized) external onlyOwner {
        authorizedIssuers[issuer] = authorized;
        emit IssuerAuthorized(issuer, authorized);
    }

    /**
     * @notice Batch authorize issuers
     * @param issuers Array of addresses to authorize
     */
    function batchAuthorizeIssuers(address[] calldata issuers) external onlyOwner {
        for (uint256 i = 0; i < issuers.length; i++) {
            authorizedIssuers[issuers[i]] = true;
            emit IssuerAuthorized(issuers[i], true);
        }
    }

    /**
     * @notice Update oracle address
     * @param _oracle New oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        address oldOracle = oracle;
        oracle = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }

    /**
     * @notice Update default payment token
     * @param _token New default payment token
     */
    function setDefaultPaymentToken(address _token) external onlyOwner {
        address oldToken = defaultPaymentToken;
        defaultPaymentToken = _token;
        emit DefaultPaymentTokenUpdated(oldToken, _token);
    }

    // ============ View Functions ============

    /**
     * @notice Get all debentures
     * @return Array of all debenture addresses
     */
    function getAllDebentures() external view returns (address[] memory) {
        return allDebentures;
    }

    /**
     * @notice Get debentures by issuer
     * @param issuer Issuer address
     * @return Array of debenture addresses
     */
    function getIssuerDebentures(address issuer) external view returns (address[] memory) {
        return issuerDebentures[issuer];
    }

    /**
     * @notice Get total number of debentures
     * @return Total count
     */
    function getTotalDebentures() external view returns (uint256) {
        return allDebentures.length;
    }

    /**
     * @notice Check if ISIN exists
     * @param isinCode ISIN to check
     * @return exists Whether ISIN exists
     */
    function isinExists(string calldata isinCode) external view returns (bool) {
        return debenturesByISIN[isinCode] != address(0);
    }

    /**
     * @notice Get debenture info by index
     * @param index Index in allDebentures array
     * @return debentureAddress Address of debenture
     * @return name Token name
     * @return symbol Token symbol
     * @return isinCode ISIN code
     * @return vne VNE value
     * @return totalSupply Total supply
     */
    function getDebentureInfo(uint256 index) external view returns (
        address debentureAddress,
        string memory name,
        string memory symbol,
        string memory isinCode,
        uint256 vne,
        uint256 totalSupply
    ) {
        require(index < allDebentures.length, "Index out of bounds");
        debentureAddress = allDebentures[index];
        BrazilianDebentureCloneable debenture = BrazilianDebentureCloneable(debentureAddress);

        name = debenture.name();
        symbol = debenture.symbol();

        BrazilianDebentureCloneable.DebentureTerms memory terms = debenture.getTerms();
        isinCode = terms.isinCode;
        vne = terms.vne;
        totalSupply = terms.totalSupplyUnits;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title IBrazilianMacroOracle
 * @notice Interface matching BrazilianMacroOracle contract
 */
interface IBrazilianMacroOracleClone {
    function getRate(string calldata rateType) external view returns (
        int256 answer,
        uint256 timestamp,
        uint256 realWorldDate
    );
}

/**
 * @title BrazilianDebentureCloneable
 * @author DELOS Team
 * @notice Cloneable version of BrazilianDebenture for EIP-1167 minimal proxy deployment
 * @dev Uses initialize() instead of constructor to support Clone pattern
 *
 * This is a gas-efficient version designed for factory deployment.
 * Each clone is ~45 bytes vs ~29KB for full contract deployment.
 */
contract BrazilianDebentureCloneable is ERC20, AccessControl, ReentrancyGuard, Pausable, Initializable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant TRUSTEE_ROLE = keccak256("TRUSTEE_ROLE");
    bytes32 public constant WHITELIST_ADMIN_ROLE = keccak256("WHITELIST_ADMIN_ROLE");

    uint256 public constant PRECISION_PU = 1e6;
    uint256 public constant PRECISION_RATE = 1e4;
    uint256 public constant PRECISION_PERCENT_DI = 1e2;
    uint256 public constant BUSINESS_DAYS_YEAR = 252;

    // ERC-1404 Transfer Restriction Codes
    uint8 public constant SUCCESS = 0;
    uint8 public constant NOT_WHITELISTED = 1;
    uint8 public constant PAUSED = 2;
    uint8 public constant BLACKLISTED = 3;
    uint8 public constant LOCK_UP_PERIOD = 4;

    // ============ Enums ============

    enum RateType { PRE, DI_SPREAD, DI_PERCENT, IPCA_SPREAD, IGPM_SPREAD }
    enum AmortizationType { PERCENT_VNE, PERCENT_VNA, FIXED_VALUE }
    enum DebentureStatus { ACTIVE, MATURED, DEFAULTED, REDEEMED }

    // ============ Structs ============

    struct DebentureTerms {
        uint256 vne;                    // Valor Nominal de Emissão (6 decimals)
        uint256 totalSupplyUnits;       // Number of units issued
        uint256 issueDate;              // Emission date timestamp
        uint256 maturityDate;           // Maturity date timestamp
        uint8 anniversaryDay;           // Day of month for IPCA anniversary (1-31)
        uint256 lockUpEndDate;          // Lock-up period end timestamp
        RateType rateType;              // Indexation type
        uint256 fixedRate;              // Fixed rate or spread (4 decimals, basis points)
        uint8 percentDI;                // % of DI if DI_PERCENT type (2 decimals)
        uint256 couponFrequencyDays;    // Days between coupon payments
        AmortizationType amortType;     // Amortization calculation basis
        string isinCode;                // ISIN code (12 chars)
        string cetipCode;               // CETIP/B3 code
        string series;                  // Series identifier
        bool hasRepactuacao;            // Has repactuation clause
        bool hasEarlyRedemption;        // Has early redemption clause
        bytes32 comboId;                // Combo series identifier (0 if standalone)
    }

    struct VNARecord {
        uint256 value;                  // Current VNA value (6 decimals)
        uint256 lastUpdateDate;         // Last update timestamp
        uint256 lastIndexValue;         // Last IPCA/IGPM index value used
        uint256 accumulatedFactor;      // Factor C accumulation (8 decimals)
    }

    struct AmortizationSchedule {
        uint256 date;                   // Payment date timestamp
        uint256 percentOrValue;         // Percentage (4 decimals) or fixed value (6 decimals)
        bool executed;                  // Whether amortization has been executed
    }

    struct CouponRecord {
        uint256 date;                   // Record date
        uint256 puPerUnit;              // PU per unit at record date (6 decimals)
        uint256 totalAmount;            // Total coupon amount
        bool distributed;               // Whether distributed to holders
    }

    // ============ State Variables ============

    string private _tokenName;
    string private _tokenSymbol;
    bool private _initialized;

    DebentureTerms public terms;
    IBrazilianMacroOracleClone public oracle;
    IERC20 public paymentToken;
    address public issuer;
    address public trustee;
    DebentureStatus public status;
    VNARecord public vnaRecord;

    // DI Factor tracking
    uint256 public accumulatedDIFactor;
    uint256 public lastDIUpdateDate;

    // Amortization
    AmortizationSchedule[] public amortizationSchedule;
    uint256 public totalAmortized;

    // Coupons
    CouponRecord[] public couponRecords;
    mapping(address => mapping(uint256 => bool)) public couponClaimed;

    // Whitelist
    mapping(address => bool) public whitelist;
    mapping(address => bool) public blacklist;

    // ============ Events ============

    event DebentureInitialized(string indexed isinCode, uint256 vne, uint256 totalSupply, RateType rateType);
    event WhitelistUpdated(address indexed account, bool status);
    event BlacklistUpdated(address indexed account, bool status);
    event CouponRecorded(uint256 indexed couponIndex, uint256 puPerUnit, uint256 totalAmount);
    event CouponClaimed(address indexed holder, uint256 indexed couponIndex, uint256 amount);
    event AmortizationExecuted(uint256 indexed scheduleIndex, uint256 amount);
    event VNAUpdated(uint256 newValue, uint256 indexValue, uint256 factor);
    event StatusChanged(DebentureStatus oldStatus, DebentureStatus newStatus);

    // ============ Constructor (disabled for clones) ============

    constructor() ERC20("", "") {
        // Disable initialization for implementation contract
        _disableInitializers();
    }

    // ============ Initializer (used by clones) ============

    /**
     * @notice Initialize a new debenture clone
     * @param initName Token name
     * @param initSymbol Token symbol
     * @param initTerms Debenture terms
     * @param initOracle Oracle address
     * @param initPaymentToken Payment token address
     * @param initIssuer Issuer address
     * @param initTrustee Trustee address
     */
    function initialize(
        string memory initName,
        string memory initSymbol,
        DebentureTerms memory initTerms,
        address initOracle,
        address initPaymentToken,
        address initIssuer,
        address initTrustee
    ) external initializer {
        require(bytes(initName).length > 0, "Name required");
        require(bytes(initSymbol).length > 0, "Symbol required");
        require(initTerms.vne > 0, "VNE must be positive");
        require(initTerms.totalSupplyUnits > 0, "Supply must be positive");
        require(initTerms.maturityDate > block.timestamp, "Invalid maturity");
        require(initTerms.couponFrequencyDays > 0, "Invalid coupon frequency");
        require(initOracle != address(0), "Invalid oracle");
        require(initPaymentToken != address(0), "Invalid payment token");
        require(initIssuer != address(0), "Invalid issuer");

        _tokenName = initName;
        _tokenSymbol = initSymbol;
        terms = initTerms;
        oracle = IBrazilianMacroOracleClone(initOracle);
        paymentToken = IERC20(initPaymentToken);
        issuer = initIssuer;
        trustee = initTrustee;
        status = DebentureStatus.ACTIVE;

        // Initialize VNA = VNE
        vnaRecord = VNARecord({
            value: initTerms.vne,
            lastUpdateDate: block.timestamp,
            lastIndexValue: 0,
            accumulatedFactor: 1e8
        });

        // Initialize DI factor if needed
        if (initTerms.rateType == RateType.DI_SPREAD || initTerms.rateType == RateType.DI_PERCENT) {
            accumulatedDIFactor = 1e9;
            lastDIUpdateDate = block.timestamp;
        }

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, initIssuer);
        _grantRole(ADMIN_ROLE, initIssuer);
        _grantRole(ISSUER_ROLE, initIssuer);
        _grantRole(TRUSTEE_ROLE, initTrustee);
        _grantRole(WHITELIST_ADMIN_ROLE, initIssuer);
        _grantRole(WHITELIST_ADMIN_ROLE, initTrustee);

        // Whitelist issuer and trustee
        whitelist[initIssuer] = true;
        whitelist[initTrustee] = true;

        // Mint tokens to issuer
        _mint(initIssuer, initTerms.totalSupplyUnits);

        _initialized = true;

        emit DebentureInitialized(initTerms.isinCode, initTerms.vne, initTerms.totalSupplyUnits, initTerms.rateType);
    }

    // ============ ERC20 Overrides ============

    function name() public view virtual override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view virtual override returns (string memory) {
        return _tokenSymbol;
    }

    function decimals() public pure virtual override returns (uint8) {
        return 0; // Debentures are whole units
    }

    // ============ ERC-1404 Transfer Restrictions ============

    function detectTransferRestriction(address from, address to, uint256) public view returns (uint8) {
        if (paused()) return PAUSED;
        if (blacklist[from] || blacklist[to]) return BLACKLISTED;
        if (!whitelist[from] || !whitelist[to]) return NOT_WHITELISTED;
        if (block.timestamp < terms.lockUpEndDate && from != issuer) return LOCK_UP_PERIOD;
        return SUCCESS;
    }

    function messageForTransferRestriction(uint8 restrictionCode) public pure returns (string memory) {
        if (restrictionCode == SUCCESS) return "Transfer allowed";
        if (restrictionCode == NOT_WHITELISTED) return "Sender or receiver not whitelisted";
        if (restrictionCode == PAUSED) return "Transfers are paused";
        if (restrictionCode == BLACKLISTED) return "Sender or receiver is blacklisted";
        if (restrictionCode == LOCK_UP_PERIOD) return "Lock-up period active";
        return "Unknown restriction";
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (from != address(0) && to != address(0)) {
            uint8 restrictionCode = detectTransferRestriction(from, to, value);
            require(restrictionCode == SUCCESS, messageForTransferRestriction(restrictionCode));
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

    function addToBlacklist(address account) external onlyRole(ADMIN_ROLE) {
        blacklist[account] = true;
        emit BlacklistUpdated(account, true);
    }

    function removeFromBlacklist(address account) external onlyRole(ADMIN_ROLE) {
        blacklist[account] = false;
        emit BlacklistUpdated(account, false);
    }

    function batchAddToWhitelist(address[] calldata accounts) external onlyRole(WHITELIST_ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = true;
            emit WhitelistUpdated(accounts[i], true);
        }
    }

    // ============ Coupon Functions ============

    function recordCoupon(uint256 puPerUnit, uint256 totalAmount) external onlyRole(ISSUER_ROLE) {
        require(status == DebentureStatus.ACTIVE, "Debenture not active");

        couponRecords.push(CouponRecord({
            date: block.timestamp,
            puPerUnit: puPerUnit,
            totalAmount: totalAmount,
            distributed: false
        }));

        emit CouponRecorded(couponRecords.length - 1, puPerUnit, totalAmount);
    }

    function claimCoupon(uint256 couponIndex) external nonReentrant {
        require(couponIndex < couponRecords.length, "Invalid coupon index");
        require(!couponClaimed[msg.sender][couponIndex], "Already claimed");
        require(whitelist[msg.sender], "Not whitelisted");

        CouponRecord storage coupon = couponRecords[couponIndex];
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No holdings");

        uint256 payment = (balance * coupon.puPerUnit) / PRECISION_PU;
        require(payment > 0, "Nothing to claim");

        couponClaimed[msg.sender][couponIndex] = true;
        paymentToken.safeTransfer(msg.sender, payment);

        emit CouponClaimed(msg.sender, couponIndex, payment);
    }

    function claimAllCoupons() external nonReentrant {
        require(whitelist[msg.sender], "Not whitelisted");
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No holdings");

        uint256 totalPayment = 0;

        for (uint256 i = 0; i < couponRecords.length; i++) {
            if (!couponClaimed[msg.sender][i]) {
                CouponRecord storage coupon = couponRecords[i];
                uint256 payment = (balance * coupon.puPerUnit) / PRECISION_PU;
                if (payment > 0) {
                    couponClaimed[msg.sender][i] = true;
                    totalPayment += payment;
                    emit CouponClaimed(msg.sender, i, payment);
                }
            }
        }

        require(totalPayment > 0, "Nothing to claim");
        paymentToken.safeTransfer(msg.sender, totalPayment);
    }

    // ============ Amortization ============

    function setAmortizationSchedule(AmortizationSchedule[] calldata schedule) external onlyRole(ISSUER_ROLE) {
        delete amortizationSchedule;
        for (uint256 i = 0; i < schedule.length; i++) {
            amortizationSchedule.push(schedule[i]);
        }
    }

    function executeAmortization(uint256 scheduleIndex) external onlyRole(ISSUER_ROLE) nonReentrant {
        require(scheduleIndex < amortizationSchedule.length, "Invalid schedule index");
        AmortizationSchedule storage schedule = amortizationSchedule[scheduleIndex];
        require(!schedule.executed, "Already executed");
        require(block.timestamp >= schedule.date, "Not yet due");

        uint256 amortAmount;
        if (terms.amortType == AmortizationType.PERCENT_VNE) {
            amortAmount = (terms.vne * schedule.percentOrValue) / PRECISION_RATE;
        } else if (terms.amortType == AmortizationType.PERCENT_VNA) {
            amortAmount = (vnaRecord.value * schedule.percentOrValue) / PRECISION_RATE;
        } else {
            amortAmount = schedule.percentOrValue;
        }

        schedule.executed = true;
        totalAmortized += amortAmount;
        vnaRecord.value -= amortAmount;

        emit AmortizationExecuted(scheduleIndex, amortAmount);
    }

    // ============ Status Management ============

    function declareMaturity() external onlyRole(TRUSTEE_ROLE) {
        require(block.timestamp >= terms.maturityDate, "Not yet mature");
        require(status == DebentureStatus.ACTIVE, "Not active");

        DebentureStatus oldStatus = status;
        status = DebentureStatus.MATURED;
        emit StatusChanged(oldStatus, status);
    }

    function declareDefault() external onlyRole(TRUSTEE_ROLE) {
        require(status == DebentureStatus.ACTIVE, "Not active");

        DebentureStatus oldStatus = status;
        status = DebentureStatus.DEFAULTED;
        emit StatusChanged(oldStatus, status);
    }

    function earlyRedemption() external onlyRole(ISSUER_ROLE) {
        require(terms.hasEarlyRedemption, "No early redemption clause");
        require(status == DebentureStatus.ACTIVE, "Not active");

        DebentureStatus oldStatus = status;
        status = DebentureStatus.REDEEMED;
        emit StatusChanged(oldStatus, status);
    }

    // ============ Admin Functions ============

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function depositPaymentTokens(uint256 amount) external {
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawPaymentTokens(uint256 amount) external onlyRole(ISSUER_ROLE) {
        paymentToken.safeTransfer(issuer, amount);
    }

    // ============ View Functions ============

    function getTerms() external view returns (DebentureTerms memory) {
        return terms;
    }

    function getVNA() external view returns (VNARecord memory) {
        return vnaRecord;
    }

    function getCouponCount() external view returns (uint256) {
        return couponRecords.length;
    }

    function getAmortizationScheduleLength() external view returns (uint256) {
        return amortizationSchedule.length;
    }

    function getPendingClaims(address holder) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < couponRecords.length; i++) {
            if (!couponClaimed[holder][i]) count++;
        }

        uint256[] memory pending = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < couponRecords.length; i++) {
            if (!couponClaimed[holder][i]) {
                pending[index] = i;
                index++;
            }
        }
        return pending;
    }

    function isInitialized() external view returns (bool) {
        return _initialized;
    }

    // ============ ERC-165 ============

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return
            interfaceId == 0xb0146e63 || // ERC-1404
            super.supportsInterface(interfaceId);
    }
}

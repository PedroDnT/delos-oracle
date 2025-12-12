// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BrazilianDebenture.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DebentureFactory
 * @author Pedro Todescan
 * @notice Factory for deploying BrazilianDebenture contracts
 * @dev Manages debenture issuance, registry, and configuration templates
 */
contract DebentureFactory is Ownable {

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

    event TemplateUpdated(
        string indexed templateId,
        uint256 couponFrequencyDays,
        BrazilianDebenture.AmortizationType amortType
    );

    event TemplateDeleted(string indexed templateId);

    // ============ Structs ============

    /**
     * @notice Template for standardized debenture configurations
     */
    struct DebentureTemplate {
        string name;
        string description;
        uint256 couponFrequencyDays;
        BrazilianDebenture.AmortizationType amortType;
        bool isActive;
        uint256 createdAt;
    }

    /**
     * @notice Registry entry for created debentures
     */
    struct DebentureRegistry {
        address debentureAddress;
        address issuer;
        string isinCode;
        uint256 createdAt;
        bool isActive;
    }

    // ============ State Variables ============

    IBrazilianMacroOracle public oracle;
    address public defaultPaymentToken;

    // ISIN Code => Debenture Address mapping
    mapping(string => address) public debenturesByISIN;

    // Issuer => Array of debenture addresses
    mapping(address => address[]) public issuerDebentures;

    // Template ID => Template configuration
    mapping(string => DebentureTemplate) public templates;
    string[] public templateIds;

    // All debentures ever created
    address[] public allDebentures;

    // ============ Constructor ============

    /**
     * @notice Initialize factory with oracle and optional payment token
     * @param _oracle Address of BrazilianMacroOracle contract
     * @param _defaultPaymentToken Default payment token (can be address(0))
     */
    constructor(address _oracle, address _defaultPaymentToken) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");

        oracle = IBrazilianMacroOracle(_oracle);
        defaultPaymentToken = _defaultPaymentToken;
    }

    // ============ Debenture Creation ============

    /**
     * @notice Create a new debenture
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _terms Debenture terms (rates, dates, amounts)
     * @param _paymentToken ERC20 token for payments (if address(0), use default)
     * @param _trustee Address of trustee (if address(0), issuer acts as trustee)
     * @return debentureAddress Address of newly created debenture
     */
    function createDebenture(
        string memory _name,
        string memory _symbol,
        BrazilianDebenture.DebentureTerms memory _terms,
        address _paymentToken,
        address _trustee
    ) public returns (address debentureAddress) {
        // Validate inputs
        require(bytes(_name).length > 0, "Invalid name");
        require(bytes(_symbol).length > 0, "Invalid symbol");
        require(bytes(_terms.isinCode).length == 12, "Invalid ISIN code");
        require(debenturesByISIN[_terms.isinCode] == address(0), "ISIN already issued");

        // Use provided payment token or default
        address paymentToken = _paymentToken != address(0) ? _paymentToken : defaultPaymentToken;
        require(paymentToken != address(0), "No payment token specified");

        // Use issuer as trustee if not specified
        address trustee = _trustee != address(0) ? _trustee : msg.sender;

        // Deploy new debenture
        BrazilianDebenture debenture = new BrazilianDebenture(
            _name,
            _symbol,
            _terms,
            address(oracle),
            paymentToken,
            msg.sender,  // issuer is msg.sender
            trustee
        );

        debentureAddress = address(debenture);

        // Register debenture
        debenturesByISIN[_terms.isinCode] = debentureAddress;
        issuerDebentures[msg.sender].push(debentureAddress);
        allDebentures.push(debentureAddress);

        emit DebentureCreated(
            debentureAddress,
            _terms.isinCode,
            _name,
            _symbol,
            msg.sender,
            _terms.vne,
            _terms.totalSupplyUnits
        );
    }

    /**
     * @notice Create debenture using a template
     * @param _templateId Template identifier
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _terms Partial terms (couponFrequencyDays and amortType will be from template)
     * @param _paymentToken ERC20 token for payments
     * @return debentureAddress Address of newly created debenture
     */
    function createDebentureFromTemplate(
        string memory _templateId,
        string memory _name,
        string memory _symbol,
        BrazilianDebenture.DebentureTerms memory _terms,
        address _paymentToken
    ) external returns (address debentureAddress) {
        DebentureTemplate memory template = templates[_templateId];
        require(template.isActive, "Invalid or inactive template");

        // Apply template configurations
        _terms.couponFrequencyDays = template.couponFrequencyDays;
        _terms.amortType = template.amortType;

        return createDebenture(_name, _symbol, _terms, _paymentToken, address(0));
    }

    // ============ Template Management ============

    /**
     * @notice Create or update a debenture template
     * @param _templateId Unique template identifier
     * @param _name Template name
     * @param _description Template description
     * @param _couponFrequencyDays Coupon payment frequency (e.g., 126, 180, 252 days)
     * @param _amortType Amortization type
     */
    function upsertTemplate(
        string memory _templateId,
        string memory _name,
        string memory _description,
        uint256 _couponFrequencyDays,
        BrazilianDebenture.AmortizationType _amortType
    ) external onlyOwner {
        require(bytes(_templateId).length > 0, "Invalid template ID");
        require(_couponFrequencyDays > 0, "Invalid coupon frequency");

        bool isNew = templates[_templateId].createdAt == 0;

        templates[_templateId] = DebentureTemplate({
            name: _name,
            description: _description,
            couponFrequencyDays: _couponFrequencyDays,
            amortType: _amortType,
            isActive: true,
            createdAt: isNew ? block.timestamp : templates[_templateId].createdAt
        });

        if (isNew) {
            templateIds.push(_templateId);
        }

        emit TemplateUpdated(_templateId, _couponFrequencyDays, _amortType);
    }

    /**
     * @notice Deactivate a template
     * @param _templateId Template identifier to deactivate
     */
    function deactivateTemplate(string memory _templateId) external onlyOwner {
        require(templates[_templateId].createdAt != 0, "Template not found");
        templates[_templateId].isActive = false;
        emit TemplateDeleted(_templateId);
    }

    /**
     * @notice Reactivate a template
     * @param _templateId Template identifier to reactivate
     */
    function reactivateTemplate(string memory _templateId) external onlyOwner {
        require(templates[_templateId].createdAt != 0, "Template not found");
        templates[_templateId].isActive = true;
    }

    // ============ Oracle Management ============

    /**
     * @notice Update oracle address (for migrations)
     * @param _newOracle New oracle address
     */
    function setOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid oracle");
        oracle = IBrazilianMacroOracle(_newOracle);
    }

    /**
     * @notice Update default payment token
     * @param _newPaymentToken New default payment token
     */
    function setDefaultPaymentToken(address _newPaymentToken) external onlyOwner {
        require(_newPaymentToken != address(0), "Invalid payment token");
        defaultPaymentToken = _newPaymentToken;
    }

    // ============ Query Functions ============

    /**
     * @notice Get debenture address by ISIN code
     * @param _isinCode ISIN code
     * @return Debenture address (or zero address if not found)
     */
    function getDebentureByISIN(string memory _isinCode) external view returns (address) {
        return debenturesByISIN[_isinCode];
    }

    /**
     * @notice Get all debentures issued by an issuer
     * @param _issuer Issuer address
     * @return Array of debenture addresses
     */
    function getIssuerDebentures(address _issuer) external view returns (address[] memory) {
        return issuerDebentures[_issuer];
    }

    /**
     * @notice Get total number of debentures created
     * @return Total count
     */
    function getDebentureCount() external view returns (uint256) {
        return allDebentures.length;
    }

    /**
     * @notice Get debenture at index
     * @param _index Array index
     * @return Debenture address
     */
    function getDebentureAtIndex(uint256 _index) external view returns (address) {
        require(_index < allDebentures.length, "Index out of bounds");
        return allDebentures[_index];
    }

    /**
     * @notice Get template by ID
     * @param _templateId Template identifier
     * @return Template struct
     */
    function getTemplate(string memory _templateId) external view returns (DebentureTemplate memory) {
        return templates[_templateId];
    }

    /**
     * @notice Get all template IDs
     * @return Array of template identifiers
     */
    function getAllTemplateIds() external view returns (string[] memory) {
        return templateIds;
    }

    /**
     * @notice Get total number of templates
     * @return Total count
     */
    function getTemplateCount() external view returns (uint256) {
        return templateIds.length;
    }
}

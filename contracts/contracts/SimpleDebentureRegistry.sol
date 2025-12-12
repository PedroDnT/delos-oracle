// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BrazilianDebenture.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleDebentureRegistry
 * @notice Registry that can deploy AND track debentures
 * @dev Simplified version of DebentureFactory with only essential features
 */
contract SimpleDebentureRegistry is Ownable {

    // Oracle address
    address public oracle;

    // Default payment token (can be address(0))
    address public defaultPaymentToken;

    // Array of all registered debenture addresses
    address[] public allDebentures;

    // Mapping from ISIN to debenture address
    mapping(string => address) public debenturesByISIN;

    // Mapping from issuer to their debentures
    mapping(address => address[]) public issuerDebentures;

    event DebentureCreated(
        address indexed debentureAddress,
        string indexed isinCode,
        string name,
        string symbol,
        address indexed issuer,
        uint256 vne,
        uint256 totalSupply
    );

    event DebentureRegistered(
        address indexed debentureAddress,
        string indexed isinCode,
        address indexed issuer
    );

    constructor(address _oracle, address _defaultPaymentToken) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle address");
        oracle = _oracle;
        defaultPaymentToken = _defaultPaymentToken;
    }

    /**
     * @notice Create and deploy a new BrazilianDebenture
     * @param name Debenture name
     * @param symbol Debenture symbol
     * @param terms Debenture terms struct
     * @param paymentToken Payment token address (or address(0) for default)
     * @param trustee Trustee address
     */
    function createDebenture(
        string calldata name,
        string calldata symbol,
        BrazilianDebenture.DebentureTerms calldata terms,
        address paymentToken,
        address trustee
    ) external returns (address) {
        require(bytes(terms.isinCode).length == 12, "Invalid ISIN code");
        require(debenturesByISIN[terms.isinCode] == address(0), "ISIN already exists");

        // Use default payment token if none specified
        address token = paymentToken == address(0) ? defaultPaymentToken : paymentToken;

        // Deploy new debenture
        // Constructor order: name, symbol, terms, oracle, paymentToken, issuer, trustee
        BrazilianDebenture debenture = new BrazilianDebenture(
            name,
            symbol,
            terms,
            oracle,
            token,
            msg.sender,  // issuer is the caller
            trustee
        );

        address debentureAddress = address(debenture);

        // Register it
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
     * @notice Register a manually deployed debenture
     * @param debentureAddress Address of the deployed debenture
     * @param isinCode ISIN code of the debenture
     * @param issuer Address of the issuer
     */
    function registerDebenture(
        address debentureAddress,
        string calldata isinCode,
        address issuer
    ) external onlyOwner {
        require(debentureAddress != address(0), "Invalid debenture address");
        require(bytes(isinCode).length == 12, "Invalid ISIN code");
        require(debenturesByISIN[isinCode] == address(0), "ISIN already registered");

        allDebentures.push(debentureAddress);
        debenturesByISIN[isinCode] = debentureAddress;
        issuerDebentures[issuer].push(debentureAddress);

        emit DebentureRegistered(debentureAddress, isinCode, issuer);
    }

    /**
     * @notice Get all registered debentures
     */
    function getAllDebentures() external view returns (address[] memory) {
        return allDebentures;
    }

    /**
     * @notice Get debentures by issuer
     */
    function getIssuerDebentures(address issuer) external view returns (address[] memory) {
        return issuerDebentures[issuer];
    }

    /**
     * @notice Get total number of registered debentures
     */
    function getTotalDebentures() external view returns (uint256) {
        return allDebentures.length;
    }
}

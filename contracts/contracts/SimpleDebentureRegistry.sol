// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleDebentureRegistry
 * @notice Lightweight registry for tracking manually deployed debentures
 * @dev This is a workaround for the DebentureFactory size issue
 */
contract SimpleDebentureRegistry is Ownable {

    // Oracle address
    address public oracle;

    // Array of all registered debenture addresses
    address[] public allDebentures;

    // Mapping from ISIN to debenture address
    mapping(string => address) public debenturesByISIN;

    // Mapping from issuer to their debentures
    mapping(address => address[]) public issuerDebentures;

    event DebentureRegistered(
        address indexed debentureAddress,
        string indexed isinCode,
        address indexed issuer
    );

    constructor(address _oracle) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle address");
        oracle = _oracle;
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

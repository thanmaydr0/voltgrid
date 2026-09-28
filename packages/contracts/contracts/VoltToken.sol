// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title VoltCredit (VLT)
/// @notice A demo-only settlement token. One VLT models one rupee in the
///         simulated market; it is not a claim on fiat or energy.
contract VoltToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public constant FAUCET_AMOUNT = 100 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastFaucetAt;
    mapping(address => bool) public hasClaimedFaucet;

    event FaucetClaimed(address indexed account, uint256 amountWei, uint256 nextAvailableAt);

    constructor(address admin) ERC20("VoltCredit", "VLT") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amountWei) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amountWei);
    }

    /// @notice Fixed demo faucet, rate limited per address. This is not a
    ///         production token distribution mechanism.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (hasClaimedFaucet[msg.sender] && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }

        uint256 nextAvailableAt = block.timestamp + FAUCET_COOLDOWN;
        lastFaucetAt[msg.sender] = block.timestamp;
        hasClaimedFaucet[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT, nextAvailableAt);
    }

    error ZeroAddress();
    error FaucetCooldown(uint256 nextAvailableAt);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IMarketWithdraw {
    function withdraw(uint256 amountWei) external;
}

/// @dev Test-only token which attempts a callback during transferFrom.
contract ReentrantToken is ERC20 {
    address public callbackTarget;
    uint256 public callbackAmount;
    bool public callbackEnabled;

    constructor() ERC20("Reentrant Test Token", "RTT") {}

    function mint(address to, uint256 amountWei) external {
        _mint(to, amountWei);
    }

    function configureCallback(address target, uint256 amountWei, bool enabled) external {
        callbackTarget = target;
        callbackAmount = amountWei;
        callbackEnabled = enabled;
    }

    function transferFrom(address from, address to, uint256 value)
        public
        override
        returns (bool)
    {
        bool result = super.transferFrom(from, to, value);
        if (callbackEnabled) {
            callbackEnabled = false;
            IMarketWithdraw(callbackTarget).withdraw(callbackAmount);
        }
        return result;
    }
}

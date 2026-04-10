// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev Mock USDC token for testing EscrowManager
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mints USDC tokens to an arbitrary address for test setup.
     * @param to     Recipient address.
     * @param amount Token amount in 6-decimal USDC units.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Mock VRF contract for future Chainlink VRF integration
 * Currently unused. If implementing Chainlink VRF for production-grade randomness,
 * replace the _assignVerifier() function in EscrowManager to call this contract.
 */
contract MockVRF {
    // Placeholder for VRF coordinator interface
    // Production: inherit from VRFConsumerBaseV2
}

import { IPFS_GATEWAY, USDC_DECIMALS_FACTOR } from "../config/api";

/**
 * Builds the full HTTPS URL for an IPFS CID via the configured gateway.
 *
 * @param {string} cid - IPFS content identifier.
 * @returns {string} Full gateway URL.
 */
export const ipfsUrl = (cid) => `${IPFS_GATEWAY}/${cid}`;

/**
 * Converts a raw 6-decimal USDC contract value to a human-readable string.
 *
 * @param {bigint|number|string} raw - Raw USDC value from the contract.
 * @returns {string} Formatted value with two decimal places (e.g. "1500.00").
 */
export const formatUSDC = (raw) => (Number(raw) / USDC_DECIMALS_FACTOR).toFixed(2);

/**
 * Returns the current Unix timestamp in whole seconds.
 *
 * @returns {number}
 */
export const nowSeconds = () => Math.floor(Date.now() / 1000);

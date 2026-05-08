/**
 * Ethereum RPC Helpers
 * Ethereum-specific helpers: balance, gas, fee history.
 */

'use strict';

import { rpcCall } from './client.js';
import { priceCache } from '../price/cache.js';
import { formatEth, formatUsd, formatToken } from '../utils/format.js';
import { KNOWN_TOKENS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Get native ETH balance for an address.
 * @param {string} address
 * @returns {Promise<bigint>} Balance in wei
 */
export async function getEthBalance(address) {
  const hex = await rpcCall('eth_getBalance', [address, 'latest']);
  return BigInt(hex);
}

/**
 * Get current gas price.
 * @returns {Promise<bigint>} Gas price in wei
 */
export async function getGasPrice() {
  const hex = await rpcCall('eth_gasPrice');
  return BigInt(hex);
}

/**
 * Get current base fee from the latest block.
 * @returns {Promise<bigint>} Base fee in wei
 */
export async function getBaseFee() {
  const block = await rpcCall('eth_getBlockByNumber', ['latest', false]);
  return BigInt(block.baseFeePerGas || '0x0');
}

/**
 * Estimate gas for a transaction.
 * @param {object} tx
 * @returns {Promise<bigint>}
 */
export async function estimateGas(tx) {
  const hex = await rpcCall('eth_estimateGas', [tx]);
  return BigInt(hex);
}

/**
 * Balance query intent handler.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleBalanceQuery(message, context) {
  const address = await wallet.address();
  const ethBalanceWei = await getEthBalance(address);
  const ethPrice = await priceCache.get('ETH/USD');

  const ethBalance = Number(ethBalanceWei) / 1e18;
  const ethValueUsd = ethBalance * ethPrice;

  const tokenLines = [];
  let totalUsd = ethValueUsd;

  // Check known ERC-20 tokens
  for (const token of KNOWN_TOKENS) {
    try {
      const balHex = await rpcCall('eth_call', [{
        to: token.address,
        data: `0x70a08231000000000000000000000000${address.slice(2)}`,
      }, 'latest']);
      const balance = parseInt(balHex, 16) / Math.pow(10, token.decimals);
      if (balance > 0) {
        const tokenPrice = await priceCache.get(`${token.symbol}/USD`).catch(() => 0);
        const usd = balance * tokenPrice;
        totalUsd += usd;
        tokenLines.push(`• ${formatToken(balance, token.symbol, token.decimals).padEnd(24)} (${formatUsd(usd)})`);
      }
    } catch (err) {
      logger.debug('Token balance check failed', { symbol: token.symbol, error: err.message });
    }
  }

  const lines = [
    `• ${formatToken(ethBalance, 'ETH').padEnd(24)} (${formatUsd(ethValueUsd)})`,
    ...tokenLines,
    `${'─'.repeat(40)}`,
    `  Total:                   ${formatUsd(totalUsd)}`,
  ];

  return {
    text: `Your portfolio:\n${lines.join('\n')}\n\nWant me to do anything with this?`,
  };
}

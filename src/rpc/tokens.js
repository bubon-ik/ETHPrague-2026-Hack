/**
 * ERC-20 Token Balance Enumeration
 * Checks balances for all known tokens on the connected network.
 */

'use strict';

import { rpcCall } from './client.js';
import { KNOWN_TOKENS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/** ERC-20 balanceOf(address) selector */
const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * Enumerate ERC-20 token balances for a given address.
 * @param {string} address - Wallet address
 * @returns {Promise<Array<{symbol: string, balance: number, decimals: number, address: string}>>}
 */
export async function enumerateTokenBalances(address) {
  const paddedAddress = address.slice(2).padStart(64, '0');
  const results = [];

  for (const token of KNOWN_TOKENS) {
    try {
      const data = `${BALANCE_OF_SELECTOR}${paddedAddress}`;
      const hex = await rpcCall('eth_call', [{ to: token.address, data }, 'latest']);
      const balance = parseInt(hex, 16) / Math.pow(10, token.decimals);

      if (balance > 0) {
        results.push({
          symbol: token.symbol,
          balance,
          decimals: token.decimals,
          address: token.address,
        });
      }
    } catch (err) {
      logger.debug('Token balance enumeration failed', { symbol: token.symbol, error: err.message });
    }
  }

  return results;
}

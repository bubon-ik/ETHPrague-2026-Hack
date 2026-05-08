/**
 * RPC Client — Firmware Bridge
 * Thin wrapper around firmware rpc.call() with retry, error handling, and logging.
 */

'use strict';

import { logger } from '../utils/logger.js';
import { DEFAULT_HISTORY_LIMIT } from '../utils/constants.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

/**
 * Make a JSON-RPC call with automatic retry.
 * @param {string} method
 * @param {any[]} params
 * @returns {Promise<any>}
 */
export async function rpcCall(method, params = []) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await rpc.call(method, params);
      logger.debug('RPC call succeeded', { method });
      return result;
    } catch (err) {
      lastError = err;
      logger.warn('RPC call failed', { method, attempt, error: err.message });
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(`RPC call "${method}" failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`);
}

/**
 * Fetch transaction history handler (for intent dispatch).
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleHistoryQuery(message, context) {
  // Extract limit from message (e.g. "last 5 transactions")
  const limitMatch = message.match(/last\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : DEFAULT_HISTORY_LIMIT;

  const address = await wallet.address();
  const txs = await history.get(address, limit);

  if (!txs || txs.length === 0) {
    return { text: 'No recent transactions found.' };
  }

  const lines = txs.map((tx, i) => formatTxLine(tx, i + 1));
  return {
    text: `📜 Recent Transactions (last ${txs.length})\n──────────────────────\n${lines.join('\n')}`,
  };
}

function formatTxLine(tx, index) {
  const icons = { send: '↗', receive: '↙', swap: '🔄', ens: '🔷' };
  const icon = icons[tx.type] || '•';
  const status = tx.status === 'confirmed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
  return `${index}. ${icon} ${tx.type.charAt(0).toUpperCase() + tx.type.slice(1).padEnd(8)} ${tx.amount} ${tx.asset}  ${tx.counterparty}  ${tx.date}  ${status}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

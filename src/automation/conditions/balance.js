/**
 * Balance Condition Evaluator
 * Checks if a token balance crosses a threshold.
 */

'use strict';

import { getEthBalance } from '../../rpc/eth.js';
import { rpcCall } from '../../rpc/client.js';
import { KNOWN_TOKENS } from '../../utils/constants.js';

/**
 * Evaluate a balance condition.
 * @param {{ asset: string, op: string, value: number }} condition
 * @returns {Promise<boolean>}
 */
export async function evaluateBalanceCondition(condition) {
  const address = await wallet.address();
  const balance = await getBalance(condition.asset, address);
  return compare(balance, condition.op, condition.value);
}

async function getBalance(asset, address) {
  if (asset === 'ETH') {
    const wei = await getEthBalance(address);
    return Number(wei) / 1e18;
  }

  const token = KNOWN_TOKENS.find((t) => t.symbol === asset);
  if (!token) { return 0; }

  const paddedAddress = address.slice(2).padStart(64, '0');
  const hex = await rpcCall('eth_call', [{
    to: token.address,
    data: `0x70a08231${paddedAddress}`,
  }, 'latest']);

  return parseInt(hex, 16) / Math.pow(10, token.decimals);
}

function compare(a, op, b) {
  switch (op) {
    case '<':  return a < b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '>=': return a >= b;
    default:   return false;
  }
}

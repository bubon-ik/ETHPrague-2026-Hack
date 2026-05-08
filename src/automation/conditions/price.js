/**
 * Price Condition Evaluator
 * Checks if an asset price crosses a threshold.
 */

'use strict';

import { priceCache } from '../../price/cache.js';

/**
 * Evaluate a price condition.
 * @param {{ asset: string, op: string, value: number }} condition
 * @returns {Promise<boolean>}
 */
export async function evaluatePriceCondition(condition) {
  const currentPrice = await priceCache.get(`${condition.asset}/USD`);
  return compare(currentPrice, condition.op, condition.value);
}

function compare(a, op, b) {
  switch (op) {
    case '<':  return a < b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    default:   return false;
  }
}

/**
 * Price Oracle Wrapper
 * Wraps firmware price.get() with caching and formatting.
 */

'use strict';

import { priceCache } from './cache.js';
import { formatPrice, formatPctChange } from '../utils/format.js';
import { SUPPORTED_PRICE_SYMBOLS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Get the current price for a symbol pair.
 * @param {string} symbol - e.g. "ETH/USD"
 * @returns {Promise<number>}
 */
export async function getPrice(symbol) {
  return priceCache.get(symbol);
}

/**
 * Price query intent handler.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handlePriceQuery(message, context) {
  const symbol = extractSymbol(message);

  if (!symbol) {
    return { text: 'Which asset would you like the price of? For example: ETH, BTC, USDC.' };
  }

  const pair = `${symbol}/USD`;
  if (!SUPPORTED_PRICE_SYMBOLS.includes(pair)) {
    return {
      text: `I don't have price data for ${symbol}. Supported assets: ${SUPPORTED_PRICE_SYMBOLS.map((s) => s.split('/')[0]).join(', ')}.`,
    };
  }

  try {
    const currentPrice = await priceCache.get(pair);
    // In a full implementation, we'd also get 24h and 7d delta from oracle cache
    const response = `${symbol} is currently trading at ${formatPrice(currentPrice)}.\n\nWant me to do anything with this?`;
    return { text: response };
  } catch (err) {
    logger.warn('Price query failed', { symbol, error: err.message });
    return { text: 'Price data is temporarily unavailable. Please try again in a moment.' };
  }
}

/**
 * Extract an asset symbol from a natural language query.
 * @param {string} message
 * @returns {string|null}
 */
function extractSymbol(message) {
  const knownAssets = ['ETH', 'BTC', 'WBTC', 'USDC', 'USDT', 'DAI', 'ARB', 'OP', 'MATIC'];
  const upper = message.toUpperCase();

  for (const asset of knownAssets) {
    if (upper.includes(asset)) { return asset; }
  }

  // Common aliases
  if (/\bethereum\b/i.test(message)) { return 'ETH'; }
  if (/\bbitcoin\b/i.test(message)) { return 'BTC'; }
  if (/\bpolygon\b/i.test(message)) { return 'MATIC'; }

  return null;
}

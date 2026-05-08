/**
 * Price Cache
 * Short-lived in-memory cache for price data.
 * Reduces redundant oracle calls within a single conversation turn.
 */

'use strict';

import { PRICE_CACHE_TTL_MS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/** @type {Map<string, {value: number, expiresAt: number}>} */
const cache = new Map();

export const priceCache = {
  /**
   * Get a price from cache, fetching from oracle if expired.
   * @param {string} symbol - e.g. "ETH/USD"
   * @returns {Promise<number>}
   */
  async get(symbol) {
    const cached = cache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await price.get(symbol);
    cache.set(symbol, { value, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
    logger.debug('Price cache updated', { symbol });
    return value;
  },

  /**
   * Pre-warm the cache for a symbol.
   * @param {string} symbol
   */
  async warm(symbol) {
    await this.get(symbol);
  },

  /**
   * Invalidate a cached price.
   * @param {string} symbol
   */
  invalidate(symbol) {
    cache.delete(symbol);
  },

  /**
   * Clear all cached prices.
   */
  clear() {
    cache.clear();
  },
};

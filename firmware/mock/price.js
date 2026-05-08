/**
 * Mock price.get firmware API
 * Returns fixture price data for development and testing.
 */

'use strict';

const PRICE_FIXTURES = {
  'ETH/USD':   3247.82,
  'BTC/USD':  61423.50,
  'USDC/USD':  1.00,
  'USDT/USD':  1.00,
  'DAI/USD':   0.9998,
  'WBTC/USD': 61350.00,
  'ARB/USD':   1.225,
  'OP/USD':    2.14,
  'MATIC/USD': 0.987,
};

export const price = {
  /**
   * Mock price.get — returns fixture price for a symbol pair.
   * @param {string} symbol - e.g. "ETH/USD"
   * @returns {Promise<number>}
   */
  async get(symbol) {
    await delay(5);
    const value = PRICE_FIXTURES[symbol];
    if (value === undefined) {
      throw new Error(`Mock price: no fixture for "${symbol}"`);
    }
    return value;
  },

  /** Override a price fixture for specific test scenarios */
  _setPrice(symbol, value) {
    PRICE_FIXTURES[symbol] = value;
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.price = price;

/**
 * Mock wallet.sign / wallet.address firmware API
 * Used in tests and development mode.
 */

'use strict';

let _address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
let _autoConfirm = false;

export const wallet = {
  /**
   * Return the mock wallet address.
   * @returns {Promise<string>}
   */
  async address() {
    return _address;
  },

  /**
   * Mock wallet.sign — does not actually sign anything.
   * Returns a fake transaction hash.
   * @param {object} tx
   * @returns {Promise<string>} Fake tx hash
   */
  async sign(tx) {
    if (!_autoConfirm) {
      console.log('[MOCK wallet.sign] Transaction:', JSON.stringify(tx, null, 2));
    }
    // Simulate signing delay
    await delay(100);
    return `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`;
  },

  /** Test helpers */
  _setAddress(addr) { _address = addr; },
  _setAutoConfirm(val) { _autoConfirm = val; },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Make available as global (mirrors firmware runtime)
globalThis.wallet = wallet;

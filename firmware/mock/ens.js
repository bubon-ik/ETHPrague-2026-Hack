/**
 * Mock ENS firmware APIs
 * Simulates ENS resolution, availability, and suggestions.
 */

'use strict';

const REGISTERED_NAMES = {
  'vitalik.eth':     '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  'greenparrot.eth': '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234',
  'alice.eth':       '0x1234567890123456789012345678901234567890',
};

const SUGGESTIONS = {
  'greenparrot': ['greenparrot42.eth', 'the-greenparrot.eth', 'greenparrots.eth', 'greenparrot-nft.eth', 'mygreen-parrot.eth'],
};

export const ens = {
  /**
   * Resolve an ENS name to an address.
   * @param {string} name
   * @returns {Promise<string|null>}
   */
  async resolve(name) {
    await delay(20);
    return REGISTERED_NAMES[name.toLowerCase()] || null;
  },

  /**
   * Check if an ENS name is available.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async available(name) {
    await delay(15);
    return !REGISTERED_NAMES[name.toLowerCase()];
  },

  /**
   * Suggest available ENS names similar to the given name.
   * @param {string} name - Without .eth suffix
   * @returns {Promise<string[]>}
   */
  async suggest(name) {
    await delay(25);
    const key = name.toLowerCase();
    if (SUGGESTIONS[key]) { return SUGGESTIONS[key]; }
    // Generate generic suggestions
    return [
      `${key}42.eth`,
      `the-${key}.eth`,
      `${key}s.eth`,
      `my-${key}.eth`,
      `${key}-eth.eth`,
    ];
  },

  /** Test helpers */
  _registerName(name, address) { REGISTERED_NAMES[name] = address; },
  _unregisterName(name) { delete REGISTERED_NAMES[name]; },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.ens = ens;

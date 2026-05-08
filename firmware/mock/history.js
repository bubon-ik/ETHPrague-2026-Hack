/**
 * Mock history firmware API
 * Returns fixture transaction history for development and testing.
 */

'use strict';

const FIXTURE_HISTORY = [
  {
    type: 'send',
    status: 'confirmed',
    amount: 0.5,
    asset: 'ETH',
    counterparty: 'vitalik.eth',
    date: '2026-05-07',
    txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  },
  {
    type: 'receive',
    status: 'confirmed',
    amount: 100,
    asset: 'USDC',
    counterparty: '0x1234...5678',
    date: '2026-05-06',
    txHash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4',
  },
  {
    type: 'swap',
    status: 'confirmed',
    amount: 50,
    asset: 'USDC→ETH',
    counterparty: 'Uniswap V3',
    date: '2026-05-05',
    txHash: '0x789012cde345789012cde345789012cde345789012cde345789012cde345789',
  },
  {
    type: 'ens',
    status: 'confirmed',
    amount: 5,
    asset: 'USD',
    counterparty: 'vaultai.eth',
    date: '2026-05-04',
    txHash: '0x321cba654fed321cba654fed321cba654fed321cba654fed321cba654fed321c',
  },
  {
    type: 'send',
    status: 'pending',
    amount: 0.1,
    asset: 'ETH',
    counterparty: 'alice.eth',
    date: '2026-05-08',
    txHash: '0xfed321cba654fed321cba654fed321cba654fed321cba654fed321cba654fed3',
  },
];

export const history = {
  /**
   * Return the last N transactions for a given address.
   * @param {string} address
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async get(address, limit = 10) {
    await delay(30); // Simulate network latency
    return FIXTURE_HISTORY.slice(0, limit);
  },

  /** Test helpers */
  _setHistory(txs) { FIXTURE_HISTORY.splice(0, FIXTURE_HISTORY.length, ...txs); },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.history = history;

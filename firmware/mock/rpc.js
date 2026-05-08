/**
 * Mock rpc.call firmware API
 * Returns fixture data mimicking a local Hardhat node.
 */

'use strict';

const FIXTURE_BALANCE = '0x22B1C8C1227A00000'; // ~2.5 ETH in wei
const FIXTURE_GAS_PRICE = '0x5F5E100'; // 0.1 Gwei

const FIXTURES = {
  eth_getBalance: FIXTURE_BALANCE,
  eth_gasPrice: FIXTURE_GAS_PRICE,
  eth_estimateGas: '0x5208', // 21000 gas
  eth_getBlockByNumber: {
    baseFeePerGas: '0x3B9ACA00', // 1 Gwei
    number: '0x12345',
    timestamp: '0x64A1B2C3',
  },
  eth_call: '0x0000000000000000000000000000000000000000000000000000000005F5E100', // 100 USDC
  eth_feeHistory: {
    baseFeePerGas: Array(30).fill('0x3B9ACA00'),
    gasUsedRatio: Array(30).fill(0.5),
  },
};

export const rpc = {
  /**
   * Mock rpc.call — returns fixture data or throws for unknown methods.
   * @param {string} method
   * @param {any[]} params
   * @returns {Promise<any>}
   */
  async call(method, params = []) {
    await delay(10); // Simulate network latency

    const fixture = FIXTURES[method];
    if (fixture !== undefined) {
      return typeof fixture === 'object' ? { ...fixture } : fixture;
    }

    console.warn(`[MOCK rpc.call] Unknown method: ${method}`, params);
    throw new Error(`Mock RPC: unsupported method "${method}"`);
  },

  /** Override a fixture for specific test scenarios */
  _setFixture(method, value) {
    FIXTURES[method] = value;
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.rpc = rpc;

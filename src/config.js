/**
 * Centralised environment config.
 * All process.env access lives here — nowhere else in the codebase.
 *
 * Loaded automatically via --env-file=.env in all npm scripts.
 * In production firmware the values are supplied by the device HSM.
 */

'use strict';

function required(key) {
  const val = process.env[key];
  if (!val) { throw new Error(`Missing required env variable: ${key}`); }
  return val;
}

function optional(key, fallback = '') {
  return process.env[key] ?? fallback;
}

export const config = {
  // ─── LLM ───────────────────────────────────────────────────────────────────
  openrouter: {
    apiKey:  optional('OPENROUTER_API_KEY'),
    baseUrl: optional('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1/chat/completions'),
    model:   optional('OPENROUTER_MODEL', 'anthropic/claude-opus-4-5'),
  },

  // ─── Ethereum RPC ──────────────────────────────────────────────────────────
  rpc: {
    url:         optional('RPC_URL', 'http://localhost:8545'),
    fallbackUrl: optional('RPC_URL_FALLBACK'),
    alchemyKey:  optional('ALCHEMY_API_KEY'),
    infuraKey:   optional('INFURA_API_KEY'),
  },

  // ─── Price Oracle ──────────────────────────────────────────────────────────
  price: {
    coingeckoKey: optional('COINGECKO_API_KEY'),
  },

  // ─── ENS / Etherscan ───────────────────────────────────────────────────────
  ens: {
    etherscanKey: optional('ETHERSCAN_API_KEY'),
  },

  // ─── App ───────────────────────────────────────────────────────────────────
  app: {
    env:      optional('NODE_ENV', 'development'),
    logLevel: optional('LOG_LEVEL', 'info'),
    chainId:  parseInt(optional('CHAIN_ID', '1'), 10),
    isDev:    optional('NODE_ENV', 'development') === 'development',
    isTest:   optional('NODE_ENV', 'development') === 'test',
  },
};

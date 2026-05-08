/**
 * Application-wide constants.
 * All chain IDs, contract addresses, limits, and config values live here.
 * Never hardcode these values elsewhere.
 */

'use strict';

// ─── Chain Configuration ──────────────────────────────────────────────────────

export const CHAIN_IDS = {
  ETHEREUM:  1,
  BASE:      8453,
  ARBITRUM:  42161,
  OPTIMISM:  10,
  POLYGON:   137,
};

export const SUPPORTED_CHAINS = [
  'Ethereum Mainnet',
  'Base',
  'Arbitrum',
  'Optimism',
  'Polygon',
];

// ─── Intent Constants ─────────────────────────────────────────────────────────

export const INTENTS = {
  TX_SEND:        'tx.send',
  TX_SWAP:        'tx.swap',
  TX_BUY:         'tx.buy',
  ENS_SEARCH:     'ens.search',
  ENS_RENEW:      'ens.renew',
  ENS_TRANSFER:   'ens.transfer',
  AUTO_CREATE:    'automation.create',
  AUTO_LIST:      'automation.list',
  AUTO_CANCEL:    'automation.cancel',
  QUERY_PRICE:    'query.price',
  QUERY_BALANCE:  'query.balance',
  QUERY_HISTORY:  'query.history',
  QUERY_GAS:      'query.gas',
  HELP:           'help',
  UNKNOWN:        'unknown',
};

// ─── Security Limits ──────────────────────────────────────────────────────────

/** Maximum gas-to-tx-value ratio before warning user (15%) */
export const GAS_RATIO_WARN_THRESHOLD = 0.15;

/** Maximum transaction signing attempts per minute */
export const MAX_SIGN_ATTEMPTS_PER_MINUTE = 5;

/** Maximum active automation rules */
export const MAX_AUTOMATION_RULES = 10;

/** Maximum consecutive automation failures before auto-deactivation */
export const MAX_AUTO_FAILURES = 10;

/** Default DEX swap slippage tolerance (0.5%) */
export const DEFAULT_SLIPPAGE = 0.005;

/** Price impact warning threshold (2%) */
export const PRICE_IMPACT_WARN_THRESHOLD = 0.02;

// ─── Context Window ───────────────────────────────────────────────────────────

/** Maximum messages in rolling conversation context */
export const CONTEXT_MAX_MESSAGES = 20;

// ─── ENS ─────────────────────────────────────────────────────────────────────

/** Days before ENS expiry to surface warning */
export const ENS_EXPIRY_WARNING_DAYS = 30;

/** ENS registrar controller address (Ethereum Mainnet) */
export const ENS_REGISTRAR_ADDRESS = '0x253553366Da8546fC250F225fe3d25d0C782303b';

/** ENS base cost per year for 5+ char names (USD) */
export const ENS_COST_PER_YEAR_USD = 5;

// ─── Known ERC-20 Tokens ──────────────────────────────────────────────────────

export const KNOWN_TOKENS = [
  { symbol: 'USDC',  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
  { symbol: 'USDT',  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
  { symbol: 'DAI',   address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  { symbol: 'WBTC',  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8  },
  { symbol: 'ARB',   address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  { symbol: 'OP',    address: '0x4200000000000000000000000000000000000042', decimals: 18 },
  { symbol: 'MATIC', address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', decimals: 18 },
];

// ─── Price Oracle ─────────────────────────────────────────────────────────────

/** Price cache TTL in milliseconds (60 seconds) */
export const PRICE_CACHE_TTL_MS = 60_000;

/** Supported price pair symbols */
export const SUPPORTED_PRICE_SYMBOLS = ['ETH/USD', 'BTC/USD', 'USDC/USD', 'DAI/USD', 'WBTC/USD', 'ARB/USD', 'OP/USD', 'MATIC/USD'];

// ─── History ──────────────────────────────────────────────────────────────────

/** Default number of transactions to fetch in history queries */
export const DEFAULT_HISTORY_LIMIT = 10;

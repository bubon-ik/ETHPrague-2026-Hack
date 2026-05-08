/**
 * Portfolio Action Handler
 * Provides portfolio valuation and analytics.
 */

'use strict';

import { getEthBalance } from '../rpc/eth.js';
import { enumerateTokenBalances } from '../rpc/tokens.js';
import { priceCache } from '../price/cache.js';
import { formatToken, formatUsd } from '../utils/format.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a portfolio/balance query.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handlePortfolio(message, context) {
  const address = await wallet.address();

  const [ethBalanceWei, tokenBalances, ethPrice] = await Promise.all([
    getEthBalance(address),
    enumerateTokenBalances(address),
    priceCache.get('ETH/USD'),
  ]);

  const ethBalance = Number(ethBalanceWei) / 1e18;
  const ethUsd = ethBalance * ethPrice;
  let totalUsd = ethUsd;

  const lines = [
    `• ${'ETH'.padEnd(8)} ${formatToken(ethBalance, 'ETH').padEnd(22)} ${formatUsd(ethUsd)}`,
  ];

  for (const token of tokenBalances) {
    try {
      const tokenPrice = await priceCache.get(`${token.symbol}/USD`);
      const usd = token.balance * tokenPrice;
      totalUsd += usd;
      lines.push(`• ${token.symbol.padEnd(8)} ${formatToken(token.balance, token.symbol, token.decimals).padEnd(22)} ${formatUsd(usd)}`);
    } catch (err) {
      logger.debug('Token price unavailable', { symbol: token.symbol });
    }
  }

  lines.push('─'.repeat(50));
  lines.push(`  ${'Total'.padEnd(30)} ${formatUsd(totalUsd)}`);

  ui.render({ type: 'portfolio', data: { totalUsd, lines } });

  return {
    text: `Your portfolio:\n${lines.join('\n')}\n\nWant me to do anything with this?`,
  };
}

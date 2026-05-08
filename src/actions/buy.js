/**
 * Buy Action Handler
 * Handles "Buy X ETH" or "Buy $500 of ETH" via DEX/fiat ramp.
 */

'use strict';

import { validateAmount } from '../security/validator.js';
import { checkSignRateLimit } from '../security/limits.js';
import { auditRecord } from '../security/audit.js';
import { priceCache } from '../price/cache.js';
import { buildTxPreview } from '../agent/prompts/transaction.js';
import { formatUsd } from '../utils/format.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a "buy" request.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleBuy(message, context) {
  const parsed = parseBuyIntent(message);

  if (!parsed) {
    return {
      text: 'To buy crypto, tell me how much and which asset. For example: "Buy 0.5 ETH" or "Buy $500 of ETH"',
    };
  }

  let { rawAmount, asset, isUsd } = parsed;

  const amountResult = validateAmount(rawAmount);
  if (!amountResult.valid) {
    return { text: amountResult.reason };
  }

  const assetPrice = await priceCache.get(`${asset}/USD`).catch(() => null);
  if (!assetPrice) {
    return { text: `I can't fetch a price for ${asset} right now. Please try again.` };
  }

  let assetAmount, usdCost;
  if (isUsd) {
    usdCost = amountResult.amount;
    assetAmount = usdCost / assetPrice;
  } else {
    assetAmount = amountResult.amount;
    usdCost = assetAmount * assetPrice;
  }

  const fees = usdCost * 0.003; // Simulated 0.3% fee
  const totalCost = usdCost + fees;

  const preview = `📋 Buy Preview
──────────────────────
Action:      Buy ${asset}
Amount:      ${assetAmount.toFixed(6)} ${asset}
Cost:        ${formatUsd(usdCost)}
Fee (0.3%):  ${formatUsd(fees)}
Total:       ${formatUsd(totalCost)}
──────────────────────
Confirm with physical button to proceed.`;

  ui.render({ type: 'txPreview', content: preview });

  const rateCheck = checkSignRateLimit();
  if (!rateCheck.allowed) {
    return { text: 'Too many signing attempts. Please wait before trying again.' };
  }

  const confirmed = await ui.confirm('Confirm this purchase?');
  if (!confirmed) {
    auditRecord({ type: 'buy', status: 'rejected', asset, amount: assetAmount });
    return { text: 'Purchase cancelled.' };
  }

  try {
    const txHash = await wallet.sign({ to: '0xFiatRampAddress', data: '0x', value: '0x0' });
    auditRecord({ type: 'buy', status: 'signed', asset, amount: assetAmount, txHash });
    return { text: `✅ Purchase submitted! Buying ${assetAmount.toFixed(4)} ${asset} for ${formatUsd(totalCost)}.` };
  } catch (err) {
    auditRecord({ type: 'buy', status: 'failed', asset, amount: assetAmount });
    logger.error('Buy signing failed', { error: err.message });
    return { text: 'Purchase failed. Please try again.' };
  }
}

/**
 * Parse "Buy X ETH" or "Buy $500 of ETH" from natural language.
 * @param {string} message
 * @returns {{rawAmount: string, asset: string, isUsd: boolean}|null}
 */
function parseBuyIntent(message) {
  // Match "Buy $500 of ETH" or "Buy $500 ETH"
  const usdMatch = message.match(/(?:buy|purchase|get)\s+\$?([\d.]+)\s+(?:of\s+)?([A-Za-z]+)/i);
  if (usdMatch) {
    const isUsd = message.includes('$') || /\bworth\b/i.test(message);
    return { rawAmount: usdMatch[1], asset: usdMatch[2].toUpperCase(), isUsd };
  }
  return null;
}

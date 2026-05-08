/**
 * Swap Action Handler
 * Handles "Swap X TOKEN to TOKEN" DEX routing and execution.
 */

'use strict';

import { validateAmount } from '../security/validator.js';
import { checkGasRatio, checkSignRateLimit } from '../security/limits.js';
import { auditRecord } from '../security/audit.js';
import { getGasPrice } from '../rpc/eth.js';
import { priceCache } from '../price/cache.js';
import { buildSwapPreview } from '../agent/prompts/transaction.js';
import { formatUsd } from '../utils/format.js';
import { DEFAULT_SLIPPAGE, PRICE_IMPACT_WARN_THRESHOLD } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a "swap" request.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleSwap(message, context) {
  const parsed = parseSwapIntent(message);

  if (!parsed) {
    return { text: 'To swap tokens, say something like: "Swap 100 USDC to ETH"' };
  }

  const { rawAmount, fromAsset, toAsset } = parsed;

  const amountResult = validateAmount(rawAmount);
  if (!amountResult.valid) {
    return { text: amountResult.reason };
  }

  // Get prices for both assets
  const [fromPrice, toPrice] = await Promise.all([
    priceCache.get(`${fromAsset}/USD`).catch(() => 1),
    priceCache.get(`${toAsset}/USD`).catch(() => null),
  ]);

  if (!toPrice) {
    return { text: `I don't have price data for ${toAsset}. Please check the symbol and try again.` };
  }

  const fromValueUsd = amountResult.amount * fromPrice;
  const toAmount = fromValueUsd / toPrice;
  const rate = toPrice / fromPrice;
  const priceImpact = 0.02; // Simulated; in production from DEX quote

  const gasPriceWei = await getGasPrice();
  const swapGasLimit = 200000n;
  const gasEthWei = gasPriceWei * swapGasLimit;
  const gasEth = Number(gasEthWei) / 1e18;
  const ethPrice = await priceCache.get('ETH/USD');
  const gasUsd = gasEth * ethPrice;

  // Gas ratio check
  const gasCheck = checkGasRatio(gasUsd, fromValueUsd);
  if (gasCheck.exceeded) {
    const override = await ui.confirm(`⚠️ Gas is ${(gasCheck.ratio * 100).toFixed(1)}% of swap value. Proceed anyway?`);
    if (!override) { return { text: 'Swap cancelled.' }; }
  }

  // Price impact warning
  if (priceImpact > PRICE_IMPACT_WARN_THRESHOLD) {
    const override = await ui.confirm(`⚠️ Price impact is ${(priceImpact * 100).toFixed(2)}% — higher than usual. Proceed?`);
    if (!override) { return { text: 'Swap cancelled.' }; }
  }

  const preview = buildSwapPreview({
    fromAmount: amountResult.amount,
    fromAsset,
    fromUsd: formatUsd(fromValueUsd),
    toAmount: toAmount.toFixed(6),
    toAsset,
    rate: rate.toFixed(4),
    priceImpact: (priceImpact * 100).toFixed(2),
    slippage: (DEFAULT_SLIPPAGE * 100).toFixed(1),
    gasEth: gasEthWei,
    gasUsd: formatUsd(gasUsd),
    network: 'Ethereum Mainnet',
  });

  ui.render({ type: 'txPreview', content: preview });

  const rateCheck = checkSignRateLimit();
  if (!rateCheck.allowed) {
    return { text: 'Too many signing attempts. Please wait before trying again.' };
  }

  const confirmed = await ui.confirm('Confirm this swap?');
  if (!confirmed) {
    auditRecord({ type: 'swap', status: 'rejected', asset: fromAsset, amount: amountResult.amount });
    return { text: 'Swap cancelled.' };
  }

  try {
    const txHash = await wallet.sign({
      to: '0xSwapRouterAddress', // Would be actual DEX router
      data: '0x', // Encoded swap calldata
      gas: `0x${swapGasLimit.toString(16)}`,
      gasPrice: `0x${gasPriceWei.toString(16)}`,
    });

    auditRecord({ type: 'swap', status: 'signed', asset: fromAsset, amount: amountResult.amount, txHash });
    return { text: `✅ Swap submitted! Exchanging ${amountResult.amount} ${fromAsset} for ~${toAmount.toFixed(4)} ${toAsset}.` };
  } catch (err) {
    auditRecord({ type: 'swap', status: 'failed', asset: fromAsset, amount: amountResult.amount });
    logger.error('Swap signing failed', { error: err.message });
    return { text: 'Swap failed. Please try again.' };
  }
}

/**
 * Parse "Swap X FROM to TO" from natural language.
 * @param {string} message
 * @returns {{rawAmount: string, fromAsset: string, toAsset: string}|null}
 */
function parseSwapIntent(message) {
  const match = message.match(/(?:swap|exchange|convert|trade)\s+([\d.]+)\s+([A-Za-z]+)\s+(?:to|for|into)\s+([A-Za-z]+)/i);
  if (!match) { return null; }
  return {
    rawAmount: match[1],
    fromAsset: match[2].toUpperCase(),
    toAsset: match[3].toUpperCase(),
  };
}

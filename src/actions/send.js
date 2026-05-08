/**
 * Send Action Handler
 *
 * Handles "Send X ETH/token to address/ENS" intent.
 * Full security pipeline: validate → resolve → preview → confirm → sign → audit.
 */

'use strict';

import { validateAddress, validateEnsName, validateAmount, scoreTransactionRisk } from '../security/validator.js';
import { checkGasRatio, checkSignRateLimit, checkBalanceThreshold } from '../security/limits.js';
import { auditRecord } from '../security/audit.js';
import { rpcCall } from '../rpc/client.js';
import { getEthBalance, getGasPrice, estimateGas } from '../rpc/eth.js';
import { priceCache } from '../price/cache.js';
import { buildTxPreview } from '../agent/prompts/transaction.js';
import { formatEth, formatUsd } from '../utils/format.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a "send" transaction request.
 * @param {string} message - Raw user input
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleSend(message, context) {
  // 1. Parse intent from message
  const parsed = parseSendIntent(message);

  if (!parsed) {
    return { text: 'To send funds, tell me the amount, asset, and destination. For example: "Send 0.1 ETH to vitalik.eth"' };
  }

  const { rawAmount, asset, rawDestination } = parsed;

  // 2. Validate amount
  const amountResult = validateAmount(rawAmount, { min: 0 });
  if (!amountResult.valid) {
    return { text: amountResult.reason };
  }

  // 3. Resolve destination (ENS or address)
  let toAddress, toEns;
  if (rawDestination.endsWith('.eth') || !rawDestination.startsWith('0x')) {
    const ensResult = validateEnsName(rawDestination);
    if (!ensResult.valid) {
      return { text: ensResult.reason };
    }
    toEns = ensResult.name;
    try {
      toAddress = await ens.resolve(toEns);
      if (!toAddress) {
        return { text: `Could not resolve ${toEns} — this ENS name may not be registered.` };
      }
    } catch (err) {
      return { text: `Failed to resolve ${toEns}. Please check the name and try again.` };
    }
  } else {
    const addrResult = validateAddress(rawDestination);
    if (!addrResult.valid) {
      return { text: addrResult.reason };
    }
    toAddress = addrResult.address;
  }

  // 4. Get prices and balances
  const ethPrice = await priceCache.get('ETH/USD');
  const address = await wallet.address();
  const balanceWei = await getEthBalance(address);
  const balanceEth = Number(balanceWei) / 1e18;

  // 5. Estimate gas
  const gasPriceWei = await getGasPrice();
  const gasLimit = 21000n; // ETH transfer gas limit
  const gasEthWei = gasPriceWei * gasLimit;
  const gasEth = Number(gasEthWei) / 1e18;
  const gasUsd = gasEth * ethPrice;
  const txValueUsd = amountResult.amount * ethPrice;

  // 6. Check gas ratio
  const gasCheck = checkGasRatio(gasUsd, txValueUsd);
  if (gasCheck.exceeded) {
    const confirmed = await ui.confirm(
      `⚠️ Gas cost is ${(gasCheck.ratio * 100).toFixed(1)}% of transaction value (${formatUsd(gasUsd)} gas for a ${formatUsd(txValueUsd)} send). Override?`
    );
    if (!confirmed) {
      return { text: 'Transaction cancelled. Gas cost too high relative to the amount.' };
    }
  }

  // 7. Check balance
  const balCheck = checkBalanceThreshold(amountResult.amount, balanceEth);
  const warnings = [];
  if (balCheck.warn) {
    warnings.push(`This will use ${(balCheck.pct * 100).toFixed(0)}% of your ETH balance.`);
  }

  // 8. Risk scoring
  const risk = scoreTransactionRisk({
    to: toAddress,
    amountUsd: txValueUsd,
    gasUsd,
    isNewAddress: true, // In production: check against history
  });
  warnings.push(...risk.flags);

  // 9. Show transaction preview
  const preview = buildTxPreview({
    action: 'Send',
    asset,
    amount: amountResult.amount,
    usdValue: formatUsd(txValueUsd),
    to: toAddress,
    toEns: toEns || null,
    gasEth: gasEthWei,
    gasUsd: formatUsd(gasUsd),
    network: 'Ethereum Mainnet',
    warnings,
  });

  ui.render({ type: 'txPreview', content: preview });

  // 10. Rate limit check
  const rateCheck = checkSignRateLimit();
  if (!rateCheck.allowed) {
    return { text: 'Too many signing attempts. Please wait before trying again.' };
  }

  // 11. Confirmation gate
  const confirmed = await ui.confirm('Confirm this transaction?');
  if (!confirmed) {
    auditRecord({ type: 'send', status: 'rejected', to: toAddress, asset, amount: amountResult.amount });
    return { text: 'Transaction cancelled.' };
  }

  // 12. Sign and submit
  try {
    const txHash = await wallet.sign({
      to: toAddress,
      value: `0x${(BigInt(Math.floor(amountResult.amount * 1e18))).toString(16)}`,
      gas: `0x${gasLimit.toString(16)}`,
      gasPrice: `0x${gasPriceWei.toString(16)}`,
    });

    auditRecord({ type: 'send', status: 'signed', to: toAddress, asset, amount: amountResult.amount, txHash });
    logger.info('Send transaction signed successfully');

    return { text: `✅ Transaction submitted! Sending ${amountResult.amount} ${asset} to ${toEns || toAddress.slice(0, 10) + '...'}.` };
  } catch (err) {
    auditRecord({ type: 'send', status: 'failed', to: toAddress, asset, amount: amountResult.amount });
    logger.error('Transaction signing failed', { error: err.message });
    return { text: 'Transaction failed. Please try again.' };
  }
}

/**
 * Parse "Send X ETH to destination" from natural language.
 * @param {string} message
 * @returns {{rawAmount: string, asset: string, rawDestination: string}|null}
 */
function parseSendIntent(message) {
  const match = message.match(/(?:send|transfer|pay|move)\s+([\d.]+)\s+([A-Za-z]+)\s+(?:to\s+)?(.+)/i);
  if (!match) { return null; }
  return {
    rawAmount: match[1],
    asset: match[2].toUpperCase(),
    rawDestination: match[3].trim(),
  };
}

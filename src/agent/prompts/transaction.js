/**
 * Transaction Prompt Templates
 * Generates structured display strings for transaction confirmation flows.
 */

'use strict';

import { formatEth, formatUsd, formatAddress } from '../../utils/format.js';

/**
 * Build a transaction preview string for display.
 * @param {object} params
 * @param {string} params.action - 'Send' | 'Swap' | 'Buy'
 * @param {string} params.asset
 * @param {string|number} params.amount
 * @param {string} params.usdValue
 * @param {string} params.to - Destination address
 * @param {string|null} params.toEns - ENS name if resolved
 * @param {string|number} params.gasEth
 * @param {string} params.gasUsd
 * @param {string} params.network
 * @param {string[]} params.warnings - Array of warning strings
 * @returns {string}
 */
export function buildTxPreview({ action, asset, amount, usdValue, to, toEns, gasEth, gasUsd, network, warnings = [] }) {
  const destination = toEns ? `${toEns} (${formatAddress(to)})` : formatAddress(to);
  const warningLines = warnings.map((w) => `⚠️  ${w}`).join('\n');

  return `📋 Transaction Preview
──────────────────────
Action:      ${action}
Asset:       ${amount} ${asset}  (~${usdValue})
To:          ${destination}
Gas (est.):  ${formatEth(gasEth)} ETH  (~${gasUsd})
Network:     ${network}
──────────────────────
${warningLines ? warningLines + '\n' : ''}Confirm with physical button to proceed.`;
}

/**
 * Build a swap preview string.
 * @param {object} params
 * @returns {string}
 */
export function buildSwapPreview({ fromAmount, fromAsset, fromUsd, toAmount, toAsset, rate, priceImpact, slippage, gasEth, gasUsd, network }) {
  return `📋 Swap Preview
──────────────────────
Action:      Swap
From:        ${fromAmount} ${fromAsset}  (${fromUsd})
To (est.):   ${toAmount} ${toAsset}
Rate:        1 ${toAsset} = ${rate} ${fromAsset}
Price Impact: ${priceImpact}%
Slippage:    ${slippage}% max
Gas (est.):  ${formatEth(gasEth)} ETH  (~${gasUsd})
Network:     ${network}
──────────────────────
Confirm with physical button to proceed.`;
}

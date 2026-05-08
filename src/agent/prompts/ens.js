/**
 * ENS Prompt Templates
 * Generates structured display strings for ENS flows.
 */

'use strict';

import { formatAddress } from '../../utils/format.js';

/**
 * Build ENS search result display.
 * @param {object} params
 * @param {string} params.name - Full ENS name (e.g. "greenparrot.eth")
 * @param {boolean} params.available
 * @param {string|null} params.owner - Address of current owner if taken
 * @param {string|null} params.expires - ISO date string if taken
 * @param {Array<{name: string, pricePerYear: string}>} params.suggestions
 * @returns {string}
 */
export function buildEnsSearchResult({ name, available, owner, expires, suggestions = [] }) {
  if (available) {
    return `🔷 ENS Search: ${name}
──────────────────────
Status:   ✅ Available
Price:    ~$5/yr  (~$20 for 5 years)

Shall I register it? (yes / no)`;
  }

  const suggestionLines = suggestions
    .slice(0, 5)
    .map((s) => `  ✅ ${s.name.padEnd(30)} — ~$${s.pricePerYear}/yr`)
    .join('\n');

  return `🔷 ENS Search: ${name}
──────────────────────
Status:   ❌ Taken
Owner:    ${formatAddress(owner)}
Expires:  ${expires}

Similar names available:
${suggestionLines}

Register one? Type the name or say "none".`;
}

/**
 * Build ENS renewal preview.
 * @param {object} params
 * @returns {string}
 */
export function buildEnsRenewalPreview({ name, years, cost, gasEth, gasUsd }) {
  return `🔷 ENS Renewal
──────────────────────
Name:        ${name}
Duration:    ${years} year${years > 1 ? 's' : ''}
Cost:        ~$${cost}
Gas (est.):  ${gasEth} ETH  (~${gasUsd})
──────────────────────
Confirm with physical button to proceed.`;
}

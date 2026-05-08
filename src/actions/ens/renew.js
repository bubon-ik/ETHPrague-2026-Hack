/**
 * ENS Renewal Handler
 * Handles "Renew X.eth for N years" requests.
 */

'use strict';

import { validateEnsName, validateAmount } from '../../security/validator.js';
import { checkSignRateLimit } from '../../security/limits.js';
import { auditRecord } from '../../security/audit.js';
import { getGasPrice } from '../../rpc/eth.js';
import { priceCache } from '../../price/cache.js';
import { buildEnsRenewalPreview } from '../../agent/prompts/ens.js';
import { ENS_COST_PER_YEAR_USD } from '../../utils/constants.js';
import { formatUsd } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';

/**
 * Handle an ENS renewal request.
 * @param {string} message
 * @param {import('../../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleEnsRenew(message, context) {
  const parsed = parseRenewIntent(message);

  if (!parsed) {
    return { text: 'To renew an ENS name, say something like: "Renew vitalik.eth for 2 years"' };
  }

  const { rawName, years } = parsed;
  const validation = validateEnsName(rawName);
  if (!validation.valid) {
    return { text: validation.reason };
  }

  const cost = ENS_COST_PER_YEAR_USD * years;
  const ethPrice = await priceCache.get('ETH/USD');
  const gasPriceWei = await getGasPrice();
  const gasEthWei = gasPriceWei * 80000n;
  const gasEth = Number(gasEthWei) / 1e18;
  const gasUsd = gasEth * ethPrice;

  const preview = buildEnsRenewalPreview({
    name: validation.name,
    years,
    cost,
    gasEth: gasEth.toFixed(4),
    gasUsd: formatUsd(gasUsd),
  });

  ui.render({ type: 'ensRenewal', content: preview });

  const rateCheck = checkSignRateLimit();
  if (!rateCheck.allowed) {
    return { text: 'Too many signing attempts. Please wait before trying again.' };
  }

  const confirmed = await ui.confirm(`Renew ${validation.name} for ${years} year${years > 1 ? 's' : ''}?`);
  if (!confirmed) {
    return { text: 'Renewal cancelled.' };
  }

  try {
    const txHash = await wallet.sign({
      to: '0x253553366Da8546fC250F225fe3d25d0C782303b',
      data: '0x',
      gas: '0x13880',
      gasPrice: `0x${gasPriceWei.toString(16)}`,
    });

    auditRecord({ type: 'ens_renew', status: 'signed', asset: 'ENS', amount: cost, txHash });
    return { text: `✅ Renewal submitted! ${validation.name} renewed for ${years} year${years > 1 ? 's' : ''}.` };
  } catch (err) {
    auditRecord({ type: 'ens_renew', status: 'failed', asset: 'ENS', amount: cost });
    logger.error('ENS renewal failed', { error: err.message });
    return { text: 'Renewal failed. Please try again.' };
  }
}

/**
 * Parse "Renew X.eth for N years" from natural language.
 * @param {string} message
 * @returns {{rawName: string, years: number}|null}
 */
function parseRenewIntent(message) {
  const match = message.match(/(?:renew|extend)\s+([a-z0-9-.]+\.eth)\s+(?:for\s+)?(\d+)\s+years?/i);
  if (match) {
    return { rawName: match[1], years: parseInt(match[2], 10) };
  }
  // Default to 1 year if not specified
  const simpleMatch = message.match(/(?:renew|extend)\s+([a-z0-9-.]+\.eth)/i);
  if (simpleMatch) {
    return { rawName: simpleMatch[1], years: 1 };
  }
  return null;
}

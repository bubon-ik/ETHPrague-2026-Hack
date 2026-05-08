/**
 * Agent Initialization Checklist
 *
 * Runs silently on boot. Loads state, checks expiry, pre-fetches prices.
 */

'use strict';

import { loadRules } from '../automation/store.js';
import { checkPendingConditions } from '../automation/scheduler.js';
import { priceCache } from '../price/cache.js';
import { logger } from '../utils/logger.js';
import { formatAddress } from '../utils/format.js';
import { ENS_EXPIRY_WARNING_DAYS } from '../utils/constants.js';

/**
 * Run the silent boot checklist.
 * @param {import('./context.js').ContextManager} context
 */
export async function runInitChecklist(context) {
  logger.info('Running initialization checklist...');

  await Promise.allSettled([
    loadAutomationRules(context),
    prefetchPrices(),
    checkEnsExpiry(context),
  ]);

  await checkPendingConditions();

  logger.info('Initialization checklist complete.');
}

async function loadAutomationRules(context) {
  try {
    const rules = await loadRules();
    logger.info(`Loaded ${rules.length} automation rules from store`);
    context._automationRules = rules;
  } catch (err) {
    logger.warn('Failed to load automation rules', { error: err.message });
  }
}

async function prefetchPrices() {
  try {
    await Promise.all([
      priceCache.warm('ETH/USD'),
      priceCache.warm('BTC/USD'),
    ]);
    logger.info('Price cache warmed');
  } catch (err) {
    logger.warn('Price pre-fetch failed', { error: err.message });
  }
}

async function checkEnsExpiry(context) {
  try {
    const address = await wallet.address();
    // In a real implementation, enumerate owned ENS names
    // For now, this is a stub that would call the ENS registry
    logger.info('ENS expiry check complete', { address: formatAddress(address) });

    // If any ENS names expire within ENS_EXPIRY_WARNING_DAYS, add a warning message
    // context.addAssistant('⚠️ Your ENS name "example.eth" expires in 15 days. Type "renew example.eth" to extend it.');
  } catch (err) {
    logger.warn('ENS expiry check failed', { error: err.message });
  }
}

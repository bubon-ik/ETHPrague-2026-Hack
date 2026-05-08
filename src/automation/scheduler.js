/**
 * Automation Scheduler
 * Polls active rule conditions and triggers actions when matched.
 */

'use strict';

import { getRules, markRuleFailed, deactivateRule } from './store.js';
import { evaluatePriceCondition } from './conditions/price.js';
import { evaluateTimeCondition } from './conditions/time.js';
import { evaluateBalanceCondition } from './conditions/balance.js';
import { evaluateExpiryCondition } from './conditions/expiry.js';
import { MAX_AUTO_FAILURES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Check all active rules and execute any triggered conditions.
 * Called at boot and periodically by firmware scheduler.
 */
export async function checkPendingConditions() {
  const rules = await getRules();
  logger.info('Checking automation conditions', { ruleCount: rules.length });

  for (const rule of rules) {
    try {
      const triggered = await evaluateCondition(rule.condition);
      if (triggered) {
        await handleTriggeredRule(rule);
      }
    } catch (err) {
      logger.warn('Condition evaluation failed', { ruleId: rule.id, error: err.message });
      const failures = await markRuleFailed(rule.id);
      if (failures >= MAX_AUTO_FAILURES) {
        await deactivateRule(rule.id, 'Too many consecutive failures');
        logger.warn('Rule deactivated due to repeated failures', { ruleId: rule.id });
      }
    }
  }
}

/**
 * Evaluate a condition against live data.
 * @param {object} condition
 * @returns {Promise<boolean>}
 */
async function evaluateCondition(condition) {
  switch (condition.type) {
    case 'price':   return evaluatePriceCondition(condition);
    case 'time':    return evaluateTimeCondition(condition);
    case 'balance': return evaluateBalanceCondition(condition);
    case 'expiry':  return evaluateExpiryCondition(condition);
    default:
      logger.warn('Unknown condition type', { type: condition.type });
      return false;
  }
}

/**
 * Handle a triggered rule — show confirmation and dispatch action if approved.
 * @param {object} rule
 */
async function handleTriggeredRule(rule) {
  logger.info('Automation rule triggered', { ruleId: rule.id });

  if (rule.confirmEachExecution) {
    const { buildRuleSummary } = await import('../agent/prompts/automation.js');
    ui.render({ type: 'ruleTriggered', content: `🔔 Automation Rule Triggered\n\n${buildRuleSummary(rule)}` });
    const confirmed = await ui.confirm('Execute this automation now?');
    if (!confirmed) {
      logger.info('Rule execution declined by user', { ruleId: rule.id });
      return;
    }
  }

  // Dispatch the action
  await dispatchRuleAction(rule.action);
}

/**
 * Dispatch an automation action to the appropriate handler.
 * @param {object} action
 */
async function dispatchRuleAction(action) {
  // In production, this would call the action handlers directly
  // with a synthetic "message" constructed from the action object.
  logger.info('Dispatching automation action', { type: action.type });
  scheduler.set(action.type, action);
}

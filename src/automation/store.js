/**
 * Automation Rule Store
 * Encrypted local storage for active automation rules.
 */

'use strict';

import { buildRuleList } from '../agent/prompts/automation.js';
import { logger } from '../utils/logger.js';

/** In-memory store (in production: encrypted persistent storage via firmware API) */
let ruleStore = [];

/**
 * Load all active rules from storage.
 * @returns {Promise<object[]>}
 */
export async function loadRules() {
  // In production: decrypt from firmware storage
  return ruleStore.filter((r) => r.active !== false);
}

/**
 * Get active rules (alias for dispatch compatibility).
 * @returns {Promise<object[]>}
 */
export async function getRules() {
  return loadRules();
}

/**
 * Save a new rule to storage.
 * @param {object} rule
 */
export async function saveRule(rule) {
  ruleStore.push({ ...rule, active: true, failureCount: 0, createdAt: new Date().toISOString() });
  logger.info('Rule saved', { id: rule.id });
}

/**
 * Increment failure count for a rule and return new count.
 * @param {string} id
 * @returns {Promise<number>}
 */
export async function markRuleFailed(id) {
  const rule = ruleStore.find((r) => r.id === id);
  if (rule) {
    rule.failureCount = (rule.failureCount || 0) + 1;
    return rule.failureCount;
  }
  return 0;
}

/**
 * Deactivate a rule by ID.
 * @param {string} id
 * @param {string} [reason]
 */
export async function deactivateRule(id, reason) {
  const rule = ruleStore.find((r) => r.id === id);
  if (rule) {
    rule.active = false;
    rule.deactivatedReason = reason;
    logger.info('Rule deactivated', { id, reason });
  }
}

/**
 * Handle "automation.list" intent.
 * @returns {Promise<{text: string}>}
 */
export async function handleAutomationList() {
  const rules = await getRules();
  return { text: buildRuleList(rules) };
}

/**
 * Handle "automation.cancel" intent.
 * @param {string} message
 * @returns {Promise<{text: string}>}
 */
export async function handleAutomationCancel(message) {
  // Extract rule ID from message (first 8 chars of ID)
  const idMatch = message.match(/\b([a-z0-9]{8})\b/i);

  if (!idMatch) {
    const rules = await getRules();
    if (rules.length === 0) {
      return { text: 'You have no active automation rules to cancel.' };
    }
    return { text: `Which rule would you like to cancel? Your active rules:\n\n${buildRuleList(rules)}\n\nSay "cancel rule [ID]" to remove one.` };
  }

  const shortId = idMatch[1];
  const rule = ruleStore.find((r) => r.id.startsWith(shortId) && r.active !== false);

  if (!rule) {
    return { text: `No active rule found with ID starting "${shortId}".` };
  }

  const confirmed = await ui.confirm(`Cancel automation rule "${shortId}"?`);
  if (!confirmed) {
    return { text: 'Rule not cancelled.' };
  }

  await deactivateRule(rule.id, 'Cancelled by user');
  return { text: `✅ Rule "${shortId}" has been cancelled.` };
}

/**
 * Automation Rule Parser
 *
 * Converts natural language automation requests into structured rule objects.
 * This module has NO side effects — it only parses and returns rules.
 */

'use strict';

import { buildRuleSummary } from '../agent/prompts/automation.js';
import { getRules, saveRule } from './store.js';
import { MAX_AUTOMATION_RULES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Handle "automation.create" intent — parse rule and register if confirmed.
 * @param {string} message
 * @param {import('../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleAutomationCreate(message, context) {
  const rule = parseRule(message);

  if (!rule) {
    return {
      text: 'I didn\'t quite catch that automation rule. Try something like:\n• "If ETH < $1000, buy 5 ETH"\n• "Every Monday, swap 50 USDC to ETH"\n• "If my ENS expires in < 30 days, renew it for 1 year"',
    };
  }

  const existing = await getRules();
  if (existing.length >= MAX_AUTOMATION_RULES) {
    return { text: `You've reached the maximum of ${MAX_AUTOMATION_RULES} active automation rules. Cancel one first.` };
  }

  const summary = buildRuleSummary(rule);
  ui.render({ type: 'ruleCard', content: summary });

  const confirmed = await ui.confirm('Activate this automation rule?');
  if (!confirmed) {
    return { text: 'Rule cancelled. No automation was created.' };
  }

  await saveRule(rule);
  logger.info('Automation rule created', { id: rule.id, type: rule.condition.type });

  return { text: `✅ Rule activated! I'll watch for the condition and notify you before acting.\n\nRule ID: ${rule.id.slice(0, 8)} (say "cancel rule ${rule.id.slice(0, 8)}" to remove it)` };
}

/**
 * Parse a natural language automation request into a structured rule.
 * @param {string} message
 * @returns {object|null} Structured rule object or null if unparseable
 */
export function parseRule(message) {
  const id = generateId();

  // Price threshold: "If ETH < $1000, buy 5 ETH"
  const priceMatch = message.match(/if\s+([A-Za-z]+)\s*([<>]=?)\s*\$?([\d,]+)[,\s]+(.+)/i);
  if (priceMatch) {
    const action = parseAction(priceMatch[4]);
    if (!action) { return null; }
    return {
      id,
      condition: {
        type: 'price',
        asset: priceMatch[1].toUpperCase(),
        op: priceMatch[2],
        value: parseFloat(priceMatch[3].replace(/,/g, '')),
      },
      action,
      confirmEachExecution: true,
      maxExecutions: null,
      expiresAt: null,
    };
  }

  // Time-based: "Every Monday, swap 50 USDC to ETH"
  const timeMatch = message.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month|(\d+)\s+(?:hours?|days?|weeks?))/i);
  if (timeMatch) {
    const actionText = message.replace(/every\s+[^,]+,?\s*/i, '').trim();
    const action = parseAction(actionText);
    if (!action) { return null; }
    return {
      id,
      condition: {
        type: 'time',
        schedule: `Every ${timeMatch[1]}`,
      },
      action,
      confirmEachExecution: true,
      maxExecutions: null,
      expiresAt: null,
    };
  }

  // Balance-based: "If my USDC balance > 10000, move 5000 to vault"
  const balanceMatch = message.match(/if\s+(?:my\s+)?([A-Za-z]+)\s+balance\s*([<>]=?)\s*([\d,]+)[,\s]+(.+)/i);
  if (balanceMatch) {
    const action = parseAction(balanceMatch[4]);
    if (!action) { return null; }
    return {
      id,
      condition: {
        type: 'balance',
        asset: balanceMatch[1].toUpperCase(),
        op: balanceMatch[2],
        value: parseFloat(balanceMatch[3].replace(/,/g, '')),
      },
      action,
      confirmEachExecution: true,
      maxExecutions: null,
      expiresAt: null,
    };
  }

  // ENS expiry: "If my ENS expires in < 30 days, renew for 1 year"
  const expiryMatch = message.match(/if\s+(?:my\s+)?(?:ENS\s+)?(?:([a-z0-9-.]+\.eth)\s+)?expires?\s+in\s*<?(\d+)\s+days?[,\s]+renew\s+(?:it\s+)?(?:for\s+)?(\d+)\s+years?/i);
  if (expiryMatch) {
    return {
      id,
      condition: {
        type: 'expiry',
        name: expiryMatch[1] || 'primary',
        days: parseInt(expiryMatch[2], 10),
      },
      action: {
        type: 'ens.renew',
        name: expiryMatch[1] || 'primary',
        years: parseInt(expiryMatch[3], 10),
      },
      confirmEachExecution: true,
      maxExecutions: null,
      expiresAt: null,
    };
  }

  return null;
}

/**
 * Parse an action string into a structured action object.
 * @param {string} text
 * @returns {object|null}
 */
function parseAction(text) {
  const t = text.trim();

  const buyMatch = t.match(/buy\s+([\d.]+)\s+([A-Za-z]+)/i);
  if (buyMatch) {
    return { type: 'tx.buy', amount: parseFloat(buyMatch[1]), asset: buyMatch[2].toUpperCase() };
  }

  const swapMatch = t.match(/swap\s+([\d.]+)\s+([A-Za-z]+)\s+(?:to|for)\s+([A-Za-z]+)/i);
  if (swapMatch) {
    return { type: 'tx.swap', amount: parseFloat(swapMatch[1]), fromAsset: swapMatch[2].toUpperCase(), toAsset: swapMatch[3].toUpperCase() };
  }

  const sendMatch = t.match(/(?:send|move|transfer)\s+([\d.]+)\s+([A-Za-z]+)\s+(?:to\s+)?(.+)/i);
  if (sendMatch) {
    return { type: 'tx.send', amount: parseFloat(sendMatch[1]), asset: sendMatch[2].toUpperCase(), to: sendMatch[3].trim() };
  }

  return null;
}

/** Generate a simple unique ID. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

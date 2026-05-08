/**
 * Automation Prompt Templates
 * Generates structured display strings for conditional rule flows.
 */

'use strict';

/**
 * Build a plain-English summary of an automation rule for user confirmation.
 * @param {object} rule - Structured rule object from automation/parser.js
 * @returns {string}
 */
export function buildRuleSummary(rule) {
  const conditionText = describeCondition(rule.condition);
  const actionText = describeAction(rule.action);
  const confirmText = rule.confirmEachExecution ? 'Yes — will ask before executing' : 'No — auto-executes (auto-confirm mode)';
  const expiryText = rule.expiresAt ? new Date(rule.expiresAt).toLocaleDateString() : 'Never (cancel anytime)';

  return `📌 New Rule Summary
──────────────────────
Condition:   ${conditionText}
Action:      ${actionText}
Confirms:    ${confirmText}
Expires:     ${expiryText}
──────────────────────
Shall I activate this rule? (yes / no)`;
}

/**
 * Build a list display of active automation rules.
 * @param {object[]} rules
 * @returns {string}
 */
export function buildRuleList(rules) {
  if (!rules.length) {
    return 'You have no active automation rules. Create one by saying something like "If ETH < $1000, buy 5 ETH".';
  }

  const lines = rules.map((rule, i) => {
    const condition = describeCondition(rule.condition);
    const action = describeAction(rule.action);
    return `${i + 1}. IF ${condition}\n   THEN ${action}  [ID: ${rule.id.slice(0, 8)}]`;
  });

  return `📌 Active Automation Rules (${rules.length}/10)\n──────────────────────\n${lines.join('\n\n')}`;
}

function describeCondition(condition) {
  if (!condition) { return 'Unknown condition'; }
  switch (condition.type) {
    case 'price':
      return `${condition.asset} price ${condition.op} $${condition.value.toLocaleString()}`;
    case 'time':
      return condition.schedule;
    case 'balance':
      return `${condition.asset} balance ${condition.op} ${condition.value.toLocaleString()} ${condition.asset}`;
    case 'expiry':
      return `${condition.name} expires in < ${condition.days} days`;
    case 'portfolio':
      return `${condition.asset} is more than ${condition.threshold}% of portfolio`;
    default:
      return JSON.stringify(condition);
  }
}

function describeAction(action) {
  if (!action) { return 'Unknown action'; }
  switch (action.type) {
    case 'tx.buy':
      return `Buy ${action.amount} ${action.asset} via best available DEX`;
    case 'tx.swap':
      return `Swap ${action.amount} ${action.fromAsset} to ${action.toAsset}`;
    case 'tx.send':
      return `Send ${action.amount} ${action.asset} to ${action.to}`;
    case 'ens.renew':
      return `Renew ${action.name} for ${action.years} year${action.years > 1 ? 's' : ''}`;
    default:
      return JSON.stringify(action);
  }
}

/**
 * dev/scenario.js — Automated real-case scenario runner.
 *
 * Simulates a real user session end-to-end without human input.
 * All firmware globals are mocked. Prints full agent output to console.
 *
 * Covers:
 *   1. Balance / portfolio query
 *   2. ETH price query
 *   3. Send ETH to ENS name
 *   4. Swap USDC → ETH
 *   5. Create a price automation rule
 *   6. List automation rules
 *   7. History query
 *   8. Unknown / help
 */

'use strict';

// ─── Boot mocks ───────────────────────────────────────────────────────────────
import '../firmware/mock/wallet.js';
import '../firmware/mock/rpc.js';
import '../firmware/mock/price.js';
import '../firmware/mock/ens.js';
import '../firmware/mock/history.js';
import '../firmware/mock/ui.js';

// ─── Import handlers directly (no full boot loop needed) ─────────────────────
import { router }              from '../src/agent/router.js';
import { ContextManager }      from '../src/agent/context.js';
import { buildSystemPrompt }   from '../src/agent/prompts/system.js';

const COLORS = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  magenta: '\x1b[35m',
};

// Auto-confirm all transactions (simulates user pressing ✅)
globalThis.ui._setConfirmResponse(true);

const context = new ContextManager();
context.setSystem(buildSystemPrompt());

// ─── Scenario steps ───────────────────────────────────────────────────────────
const SCENARIOS = [
  { label: '1. Portfolio / Balance query',        msg: "What's my balance?" },
  { label: '2. ETH price query',                  msg: 'What is the current ETH price?' },
  { label: '3. Send ETH to ENS name',             msg: 'Send 0.1 ETH to vitalik.eth' },
  { label: '4. Swap USDC → ETH',                  msg: 'Swap 100 USDC to ETH' },
  { label: '5. Conditional automation — buy dip', msg: 'If ETH drops below $2000, automatically buy 2 ETH' },
  { label: '6. List automation rules',            msg: 'Show my active automation rules' },
  { label: '7. Transaction history',              msg: 'Show my last 5 transactions' },
  { label: '8. ENS domain search',                msg: 'I want the domain vaultai.eth' },
  { label: '9. Help',                             msg: 'help' },
  { label: '10. Unknown input (edge case)',        msg: 'do something weird xyz' },
];

function separator(label) {
  const line = '─'.repeat(50);
  console.log(`\n${COLORS.bold}${COLORS.magenta}${line}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.yellow}▶ ${label}${COLORS.reset}`);
  console.log(`${COLORS.dim}${line}${COLORS.reset}`);
}

function printUser(msg) {
  console.log(`\n${COLORS.bold}You:${COLORS.reset}   ${msg}`);
}

function printAgent(text) {
  console.log(`\n${COLORS.cyan}${COLORS.bold}Vault:${COLORS.reset} ${COLORS.cyan}${text}${COLORS.reset}`);
}

function printError(text) {
  console.log(`\n${COLORS.red}ERROR: ${text}${COLORS.reset}`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
console.log(`${COLORS.bold}${COLORS.cyan}
╔══════════════════════════════════════════════╗
║   VAULT AI AGENT — REAL CASE SCENARIO TEST   ║
║   Firmware: MOCK  |  Auto-confirm: ON        ║
╚══════════════════════════════════════════════╝
${COLORS.reset}`);

let passed = 0;
let failed = 0;

for (const step of SCENARIOS) {
  separator(step.label);
  printUser(step.msg);

  try {
    const response = await router.dispatch(step.msg, context);
    context.addUser(step.msg);
    context.addAssistant(response.text);
    printAgent(response.text);
    passed++;
  } catch (err) {
    printError(err.message);
    console.error(err);
    failed++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
const total = SCENARIOS.length;
console.log(`\n${COLORS.bold}${'═'.repeat(50)}${COLORS.reset}`);
console.log(`${COLORS.bold}SCENARIO RESULTS: ${COLORS.green}${passed} passed${COLORS.reset}  ${failed > 0 ? COLORS.red : ''}${failed} failed${COLORS.reset} / ${total} total`);
console.log(`${COLORS.bold}${'═'.repeat(50)}${COLORS.reset}\n`);

process.exit(failed > 0 ? 1 : 0);

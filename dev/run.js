/**
 * dev/run.js — Interactive CLI runner for the Vault agent.
 *
 * Boots the full agent against firmware mocks and opens a readline REPL
 * so you can chat with the agent in your terminal like a real user would.
 *
 * Usage:
 *   npm run agent            (starts the interactive REPL)
 *   npm run agent:scenario   (runs the built-in real-case script)
 *
 * Architecture:
 *   - Firmware globals (wallet, rpc, price, ens, history, scheduler, ui)
 *     are injected via the mock modules before anything else runs.
 *   - ui.onInput / ui.render are bridged to readline so the conversation
 *     flows naturally in the terminal.
 */

'use strict';

// ─── 1. Load firmware mocks as globals ────────────────────────────────────────
import '../firmware/mock/wallet.js';
import '../firmware/mock/rpc.js';
import '../firmware/mock/price.js';
import '../firmware/mock/ens.js';
import '../firmware/mock/history.js';
import '../firmware/mock/ui.js';

// ─── 2. Override ui.render to pretty-print to the terminal ───────────────────
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: '\n🔐 You: ',
});

const COLORS = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

function agentPrint(text) {
  process.stdout.write(`\n${COLORS.cyan}${COLORS.bold}🤖 Vault:${COLORS.reset} ${COLORS.cyan}${text}${COLORS.reset}\n`);
}

// Override the mock ui.render to print nicely instead of raw JSON
globalThis.ui.render = function render(component) {
  switch (component.type) {
    case 'welcome':
      agentPrint(`Welcome! I'm Vault, your hardware wallet AI agent.\nConnected wallet: ${component.address}\n\nType anything to get started. Try:\n  • "Send 0.1 ETH to vitalik.eth"\n  • "What's my balance?"\n  • "If ETH < $2000, buy 2 ETH"\n  • "help"`);
      break;
    case 'chat':
      agentPrint(component.message?.text ?? component.message);
      break;
    case 'error':
      process.stdout.write(`\n${COLORS.red}❌ ${component.message}${COLORS.reset}\n`);
      break;
    case 'fatal':
      process.stdout.write(`\n${COLORS.red}💀 FATAL: ${component.message}${COLORS.reset}\n`);
      process.exit(1);
      break;
    default:
      agentPrint(JSON.stringify(component, null, 2));
  }
};

// Override ui.confirm to use readline
globalThis.ui.confirm = async function confirm(message) {
  return new Promise((resolve) => {
    process.stdout.write(`\n${COLORS.yellow}❓ ${message} [y/n]: ${COLORS.reset}`);
    rl.once('line', (answer) => {
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
};

// Bridge readline lines → ui.onInput listeners
let _inputListeners = [];
globalThis.ui.onInput = function onInput(callback) {
  _inputListeners.push(callback);
};

rl.on('line', (line) => {
  const cb = _inputListeners.shift();
  if (cb) {
    cb(line.trim());
  } else {
    // Buffer for next onInput call
    setTimeout(() => {
      const pending = _inputListeners.shift();
      if (pending) { pending(line.trim()); }
    }, 50);
  }
  rl.prompt();
});

rl.on('close', () => {
  process.stdout.write(`\n${COLORS.dim}Session ended. Goodbye!${COLORS.reset}\n`);
  process.exit(0);
});

// ─── 3. Boot the agent ────────────────────────────────────────────────────────
process.stdout.write(`${COLORS.bold}${COLORS.cyan}
╔══════════════════════════════════════════╗
║       VAULT AI AGENT — DEV MODE          ║
║       Firmware: MOCK  |  LLM: Router     ║
╚══════════════════════════════════════════╝
${COLORS.reset}`);

// Dynamic import so mocks are registered on globalThis first
const { default: _ } = await import('../src/agent/index.js').catch((err) => {
  console.error('Failed to boot agent:', err);
  process.exit(1);
});

// Give the boot sequence a moment to print welcome, then show prompt
setTimeout(() => rl.prompt(), 300);

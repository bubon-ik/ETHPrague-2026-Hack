/**
 * dev/scenario-real.js — Real-API end-to-end scenario
 *
 * Runs a full 10-turn conversation through the real OpenRouter LLM.
 * Firmware globals (wallet, rpc, price, ens, history, scheduler, ui)
 * are still mocked so no real funds are moved.
 *
 * Usage:
 *   npm run scenario:real
 *
 * Requires OPENROUTER_API_KEY in .env
 */

'use strict';

// ─── Boot firmware mocks ──────────────────────────────────────────────────────
import '../firmware/mock/wallet.js';
import '../firmware/mock/rpc.js';
import '../firmware/mock/price.js';
import '../firmware/mock/ens.js';
import '../firmware/mock/history.js';
import '../firmware/mock/ui.js';

// ─── Core modules ─────────────────────────────────────────────────────────────
import { llmChat }           from '../src/llm/client.js';
import { router }            from '../src/agent/router.js';
import { ContextManager }    from '../src/agent/context.js';
import { buildSystemPrompt } from '../src/agent/prompts/system.js';
import { config }            from '../src/config.js';

// ─── Terminal colours ─────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
};

function sep(label) {
  const line = '─'.repeat(56);
  console.log(`\n${C.bold}${C.magenta}${line}${C.reset}`);
  console.log(`${C.bold}${C.yellow}▶ ${label}${C.reset}`);
  console.log(`${C.dim}${line}${C.reset}`);
}
function userLine(msg)  { console.log(`\n${C.bold}You:${C.reset}   ${msg}`); }
function agentLine(msg) { console.log(`\n${C.cyan}${C.bold}Vault:${C.reset}${C.cyan} ${msg}${C.reset}`); }
function infoLine(msg)  { console.log(`${C.dim}       ${msg}${C.reset}`); }
function errLine(msg)   { console.log(`\n${C.red}ERROR: ${msg}${C.reset}`); }

// ─── Scenario steps ───────────────────────────────────────────────────────────
const STEPS = [
  { label: '1. Portfolio query',              msg: "What's my balance?" },
  { label: '2. Price query',                  msg: 'What is the current ETH price?' },
  { label: '3. Send ETH to ENS',              msg: 'Send 0.1 ETH to vitalik.eth' },
  { label: '4. Swap USDC → ETH',              msg: 'Swap 100 USDC to ETH' },
  { label: '5. Price automation rule',        msg: 'If ETH drops below $2000, automatically buy 2 ETH' },
  { label: '6. List automation rules',        msg: 'Show my active automation rules' },
  { label: '7. Transaction history',          msg: 'Show my last 5 transactions' },
  { label: '8. ENS domain search',            msg: 'I want the domain vaultai.eth' },
  { label: '9. Help',                         msg: 'help' },
  { label: '10. Unknown / edge case',         msg: 'do something weird xyz' },
];

// ─── Auto-confirm all mock transactions ───────────────────────────────────────
globalThis.ui._setConfirmResponse(true);

// ─── Boot context with system prompt ─────────────────────────────────────────
const context = new ContextManager();
context.setSystem(buildSystemPrompt());

console.log(`${C.bold}${C.cyan}
╔══════════════════════════════════════════════════╗
║   VAULT AI AGENT — REAL API SCENARIO             ║
║   Model: ${config.openrouter.model.padEnd(39)}║
║   Firmware: MOCK  |  LLM: OpenRouter (LIVE)      ║
╚══════════════════════════════════════════════════╝
${C.reset}`);

let passed = 0;
let failed = 0;
let totalTokens = 0;

for (const step of STEPS) {
  sep(step.label);
  userLine(step.msg);

  try {
    // ── Step A: regex-classify + run action handler (firmware logic) ───────
    const actionResult = await router.dispatch(step.msg, context);

    // ── Step B: send to LLM — system prompt + full context + action result ─
    // Augment the user turn with the action output so the LLM can reference it
    const llmMessages = [
      ...context.getMessages(),
      { role: 'user', content: step.msg },
      {
        role: 'system',
        content: `[Action handler output — use this as ground truth for your response]\n${actionResult.text}`,
      },
    ];

    const llmResult = await llmChat(llmMessages, { temperature: 0.3 });
    totalTokens += llmResult.usage?.total_tokens ?? 0;

    // ── Step C: update context with raw agent output ───────────────────────
    context.addUser(step.msg);
    context.addAssistant(llmResult.text);

    agentLine(llmResult.text);
    infoLine(`tokens: ${llmResult.usage?.total_tokens ?? '?'}  |  intent: ${router.classify(step.msg)}`);
    passed++;

  } catch (err) {
    errLine(err.message);
    console.error(err);
    failed++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${C.bold}${'═'.repeat(56)}${C.reset}`);
console.log(`${C.bold}RESULTS:  ${C.green}${passed} passed${C.reset}  ${failed > 0 ? C.red : ''}${failed} failed${C.reset} / ${STEPS.length} total`);
console.log(`${C.bold}TOKENS:   ${totalTokens} total used${C.reset}`);
console.log(`${C.bold}MODEL:    ${config.openrouter.model}${C.reset}`);
console.log(`${C.bold}${'═'.repeat(56)}${C.reset}\n`);

process.exit(failed > 0 ? 1 : 0);

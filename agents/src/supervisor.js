import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { checkDomainAvailability, checkAgentDomain } from './agents/ensAgent.js';
import {
  prepareMarketAction,
  executeMarketAction,
} from './agents/marketAgent.js';
import { archiveSession } from './agents/historyAgent.js';

const SUPERVISOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(path.join(SUPERVISOR_DIR, '..', 'PROMPT.md'), 'utf-8');

/**
 * Models often put `amount` / `token` next to `action` instead of inside `payload`.
 * Merge those into a single payload object for the market agent.
 */
function mergeMarketToolPayload(args) {
  const base =
    args?.payload != null &&
    typeof args.payload === "object" &&
    !Array.isArray(args.payload)
      ? { ...args.payload }
      : {};

  const copyIfMissing = (fromKey, toKey = fromKey) => {
    const v = args[fromKey];
    if (v != null && v !== "" && base[toKey] == null) base[toKey] = v;
  };

  copyIfMissing("amount");
  copyIfMissing("token");
  copyIfMissing("domain");
  copyIfMissing("to");
  copyIfMissing("recipient");
  copyIfMissing("outputRecipient", "recipient");
  copyIfMissing("buyer", "recipient");
  copyIfMissing("address", "to");
  copyIfMissing("value", "amount");
  copyIfMissing("eth", "amount");
  copyIfMissing("sellAmount", "amount");
  copyIfMissing("quantity", "amount");
  copyIfMissing("fromAmount", "amount");

  return base;
}

/** OpenRouter free/low-credit tiers often cap completion budget below 600 — default lower to avoid 402. */
function getMaxOutputTokens() {
  const raw =
    process.env.SUPERVISOR_MAX_TOKENS ??
    process.env.OPENROUTER_MAX_TOKENS ??
    "";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 64 && n <= 4096) {
    return Math.floor(n);
  }
  return 400;
}

const tools = [
  {
    type: "function",
    function: {
      name: "check_domain",
      description:
        "ENS Agent (read-only): checks .eth availability on mainnet-oriented sources. Returns JSON with status AVAILABLE|TAKEN|CONFLICT|ERROR and canonicalName. Call this FIRST when the user asks if a name is free. Do NOT call prepare_market_action until the user wants to register on Sepolia after an AVAILABLE result.",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description:
              "Full ENS name, e.g. 'coolguy.eth'. Use the same spelling the user gave after normalization.",
          },
        },
        required: ["domain"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "check_ens_agent",
      description: "Fetch AI agent metadata from an ENS domain using ENSIP-26.",
      parameters: {
        type: "object",
        properties: {
          ensName: { type: "string", description: "The ENS name to check for agent metadata (e.g., bot.eth)" }
        },
        required: ["ensName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_market_action",
      description:
        "First step for value-moving actions on Sepolia: quote (swap, ENS registration fee, OR native ETH send). Returns approval_id — no spend yet. For BUY_DOMAIN: only after check_domain was AVAILABLE and the user agreed to register on Sepolia; use payload { domain: 'name.eth' } matching the checked name. For SWAP_TOKEN: payload { token: 'ETH'|'USDC', amount } — sell that token for the pair (ETH↔USDC on Sepolia Uniswap V3). Optional recipient: **0x address or ENS name** (resolved on **Sepolia**) for who receives bought tokens (default: user's wallet). For SEND_NATIVE: payload { to: '0x...' or 'name.eth', amount } — raw ETH transfer. After showing the quote, ask confirmation; then execute_market_action. Fields may be top-level or inside payload.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["BUY_DOMAIN", "SWAP_TOKEN", "SEND_NATIVE"],
          },
          payload: {
            type: "object",
            description:
              "BUY_DOMAIN: { domain: 'name.eth' }. SWAP_TOKEN: { token, amount, recipient?: '0x...'|'name.eth' } — recipient gets output tokens (ENS on Sepolia). SEND_NATIVE: { to, amount } — to may be 0x or ENS (Sepolia). Same fields may be passed at top level instead.",
          },
          duration_years: {
            type: "number",
            description: "ENS registration length in years (default 1). Only for BUY_DOMAIN.",
          },
          amount: {
            anyOf: [{ type: "number" }, { type: "string" }],
            description:
              "Optional alternative to payload.amount — sell quantity (e.g. 0.01 ETH). String or number.",
          },
          token: {
            type: "string",
            description:
              "Optional alternative to payload.token — sell-side symbol ETH or USDC.",
          },
          domain: {
            type: "string",
            description:
              "Optional alternative to payload.domain for BUY_DOMAIN.",
          },
          to: {
            type: "string",
            description:
              "Optional alternative to payload.to — recipient 0x or ENS (Sepolia) for SEND_NATIVE.",
          },
          recipient: {
            type: "string",
            description:
              "Optional for SWAP_TOKEN: 0x address or ENS name (Sepolia) that receives bought tokens. Omit to use the signing wallet.",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_market_action",
      description:
        "Second step: submit on-chain txs ONLY after the user approved the prepare_market_action quote. Same approval_id, action, and payload as prepare (BUY_DOMAIN: same domain; SWAP_TOKEN: same token/amount; SEND_NATIVE: same to + amount). Use after user says yes/confirm.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["BUY_DOMAIN", "SWAP_TOKEN", "SEND_NATIVE"],
          },
          payload: {
            type: "object",
            description:
              "Must match prepare: BUY_DOMAIN { domain }. SWAP_TOKEN { token, amount, recipient? }. SEND_NATIVE { to, amount } — same decimals as quoted. May use top-level fields instead.",
          },
          approval_id: {
            type: "string",
            description: "The approval_id returned by prepare_market_action.",
          },
          amount: {
            anyOf: [{ type: "number" }, { type: "string" }],
            description: "Must match prepare — optional alternative to payload.amount.",
          },
          token: {
            type: "string",
            description: "Must match prepare — optional alternative to payload.token.",
          },
          domain: {
            type: "string",
            description: "Must match prepare — optional alternative to payload.domain.",
          },
          to: {
            type: "string",
            description:
              "Must match prepare — optional alternative to payload.to for SEND_NATIVE.",
          },
          recipient: {
            type: "string",
            description:
              "Must match prepare for SWAP_TOKEN — who receives bought tokens.",
          },
        },
        required: ["action", "approval_id"],
      },
    },
  },
];

export class SupervisorAgent {
  constructor(apiKey) {
    const config = { apiKey };
    if (apiKey.startsWith("sk-or")) {
      config.baseURL = "https://openrouter.ai/api/v1";
      config.defaultHeaders = {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AIManager",
      };
      this.modelName = "openai/gpt-4o";
    } else {
      this.modelName = "gpt-4o";
    }
    this.openai = new OpenAI(config);
    this.actionsTaken = [];
  }

  async handleRequest(userRequest, options = {}) {
    const history = Array.isArray(options.history) ? options.history : [];
    const prior = history
      .filter(
        (h) =>
          h &&
          (h.role === "user" || h.role === "assistant") &&
          typeof h.content === "string",
      )
      .slice(-40)
      .map((h) => ({ role: h.role, content: h.content }));

    console.log(`\n======================================================`);
    console.log(`[User]: ${userRequest}`);
    if (prior.length) console.log(`[History turns]: ${prior.length}`);

    this.actionsTaken = [];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...prior,
      { role: "user", content: userRequest },
    ];

    try {
      const finalContent = await this.executeConversation(messages, userRequest);
      return finalContent;
    } catch (error) {
      console.error("[Supervisor Error]:", error.message);
      throw error;
    }
  }

  async executeConversation(messages, userRequest) {
    let isComplete = false;
    let finalResponse = "";

    while (!isComplete) {
      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: messages,
        tools: tools,
        max_tokens: getMaxOutputTokens(),
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (message.content) {
        console.log(`\n[Supervisor Output]:\n${message.content}`);
        finalResponse = message.content;
      }

      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let functionResult = "";

          console.log(`\n[Agent Dispatch]: Dispatching to ${functionName} with args:`, args);
          this.actionsTaken.push({ action: functionName, args });

          if (functionName === "check_domain") {
            functionResult = JSON.stringify(await checkDomainAvailability(args.domain));
          } else if (functionName === "check_ens_agent") {
            functionResult = JSON.stringify(await checkAgentDomain(args.ensName));
          } else if (functionName === "prepare_market_action") {
            const dy = args.duration_years ?? 1;
            functionResult = JSON.stringify(
              await prepareMarketAction(args.action, mergeMarketToolPayload(args), dy),
            );
          } else if (functionName === "execute_market_action") {
            functionResult = JSON.stringify(
              await executeMarketAction(
                args.action,
                mergeMarketToolPayload(args),
                args.approval_id,
              ),
            );
          }

          console.log(`[Worker Response]:`, functionResult);

          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: functionResult,
          });
        }
      } else {
        isComplete = true;
      }
    }

    const logData = {
      timestamp: new Date().toISOString(),
      user_request: userRequest,
      actions_taken: this.actionsTaken,
      outcome: finalResponse,
    };

    await archiveSession(logData);
    console.log(`\n======================================================\n`);
    return finalResponse;
  }
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { checkDomainAvailability, checkAgentDomain } from './agents/ensAgent.js';
import { executeTransaction } from './agents/marketAgent.js';
import { archiveSession } from './agents/historyAgent.js';

const SUPERVISOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(path.join(SUPERVISOR_DIR, '..', 'PROMPT.md'), 'utf-8');

const tools = [
  {
    type: "function",
    function: {
      name: "check_domain",
      description: "Checks if an ENS (.eth) domain is available.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "The ENS domain to check, e.g., 'coolguy.eth'" }
        },
        required: ["domain"]
      }
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
      name: "execute_market_action",
      description: "Executes a domain purchase or a token swap.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["BUY_DOMAIN", "SWAP_TOKEN"] },
          payload: { 
            type: "object", 
            description: "Payload for the action. For BUY_DOMAIN: { domain: '...' }. For SWAP_TOKEN: { token: 'ETH', amount: 0.5 }"
          }
        },
        required: ["action", "payload"]
      }
    }
  }
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
      this.modelName = "openai/gpt-4o"; // OpenRouter specific model string
    } else {
      this.modelName = "gpt-4o";
    }
    this.openai = new OpenAI(config);
    this.actionsTaken = [];
  }

  async handleRequest(userRequest) {
    console.log(`\n======================================================`);
    console.log(`[User]: ${userRequest}`);
    
    this.actionsTaken = [];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userRequest }
    ];

    try {
      const finalContent = await this.executeConversation(messages, userRequest);
      return finalContent;
    } catch (error) {
      console.error("[Supervisor Error]:", error.message);
      throw error;
    }
  }

  // A custom loop since `runTools` auto-execution is tricky to hook local async functions into cleanly
  // without defining a wrapper. We'll build a standard manual loop for better control.
  async executeConversation(messages, userRequest) {
    let isComplete = false;
    let finalResponse = "";

    while (!isComplete) {
      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: messages,
        tools: tools,
        max_tokens: 100,
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (message.content) {
        // Output any intermediate monologue
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
          } else if (functionName === "execute_market_action") {
            functionResult = JSON.stringify(await executeTransaction(args.action, args.payload));
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

    // Step C: Synthesis & Archival
    const logData = {
      timestamp: new Date().toISOString(),
      user_request: userRequest,
      actions_taken: this.actionsTaken,
      outcome: finalResponse
    };

    await archiveSession(logData);
    console.log(`\n======================================================\n`);
    return finalResponse;
  }
}

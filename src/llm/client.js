/**
 * src/llm/client.js — OpenRouter HTTP client
 *
 * OpenAI-compatible chat completions via openrouter.ai.
 * Uses native fetch (Node 18+). No SDK dependency.
 */

'use strict';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Send a chat completion request to OpenRouter.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options]
 * @param {string} [options.model]       - Override the default model
 * @param {number} [options.maxTokens]   - Max tokens in response (default 1024)
 * @param {number} [options.temperature] - Sampling temperature (default 0.4)
 * @returns {Promise<{text: string, usage: object}>}
 */
export async function llmChat(messages, options = {}) {
  const { apiKey, baseUrl, model } = config.openrouter;

  if (!apiKey || apiKey === 'YOUR_OPENROUTER_API_KEY' || apiKey === 'sk-or-v1-...') {
    throw new Error('OPENROUTER_API_KEY is not configured in .env');
  }

  const body = {
    model:       options.model       ?? model,
    messages,
    max_tokens:  options.maxTokens   ?? 1024,
    temperature: options.temperature ?? 0.4,
  };

  logger.debug('LLM request', { model: body.model, turns: messages.length });

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://github.com/bubon-ik/ETHPrague-2026-Hack',
      'X-Title':       'Vault AI Agent - ETH Prague 2026',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(no body)');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${errBody}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(`Empty LLM response: ${JSON.stringify(data)}`);
  }

  logger.debug('LLM response', {
    tokens: data.usage?.total_tokens,
    model:  data.model,
  });

  return { text, usage: data.usage ?? {} };
}

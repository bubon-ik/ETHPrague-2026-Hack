/**
 * Conversation Context Manager
 *
 * Maintains a rolling window of conversation messages.
 * Hard limit: MAX_MESSAGES to preserve on-device memory.
 */

'use strict';

import { CONTEXT_MAX_MESSAGES } from '../utils/constants.js';

export class ContextManager {
  constructor() {
    /** @type {Array<{role: string, content: string}>} */
    this._messages = [];
    /** @type {string|null} */
    this._systemPrompt = null;
  }

  /**
   * Set or replace the system prompt.
   * @param {string} prompt
   */
  setSystem(prompt) {
    this._systemPrompt = prompt;
  }

  /**
   * Add a user message to the context.
   * @param {string} content
   */
  addUser(content) {
    this._push({ role: 'user', content });
  }

  /**
   * Add an assistant response to the context.
   * @param {string} content
   */
  addAssistant(content) {
    this._push({ role: 'assistant', content });
  }

  /**
   * Return all messages in LLM-ready format (system + rolling window).
   * @returns {Array<{role: string, content: string}>}
   */
  getMessages() {
    const result = [];
    if (this._systemPrompt) {
      result.push({ role: 'system', content: this._systemPrompt });
    }
    return result.concat(this._messages);
  }

  /**
   * Return the last N messages.
   * @param {number} n
   * @returns {Array<{role: string, content: string}>}
   */
  getLast(n) {
    return this._messages.slice(-n);
  }

  /**
   * Clear all messages but preserve system prompt.
   */
  clear() {
    this._messages = [];
  }

  /**
   * Current message count (excluding system prompt).
   * @returns {number}
   */
  get length() {
    return this._messages.length;
  }

  /**
   * Push a message and enforce the rolling window limit.
   * @param {{role: string, content: string}} message
   */
  _push(message) {
    this._messages.push(message);
    if (this._messages.length > CONTEXT_MAX_MESSAGES) {
      // Drop oldest messages in pairs (user + assistant) to preserve coherence
      this._messages.splice(0, 2);
    }
  }
}

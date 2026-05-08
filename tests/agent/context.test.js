/**
 * Tests: Context Window Manager
 */

'use strict';

import { ContextManager } from '../../../src/agent/context.js';
import { CONTEXT_MAX_MESSAGES } from '../../../src/utils/constants.js';

describe('ContextManager', () => {
  let ctx;

  beforeEach(() => {
    ctx = new ContextManager();
  });

  it('should start empty', () => {
    expect(ctx.length).toBe(0);
    expect(ctx.getMessages()).toEqual([]);
  });

  it('should include system prompt in getMessages()', () => {
    ctx.setSystem('You are Vault.');
    const messages = ctx.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are Vault.' });
  });

  it('should add user and assistant messages', () => {
    ctx.addUser('Hello');
    ctx.addAssistant('Hi there!');
    expect(ctx.length).toBe(2);

    const msgs = ctx.getMessages();
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('Hello');
    expect(msgs[1].role).toBe('assistant');
  });

  it('should enforce rolling window limit', () => {
    for (let i = 0; i < CONTEXT_MAX_MESSAGES + 5; i++) {
      ctx.addUser(`Message ${i}`);
      ctx.addAssistant(`Reply ${i}`);
    }
    // Should not exceed the max (pairs are dropped)
    expect(ctx.length).toBeLessThanOrEqual(CONTEXT_MAX_MESSAGES);
  });

  it('should return last N messages with getLast()', () => {
    ctx.addUser('A');
    ctx.addAssistant('B');
    ctx.addUser('C');
    const last = ctx.getLast(2);
    expect(last).toHaveLength(2);
    expect(last[last.length - 1].content).toBe('C');
  });

  it('should clear messages but preserve system prompt', () => {
    ctx.setSystem('System prompt');
    ctx.addUser('Hello');
    ctx.clear();
    expect(ctx.length).toBe(0);
    expect(ctx.getMessages()[0].role).toBe('system');
  });
});

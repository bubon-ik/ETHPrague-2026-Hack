/**
 * Tests: Send Action Handler
 */

'use strict';

import '../../../firmware/mock/wallet.js';
import '../../../firmware/mock/rpc.js';
import '../../../firmware/mock/price.js';
import '../../../firmware/mock/ens.js';
import '../../../firmware/mock/ui.js';

import { handleSend } from '../../../src/actions/send.js';
import { ContextManager } from '../../../src/agent/context.js';

describe('handleSend', () => {
  let context;

  beforeEach(() => {
    context = new ContextManager();
    globalThis.ui._setConfirmResponse(true);
    globalThis.ui._clearRenderLog();
  });

  it('should successfully send ETH to an ENS name', async () => {
    const response = await handleSend('Send 0.1 ETH to vitalik.eth', context);
    expect(response.text).toContain('✅');
    expect(response.text).toContain('vitalik.eth');
  });

  it('should return clarification for missing destination', async () => {
    const response = await handleSend('Send 0.1 ETH', context);
    expect(response.text).toContain('destination');
  });

  it('should cancel when user rejects confirmation', async () => {
    globalThis.ui._setConfirmResponse(false);
    const response = await handleSend('Send 0.1 ETH to vitalik.eth', context);
    expect(response.text).toContain('cancel');
  });

  it('should reject an invalid Ethereum address', async () => {
    const response = await handleSend('Send 0.1 ETH to 0xinvalid', context);
    expect(response.text).toMatch(/invalid|valid/i);
  });

  it('should reject zero amount', async () => {
    const response = await handleSend('Send 0 ETH to vitalik.eth', context);
    expect(response.text).toMatch(/greater than/i);
  });
});

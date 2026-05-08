/**
 * Tests: Swap Action Handler
 */

'use strict';

import '../../../firmware/mock/wallet.js';
import '../../../firmware/mock/rpc.js';
import '../../../firmware/mock/price.js';
import '../../../firmware/mock/ens.js';
import '../../../firmware/mock/ui.js';

import { handleSwap } from '../../../src/actions/swap.js';
import { ContextManager } from '../../../src/agent/context.js';

describe('handleSwap', () => {
  let context;

  beforeEach(() => {
    context = new ContextManager();
    globalThis.ui._setConfirmResponse(true);
  });

  it('should successfully swap USDC to ETH', async () => {
    const response = await handleSwap('Swap 100 USDC to ETH', context);
    expect(response.text).toContain('✅');
    expect(response.text).toContain('USDC');
    expect(response.text).toContain('ETH');
  });

  it('should return clarification for missing tokens', async () => {
    const response = await handleSwap('swap some tokens', context);
    expect(response.text).toContain('like');
  });

  it('should cancel when user declines', async () => {
    globalThis.ui._setConfirmResponse(false);
    const response = await handleSwap('Swap 100 USDC to ETH', context);
    expect(response.text).toContain('cancel');
  });

  it('should reject zero amount', async () => {
    const response = await handleSwap('Swap 0 USDC to ETH', context);
    expect(response.text).toMatch(/greater than/i);
  });
});

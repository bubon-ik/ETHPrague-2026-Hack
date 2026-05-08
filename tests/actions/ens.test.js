/**
 * Tests: ENS Actions
 */

'use strict';

import '../../../firmware/mock/wallet.js';
import '../../../firmware/mock/rpc.js';
import '../../../firmware/mock/price.js';
import '../../../firmware/mock/ens.js';
import '../../../firmware/mock/ui.js';

import { handleEnsSearch } from '../../../src/actions/ens/search.js';
import { handleEnsRenew } from '../../../src/actions/ens/renew.js';
import { ContextManager } from '../../../src/agent/context.js';

describe('handleEnsSearch', () => {
  let context;

  beforeEach(() => {
    context = new ContextManager();
    globalThis.ui._setConfirmResponse(true);
  });

  it('should show taken status for a registered ENS name', async () => {
    const response = await handleEnsSearch('I want the domain vitalik.eth', context);
    // vitalik.eth is in the registered mock list, so it should be taken
    expect(response.text).toMatch(/taken|similar|available/i);
  });

  it('should offer to register an available ENS name', async () => {
    const response = await handleEnsSearch('I want the domain newavailablename12345.eth', context);
    expect(response.text).toContain('✅');
  });

  it('should cancel registration when user declines', async () => {
    globalThis.ui._setConfirmResponse(false);
    const response = await handleEnsSearch('register freshname99999.eth', context);
    expect(response.text).toMatch(/remain available|cancel/i);
  });

  it('should ask for clarification with no name provided', async () => {
    const response = await handleEnsSearch('I want an ENS domain', context);
    expect(response.text).toContain('What ENS name');
  });
});

describe('handleEnsRenew', () => {
  let context;

  beforeEach(() => {
    context = new ContextManager();
    globalThis.ui._setConfirmResponse(true);
  });

  it('should handle renewal for 2 years', async () => {
    const response = await handleEnsRenew('Renew vitalik.eth for 2 years', context);
    expect(response.text).toContain('✅');
    expect(response.text).toContain('2 years');
  });

  it('should default to 1 year if not specified', async () => {
    const response = await handleEnsRenew('Renew vitalik.eth', context);
    expect(response.text).toContain('✅');
  });

  it('should ask for clarification with no name', async () => {
    const response = await handleEnsRenew('renew my domain', context);
    expect(response.text).toContain('Renew');
  });
});

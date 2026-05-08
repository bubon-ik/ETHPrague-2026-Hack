/**
 * Tests: Intent Router
 */

'use strict';

import '../../../firmware/mock/wallet.js';
import '../../../firmware/mock/rpc.js';
import '../../../firmware/mock/price.js';
import '../../../firmware/mock/ens.js';
import '../../../firmware/mock/ui.js';

import { router } from '../../../src/agent/router.js';
import { ContextManager } from '../../../src/agent/context.js';
import { INTENTS } from '../../../src/utils/constants.js';

describe('router.classify', () => {
  it('should classify "send" intent', () => {
    expect(router.classify('Send 0.1 ETH to vitalik.eth')).toBe(INTENTS.TX_SEND);
    expect(router.classify('transfer 100 USDC to alice.eth')).toBe(INTENTS.TX_SEND);
    expect(router.classify('pay my friend 50 DAI')).toBe(INTENTS.TX_SEND);
  });

  it('should classify "swap" intent', () => {
    expect(router.classify('Swap 100 USDC to ETH')).toBe(INTENTS.TX_SWAP);
    expect(router.classify('exchange my ETH for USDC')).toBe(INTENTS.TX_SWAP);
    expect(router.classify('convert 0.5 ETH to DAI')).toBe(INTENTS.TX_SWAP);
  });

  it('should classify "buy" intent', () => {
    expect(router.classify('Buy 0.5 ETH')).toBe(INTENTS.TX_BUY);
    expect(router.classify('purchase $500 of BTC')).toBe(INTENTS.TX_BUY);
  });

  it('should classify ENS intents', () => {
    expect(router.classify('I want the domain greenparrot.eth')).toBe(INTENTS.ENS_SEARCH);
    expect(router.classify('register coolname.eth')).toBe(INTENTS.ENS_SEARCH);
    expect(router.classify('renew vitalik.eth for 2 years')).toBe(INTENTS.ENS_RENEW);
  });

  it('should classify automation intents', () => {
    expect(router.classify('If ETH < $1000, buy 5 ETH')).toBe(INTENTS.AUTO_CREATE);
    expect(router.classify('Every Monday, swap 50 USDC to ETH')).toBe(INTENTS.AUTO_CREATE);
    expect(router.classify('my rules')).toBe(INTENTS.AUTO_LIST);
    expect(router.classify('cancel rule abc12345')).toBe(INTENTS.AUTO_CANCEL);
  });

  it('should classify query intents', () => {
    expect(router.classify('What is the ETH price?')).toBe(INTENTS.QUERY_PRICE);
    expect(router.classify('Show my balance')).toBe(INTENTS.QUERY_BALANCE);
    expect(router.classify('Show my last 5 transactions')).toBe(INTENTS.QUERY_HISTORY);
  });

  it('should return UNKNOWN for unrecognized input', () => {
    expect(router.classify('hello there')).toBe(INTENTS.UNKNOWN);
    expect(router.classify('')).toBe(INTENTS.UNKNOWN);
  });

  it('should classify help intent', () => {
    expect(router.classify('help')).toBe(INTENTS.HELP);
    expect(router.classify('what can you do?')).toBe(INTENTS.HELP);
  });
});

describe('router.dispatch', () => {
  let context;

  beforeEach(() => {
    context = new ContextManager();
    globalThis.ui._setConfirmResponse(true);
  });

  it('should return help text for help intent', async () => {
    const response = await router.dispatch('help', context);
    expect(response.text).toContain('Transactions');
    expect(response.text).toContain('ENS');
  });

  it('should return clarification for unknown intent', async () => {
    const response = await router.dispatch('blah blah blah', context);
    expect(response.text).toContain('understand');
  });
});

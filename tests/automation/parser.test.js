/**
 * Tests: Automation Rule Parser
 */

'use strict';

import { parseRule } from '../../../src/automation/parser.js';

describe('parseRule', () => {
  it('should parse a price threshold rule', () => {
    const rule = parseRule('If ETH < $1000, buy 5 ETH');
    expect(rule).toBeTruthy();
    expect(rule.condition.type).toBe('price');
    expect(rule.condition.asset).toBe('ETH');
    expect(rule.condition.op).toBe('<');
    expect(rule.condition.value).toBe(1000);
    expect(rule.action.type).toBe('tx.buy');
    expect(rule.action.amount).toBe(5);
    expect(rule.action.asset).toBe('ETH');
  });

  it('should parse a time-based rule', () => {
    const rule = parseRule('Every Monday, swap 50 USDC to ETH');
    expect(rule).toBeTruthy();
    expect(rule.condition.type).toBe('time');
    expect(rule.condition.schedule.toLowerCase()).toContain('monday');
    expect(rule.action.type).toBe('tx.swap');
    expect(rule.action.fromAsset).toBe('USDC');
    expect(rule.action.toAsset).toBe('ETH');
  });

  it('should parse a balance rule', () => {
    const rule = parseRule('If my USDC balance > 10000, move 5000 USDC to 0x1234567890123456789012345678901234567890');
    expect(rule).toBeTruthy();
    expect(rule.condition.type).toBe('balance');
    expect(rule.condition.asset).toBe('USDC');
    expect(rule.condition.op).toBe('>');
    expect(rule.condition.value).toBe(10000);
  });

  it('should parse an ENS expiry rule', () => {
    const rule = parseRule('If my ENS expires in < 30 days, renew it for 1 year');
    expect(rule).toBeTruthy();
    expect(rule.condition.type).toBe('expiry');
    expect(rule.condition.days).toBe(30);
    expect(rule.action.type).toBe('ens.renew');
    expect(rule.action.years).toBe(1);
  });

  it('should return null for unrecognized input', () => {
    expect(parseRule('do something magic')).toBeNull();
    expect(parseRule('')).toBeNull();
    expect(parseRule('buy ETH')).toBeNull(); // No condition
  });

  it('should assign a unique ID to each rule', () => {
    const rule1 = parseRule('If ETH < $1000, buy 5 ETH');
    const rule2 = parseRule('If ETH < $2000, buy 1 ETH');
    expect(rule1.id).toBeTruthy();
    expect(rule2.id).toBeTruthy();
    expect(rule1.id).not.toBe(rule2.id);
  });

  it('should default confirmEachExecution to true', () => {
    const rule = parseRule('If ETH < $500, buy 2 ETH');
    expect(rule.confirmEachExecution).toBe(true);
  });
});

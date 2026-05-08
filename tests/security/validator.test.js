/**
 * Tests: Security Validator
 */

'use strict';

import { validateAddress, validateEnsName, validateAmount, scoreTransactionRisk, sanitizeString } from '../../../src/security/validator.js';

describe('validateAddress', () => {
  it('should accept a valid Ethereum address', () => {
    const result = validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(result.valid).toBe(true);
    expect(result.address).toBeTruthy();
    expect(result.reason).toBeNull();
  });

  it('should reject an address that is too short', () => {
    const result = validateAddress('0x1234');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('should reject a null input', () => {
    const result = validateAddress(null);
    expect(result.valid).toBe(false);
  });

  it('should reject non-hex characters', () => {
    const result = validateAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ');
    expect(result.valid).toBe(false);
  });
});

describe('validateEnsName', () => {
  it('should accept valid ENS names', () => {
    expect(validateEnsName('vitalik.eth').valid).toBe(true);
    expect(validateEnsName('greenparrot.eth').valid).toBe(true);
    expect(validateEnsName('my-name.eth').valid).toBe(true);
  });

  it('should add .eth suffix if missing', () => {
    const result = validateEnsName('vitalik');
    expect(result.valid).toBe(true);
    expect(result.name).toBe('vitalik.eth');
  });

  it('should reject names with invalid characters', () => {
    expect(validateEnsName('my_name.eth').valid).toBe(false);
    expect(validateEnsName('hello world.eth').valid).toBe(false);
  });

  it('should reject empty input', () => {
    expect(validateEnsName('').valid).toBe(false);
  });
});

describe('validateAmount', () => {
  it('should accept valid amounts', () => {
    expect(validateAmount('0.1').valid).toBe(true);
    expect(validateAmount('100').valid).toBe(true);
    expect(validateAmount(0.5).valid).toBe(true);
  });

  it('should reject zero and negative amounts', () => {
    expect(validateAmount('0').valid).toBe(false);
    expect(validateAmount('-1').valid).toBe(false);
  });

  it('should reject non-numeric input', () => {
    expect(validateAmount('abc').valid).toBe(false);
  });

  it('should enforce max limit', () => {
    expect(validateAmount('100', { max: 50 }).valid).toBe(false);
    expect(validateAmount('49', { max: 50 }).valid).toBe(true);
  });
});

describe('scoreTransactionRisk', () => {
  it('should return low score for normal transaction', () => {
    const { score, flags } = scoreTransactionRisk({
      to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      amountUsd: 1000,
      gasUsd: 1.5,
      isNewAddress: false,
    });
    expect(score).toBeLessThan(3);
    expect(flags).toHaveLength(0);
  });

  it('should flag high gas ratio', () => {
    const { score, flags } = scoreTransactionRisk({
      to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      amountUsd: 10,
      gasUsd: 5,
      isNewAddress: false,
    });
    expect(score).toBeGreaterThanOrEqual(3);
    expect(flags.some((f) => f.includes('Gas'))).toBe(true);
  });

  it('should flag new address', () => {
    const { score, flags } = scoreTransactionRisk({
      to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      amountUsd: 100,
      gasUsd: 1,
      isNewAddress: true,
    });
    expect(flags.some((f) => f.includes('New address'))).toBe(true);
  });
});

describe('sanitizeString', () => {
  it('should strip control characters', () => {
    const result = sanitizeString('hello\x00world\x1F');
    expect(result).toBe('helloworld');
  });

  it('should truncate to maxLength', () => {
    const result = sanitizeString('a'.repeat(300), 100);
    expect(result.length).toBe(100);
  });
});

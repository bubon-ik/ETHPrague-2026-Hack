/**
 * Security Validator
 *
 * All user-supplied input must pass through this module before use.
 * Validates addresses, amounts, ENS names, and computes risk scores.
 */

'use strict';

import { logger } from '../utils/logger.js';

// Ethereum address checksum regex (simplified — production would use eth_checksumAddress)
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ENS name validation: lowercase letters, digits, hyphens, dot-separated labels
const ENS_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.eth$/i;

/**
 * Validate and normalize an Ethereum address.
 * @param {string} input
 * @returns {{ valid: boolean, address: string|null, reason: string|null }}
 */
export function validateAddress(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, address: null, reason: 'Address must be a non-empty string.' };
  }
  const trimmed = input.trim();
  if (!ETH_ADDRESS_RE.test(trimmed)) {
    return { valid: false, address: null, reason: `"${trimmed.slice(0, 10)}..." is not a valid Ethereum address.` };
  }
  return { valid: true, address: trimmed.toLowerCase(), reason: null };
}

/**
 * Validate an ENS name.
 * @param {string} input
 * @returns {{ valid: boolean, name: string|null, reason: string|null }}
 */
export function validateEnsName(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, name: null, reason: 'ENS name must be a non-empty string.' };
  }
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`;

  if (!ENS_NAME_RE.test(normalized)) {
    return { valid: false, name: null, reason: `"${trimmed}" is not a valid ENS name. Only letters, numbers, and hyphens allowed.` };
  }
  return { valid: true, name: normalized, reason: null };
}

/**
 * Validate a token amount.
 * @param {string|number} input
 * @param {object} options
 * @param {number} [options.max] - Maximum allowed value
 * @param {number} [options.min] - Minimum allowed value (default: 0)
 * @returns {{ valid: boolean, amount: number|null, reason: string|null }}
 */
export function validateAmount(input, { max, min = 0 } = {}) {
  const value = parseFloat(String(input));

  if (isNaN(value)) {
    return { valid: false, amount: null, reason: `"${input}" is not a valid number.` };
  }
  if (value <= min) {
    return { valid: false, amount: null, reason: `Amount must be greater than ${min}.` };
  }
  if (max !== undefined && value > max) {
    return { valid: false, amount: null, reason: `Amount ${value} exceeds maximum allowed ${max}.` };
  }

  return { valid: true, amount: value, reason: null };
}

/**
 * Compute a risk score for a transaction (0 = low, 10 = high).
 * @param {object} tx
 * @param {string} tx.to - Destination address
 * @param {number} tx.amountUsd - Transaction value in USD
 * @param {number} tx.gasUsd - Gas cost in USD
 * @param {boolean} tx.isNewAddress - Whether destination has never been sent to
 * @returns {{ score: number, flags: string[] }}
 */
export function scoreTransactionRisk(tx) {
  const flags = [];
  let score = 0;

  const gasRatio = tx.gasUsd / tx.amountUsd;

  if (tx.isNewAddress) {
    score += 3;
    flags.push('New address — not seen in your transaction history.');
  }
  if (gasRatio > 0.15) {
    score += 3;
    flags.push(`Gas cost is ${(gasRatio * 100).toFixed(1)}% of transaction value.`);
  }
  if (tx.amountUsd > 10_000) {
    score += 2;
    flags.push('Large transaction amount (> $10,000).');
  }
  if (gasRatio > 0.5) {
    score += 2;
    flags.push('Gas cost exceeds 50% of transaction value — this seems very high.');
  }

  logger.info('Transaction risk scored', { score, flagCount: flags.length });
  return { score, flags };
}

/**
 * Sanitize a raw user string (remove control characters, truncate).
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeString(input, maxLength = 200) {
  if (!input || typeof input !== 'string') { return ''; }
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
    .slice(0, maxLength)
    .trim();
}

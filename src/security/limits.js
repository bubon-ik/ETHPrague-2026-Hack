/**
 * Security Limits
 * Gas cap enforcement, amount limits, and rate limiting.
 */

'use strict';

import { GAS_RATIO_WARN_THRESHOLD, MAX_SIGN_ATTEMPTS_PER_MINUTE } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/** Sign attempt timestamps (rolling 60-second window) */
const signAttempts = [];

/**
 * Check gas-to-value ratio and return whether it exceeds the threshold.
 * @param {number} gasUsd
 * @param {number} txValueUsd
 * @returns {{ exceeded: boolean, ratio: number, threshold: number }}
 */
export function checkGasRatio(gasUsd, txValueUsd) {
  if (txValueUsd <= 0) {
    return { exceeded: false, ratio: 0, threshold: GAS_RATIO_WARN_THRESHOLD };
  }
  const ratio = gasUsd / txValueUsd;
  const exceeded = ratio > GAS_RATIO_WARN_THRESHOLD;

  if (exceeded) {
    logger.warn('Gas ratio exceeded threshold', { ratio: ratio.toFixed(4), threshold: GAS_RATIO_WARN_THRESHOLD });
  }

  return { exceeded, ratio, threshold: GAS_RATIO_WARN_THRESHOLD };
}

/**
 * Record a signing attempt and check if rate limit is exceeded.
 * @returns {{ allowed: boolean, attemptsInWindow: number }}
 */
export function checkSignRateLimit() {
  const now = Date.now();
  const windowStart = now - 60_000;

  // Prune old attempts
  while (signAttempts.length > 0 && signAttempts[0] < windowStart) {
    signAttempts.shift();
  }

  if (signAttempts.length >= MAX_SIGN_ATTEMPTS_PER_MINUTE) {
    logger.warn('Sign rate limit exceeded', { attempts: signAttempts.length });
    return { allowed: false, attemptsInWindow: signAttempts.length };
  }

  signAttempts.push(now);
  return { allowed: true, attemptsInWindow: signAttempts.length };
}

/**
 * Check if an amount represents more than a given percentage of balance.
 * @param {number} amount - Amount to send
 * @param {number} balance - Total available balance
 * @param {number} thresholdPct - Warning threshold (e.g. 0.9 for 90%)
 * @returns {{ warn: boolean, pct: number }}
 */
export function checkBalanceThreshold(amount, balance, thresholdPct = 0.9) {
  if (balance <= 0) { return { warn: false, pct: 0 }; }
  const pct = amount / balance;
  return { warn: pct >= thresholdPct, pct };
}

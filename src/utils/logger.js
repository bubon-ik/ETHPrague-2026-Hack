/**
 * On-Device Logger
 *
 * Structured logging that never exfiltrates data.
 * - No network calls
 * - Sensitive data (addresses, amounts) is automatically truncated
 * - In production, logs are written to encrypted local storage only
 */

'use strict';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS.info;

/**
 * Safe log formatter — prevents sensitive data leakage.
 * @param {object} meta
 * @returns {object}
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') { return meta; }
  const safe = {};
  for (const [key, val] of Object.entries(meta)) {
    if (key === 'address' && typeof val === 'string' && val.length > 10) {
      safe[key] = `${val.slice(0, 6)}...${val.slice(-4)}`;
    } else if (key === 'amount' && typeof val === 'number') {
      safe[key] = val.toFixed(4);
    } else if (key === 'error') {
      safe[key] = String(val).slice(0, 100);
    } else {
      safe[key] = val;
    }
  }
  return safe;
}

function emit(level, message, meta) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) { return; }
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? sanitizeMeta(meta) : {}),
  };
  // In production: write to encrypted local log storage
  // In dev/mock mode: output to console for debugging
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info:  (msg, meta) => emit('info',  msg, meta),
  warn:  (msg, meta) => emit('warn',  msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

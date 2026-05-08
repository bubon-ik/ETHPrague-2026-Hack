/**
 * Local Audit Log
 * Writes transaction events to encrypted on-device storage.
 * Never exfiltrates data. Masks sensitive fields.
 */

'use strict';

import { formatAddress } from '../utils/format.js';
import { logger } from '../utils/logger.js';

/** In-memory audit log (in production: encrypted persistent storage) */
const auditLog = [];

/**
 * Record a completed or attempted transaction.
 * @param {object} event
 * @param {string} event.type - 'send' | 'swap' | 'buy' | 'ens_register' | 'ens_renew'
 * @param {string} event.status - 'signed' | 'rejected' | 'failed'
 * @param {string} [event.to] - Destination address
 * @param {string} [event.asset]
 * @param {number} [event.amount]
 * @param {string} [event.txHash] - Only first 10 chars stored
 * @param {string} [event.network]
 */
export function auditRecord(event) {
  const entry = {
    ts: new Date().toISOString(),
    type: event.type,
    status: event.status,
    to: event.to ? formatAddress(event.to) : undefined,
    asset: event.asset,
    amount: event.amount,
    txHash: event.txHash ? event.txHash.slice(0, 10) + '...' : undefined,
    network: event.network,
  };

  auditLog.push(entry);
  logger.info('Audit record written', { type: entry.type, status: entry.status });
}

/**
 * Return recent audit log entries.
 * @param {number} limit
 * @returns {object[]}
 */
export function getAuditLog(limit = 20) {
  return auditLog.slice(-limit);
}

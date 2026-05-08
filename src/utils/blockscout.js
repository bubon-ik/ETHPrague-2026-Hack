/**
 * Blockscout Data Utility
 * Handles ENS lookup and transaction history analysis using Blockscout data.
 */

'use strict';

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

const DATA_PATH = path.join(process.cwd(), 'data', 'transactions.json');

/**
 * Load and parse Blockscout transactions.
 * @returns {Promise<object[]>}
 */
export async function loadBlockscoutTransactions() {
  try {
    const content = await fs.readFile(DATA_PATH, 'utf-8');
    const data = JSON.parse(content);
    return data.items || [];
  } catch (err) {
    logger.error('Failed to load Blockscout transactions', { error: err.message });
    return [];
  }
}

/**
 * Find the ENS domain name for a given address from transaction history.
 * @param {string} address 
 * @returns {Promise<string|null>}
 */
export async function findEnsFromHistory(address) {
  const items = await loadBlockscoutTransactions();
  const lowerAddr = address.toLowerCase();

  for (const item of items) {
    if (item.from?.hash?.toLowerCase() === lowerAddr && item.from.ens_domain_name) {
      return item.from.ens_domain_name;
    }
    if (item.to?.hash?.toLowerCase() === lowerAddr && item.to.ens_domain_name) {
      return item.to.ens_domain_name;
    }
  }
  return null;
}

/**
 * Get all discovered ENS names from history.
 * @returns {Promise<Map<string, string>>} Address -> ENS mapping
 */
export async function getDiscoveredEnsNames() {
  const items = await loadBlockscoutTransactions();
  const mapping = new Map();

  for (const item of items) {
    if (item.from?.ens_domain_name && item.from?.hash) {
      mapping.set(item.from.hash.toLowerCase(), item.from.ens_domain_name);
    }
    if (item.to?.ens_domain_name && item.to?.hash) {
      mapping.set(item.to.hash.toLowerCase(), item.to.ens_domain_name);
    }
  }
  return mapping;
}

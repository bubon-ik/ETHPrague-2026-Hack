/**
 * Blockscout API Client
 * Interfaces with Blockscout to resolve ENS names and fetch account details.
 */

'use strict';

import { logger } from './logger.js';

const BLOCKSCOUT_BASE_URL = process.env.BLOCKSCOUT_API_URL || 'https://eth.blockscout.com/api/v2';
const BLOCKSCOUT_API_KEY = process.env.BLOCKSCOUT_API_KEY;

/**
 * Fetch with Blockscout API Key if available.
 */
async function bsFetch(url) {
  const headers = {};
  if (BLOCKSCOUT_API_KEY) {
    headers['Blockscout-Api-Key'] = BLOCKSCOUT_API_KEY;
  }
  return fetch(url, { headers });
}

/**
 * Resolve an ENS name to an address using Blockscout API.
 * @param {string} name 
 * @returns {Promise<string|null>}
 */
export async function resolveEnsViaBlockscout(name) {
  try {
    // Blockscout API search endpoint often handles ENS
    const url = `${BLOCKSCOUT_BASE_URL}/search?q=${encodeURIComponent(name)}`;
    const res = await bsFetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    // Blockscout returns items. Find the one that matches the name and has an address.
    const match = data.items?.find(item => 
      item.name?.toLowerCase() === name.toLowerCase() && item.type === 'address'
    );

    return match?.address || null;
  } catch (err) {
    logger.error('Blockscout ENS resolution failed', { name, error: err.message });
    return null;
  }
}

/**
 * Get ENS metadata (expiry, etc) for a name.
 * Note: Blockscout API v2 varies by instance. This is a generic implementation.
 * @param {string} name 
 */
export async function getEnsMetadataViaBlockscout(name) {
  try {
    // Many Blockscout instances have specific ENS endpoints
    const url = `${BLOCKSCOUT_BASE_URL}/main-page/ens-domains?name=${encodeURIComponent(name)}`;
    const res = await bsFetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    // Return the first match
    return data.items?.[0] || null;
  } catch (err) {
    logger.error('Blockscout ENS metadata fetch failed', { name, error: err.message });
    return null;
  }
}

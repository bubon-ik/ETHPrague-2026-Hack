/**
 * Web3 Domain Research Agent Handler (ENS)
 * Specialized skill for checking .eth name availability using Blockscout.
 */

'use strict';

import { validateEnsName } from '../../security/validator.js';
import { resolveEnsViaBlockscout, getEnsMetadataViaBlockscout } from '../../utils/blockscout-api.js';
import { logger } from '../../utils/logger.js';

/**
 * Handle an ENS domain research query.
 * @param {string} message
 * @returns {Promise<{text: string}>}
 */
export async function handleEnsStatus(message) {
  const rawName = parseStatusIntent(message);

  if (!rawName) {
    return { text: '🔍 Web3 Domain Research: Please provide a .eth name to check (e.g., "is vitalik.eth available?").' };
  }

  // 1. Normalize the name
  const name = rawName.toLowerCase().trim().replace(/[^a-z0-9-.]/g, '');
  const validation = validateEnsName(name);
  
  if (!validation.valid) {
    return { text: `❌ Invalid Name: ${validation.reason}` };
  }

  try {
    // 2. Query Blockscout API
    const address = await resolveEnsViaBlockscout(validation.name);
    const metadata = await getEnsMetadataViaBlockscout(validation.name);
    
    // 3. Logic for Availability
    // AVAILABLE: No address and no metadata/expiry
    // TAKEN: Valid address or active expiration
    const isTaken = !!address || !!metadata;
    const status = isTaken ? 'Taken' : 'Available';
    
    const owner = address || 'None';
    let expiry = 'N/A';
    if (metadata?.expiration_date) {
      expiry = new Date(metadata.expiration_date).toLocaleDateString();
    }

    const blockscoutLink = `https://eth.blockscout.com/name/${validation.name}`;

    // 4. Format Response as requested
    let response = `📌 ENS Research Report
──────────────────────
- Status: ${status}
- Name: ${validation.name}
- Owner: ${owner}
- Expiry: ${expiry}
- Blockscout Link: ${blockscoutLink}
──────────────────────`;

    if (!isTaken) {
      response += `\n✅ This name is ready for registration! Would you like me to help you buy it?`;
    } else {
      response += `\nℹ️ This name is already registered. You can try searching for a different one.`;
    }

    return { text: response };
  } catch (err) {
    logger.error('ENS research failed', { name: validation.name, error: err.message });
    return { text: '⚠️ Research Error: I couldn\'t connect to the Blockscout ENS service right now.' };
  }
}

/**
 * Extract domain name from message.
 */
function parseStatusIntent(message) {
  const match = message.match(/([a-z0-9-.]+\.eth)/i);
  return match ? match[1] : null;
}

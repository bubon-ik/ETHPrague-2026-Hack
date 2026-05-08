/**
 * Contacts Handler
 * Lists discovered ENS names from transaction history.
 */

'use strict';

import { getDiscoveredEnsNames } from '../../utils/blockscout.js';

/**
 * Handle "Who are my contacts?" or "Who did I send to?"
 * @returns {Promise<{text: string}>}
 */
export async function handleQueryContacts() {
  const ensMap = await getDiscoveredEnsNames();

  if (ensMap.size === 0) {
    return { text: "I couldn't find any ENS names in your transaction history." };
  }

  let response = "📖 Discovered Contacts (via Blockscout history):\n";
  response += "────────────────────────────────────────\n";

  for (const [address, name] of ensMap.entries()) {
    response += `• ${name.padEnd(20)} (${address.slice(0, 6)}...${address.slice(-4)})\n`;
  }

  response += "────────────────────────────────────────\n";
  response += `Total: ${ensMap.size} unique domains found.`;

  return { text: response };
}

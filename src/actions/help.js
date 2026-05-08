/**
 * Help Handler
 */

'use strict';

export async function handleHelp() {
  return {
    text: `Here's what I can do:

💸 Transactions: "Send 0.1 ETH to vitalik.eth", "Swap 100 USDC to ETH", "Buy 0.5 ETH"
🔷 ENS: "I want the domain greenparrot.eth", "Renew vitalik.eth for 2 years"
⏱️  Automation: "If ETH < $1000, buy 5 ETH", "Every Monday, swap 50 USDC to ETH"
📊 Portfolio: "What's my balance?", "Show my portfolio", "What's ETH worth?"
📜 History: "Show my last 5 transactions"
📖 Contacts: "Show my contacts"

Ask me anything!`,
  };
}

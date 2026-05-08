/**
 * Transaction History Handler
 */

'use strict';

export async function handleQueryHistory(message) {
  const limitMatch = message.match(/last\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 5;

  const address = globalThis.wallet.getAddress();
  const txs = await globalThis.history.get(address, limit);

  if (!txs || txs.length === 0) {
    return { text: "I couldn't find any recent transactions for your address." };
  }

  let text = `📜 Recent Transactions (last ${txs.length})\n`;
  text += '────────────────────────────────────────\n';

  const icons = { send: '↗', receive: '↙', swap: '🔄', ens: '🔷' };

  txs.forEach((tx, i) => {
    const icon = icons[tx.type] || '•';
    const status = tx.status === 'confirmed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
    text += `${i + 1}. ${icon} ${tx.type.charAt(0).toUpperCase() + tx.type.slice(1).padEnd(8)} ${tx.amount} ${tx.asset} ${status}\n`;
    text += `   To: ${tx.counterparty}\n`;
    text += `   At: ${tx.date}\n\n`;
  });

  return { text };
}

import { getEthBalance } from '../../rpc/eth.js';
import { rpcCall } from '../../rpc/client.js';
import { priceCache } from '../../price/cache.js';
import { formatUsd, formatToken } from '../../utils/format.js';
import { KNOWN_TOKENS } from '../../utils/constants.js';

export async function handleQueryBalance() {
  const address = globalThis.wallet.getAddress();
  const ethWei = await getEthBalance(address);
  const ethPrice = await priceCache.get('ETH/USD');
  
  const ethAmount = Number(ethWei) / 1e18;
  let totalUsd = ethAmount * ethPrice;
  let text = 'Your portfolio:\n';
  text += `• ${ethAmount.toFixed(4).padEnd(20)} ETH ($${(ethAmount * ethPrice).toLocaleString()})\n`;

  for (const token of KNOWN_TOKENS) {
    try {
      const balHex = await rpcCall('eth_call', [{
        to: token.address,
        data: `0x70a08231000000000000000000000000${address.slice(2)}`,
      }, 'latest']);
      const bal = BigInt(balHex);
      if (bal > 0n) {
        const amount = Number(bal) / (10 ** token.decimals);
        const price = await priceCache.get(`${token.symbol}/USD`) || 0;
        const usd = amount * price;
        totalUsd += usd;
        text += `• ${amount.toFixed(4).padEnd(20)} ${token.symbol} ($${usd.toLocaleString()})\n`;
      }
    } catch (err) {
      // Skip failed tokens
    }
  }

  text += '────────────────────────────────────────\n';
  text += `  Total:                   $${totalUsd.toLocaleString()}\n\n`;
  text += 'Want me to do anything with this?';

  return { text };
}

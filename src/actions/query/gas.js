/**
 * Gas Price Query Handler
 */

'use strict';

import { getGasPrice } from '../../rpc/eth.js';
import { priceCache } from '../../price/cache.js';

export async function handleQueryGas() {
  const gasPriceWei = await getGasPrice();
  const ethPrice = await priceCache.get('ETH/USD');
  
  const gwei = Number(gasPriceWei) / 1e9;
  const transferCostEth = (Number(gasPriceWei) * 21000) / 1e18;
  const transferCostUsd = transferCostEth * ethPrice;

  return {
    text: `⛽ Current Gas Status:
• Gas Price: ${gwei.toFixed(2)} Gwei
• Simple Transfer: ~${transferCostEth.toFixed(5)} ETH ($${transferCostUsd.toFixed(2)})

Network activity is currently normal.`,
  };
}

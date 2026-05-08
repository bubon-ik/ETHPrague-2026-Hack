# 📡 Firmware API Reference

> **ETH Prague 2026** | Vault AI Agent — Firmware-Provided API Specification

These APIs are provided by the hardware wallet firmware as built-in globals. They are the **only** external interfaces available to agent code.

---

## `wallet`

### `wallet.address() → Promise<string>`
Returns the current account's Ethereum address.
```javascript
const addr = await wallet.address();
// "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

### `wallet.sign(tx) → Promise<string>`
Signs a transaction via the HSM. Prompts physical button confirmation on device display.

⚠️ **Always call `ui.confirm()` before this.**

```javascript
const txHash = await wallet.sign({
  to: '0xd8dA...',
  value: '0x16345785D8A0000',  // hex wei
  gas: '0x5208',               // 21000
  gasPrice: '0x5F5E100',       // 0.1 Gwei
  data: '0x',                  // optional calldata
});
```

---

## `rpc`

### `rpc.call(method, params) → Promise<any>`
Makes a JSON-RPC call to the configured Ethereum node.

```javascript
// Get ETH balance
const balance = await rpc.call('eth_getBalance', [address, 'latest']);

// Get current gas price
const gasPrice = await rpc.call('eth_gasPrice');

// Call a contract
const result = await rpc.call('eth_call', [{ to: contractAddress, data: calldata }, 'latest']);

// Estimate gas
const gas = await rpc.call('eth_estimateGas', [txObject]);
```

---

## `price`

### `price.get(symbol) → Promise<number>`
Fetches the current price from the bundled oracle. Returns USD value.

```javascript
const ethPrice = await price.get('ETH/USD');  // 3247.82
const btcPrice = await price.get('BTC/USD');  // 61423.50
```

**Supported symbols:** `ETH/USD`, `BTC/USD`, `USDC/USD`, `DAI/USD`, `WBTC/USD`, `ARB/USD`, `OP/USD`, `MATIC/USD`

---

## `ens`

### `ens.resolve(name) → Promise<string|null>`
Resolves an ENS name to an Ethereum address. Returns `null` if unregistered.

```javascript
const addr = await ens.resolve('vitalik.eth');
// "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

### `ens.available(name) → Promise<boolean>`
Checks if an ENS name is available for registration.

```javascript
const isAvailable = await ens.available('greenparrot.eth');  // true | false
```

### `ens.suggest(name) → Promise<string[]>`
Returns an array of available ENS names similar to the given name.

```javascript
const suggestions = await ens.suggest('greenparrot');
// ["greenparrot42.eth", "the-greenparrot.eth", ...]
```

---

## `history`

### `history.get(address, limit) → Promise<Transaction[]>`
Returns the last N transactions for a given address.

```javascript
const txs = await history.get(address, 10);
```

**Transaction object:**
```javascript
{
  type: 'send' | 'receive' | 'swap' | 'ens',
  status: 'confirmed' | 'pending' | 'failed',
  amount: number,
  asset: string,        // e.g. "ETH"
  counterparty: string, // address or ENS name
  date: string,         // ISO date string
  txHash: string,
}
```

---

## `scheduler`

### `scheduler.set(condition, action) → void`
Registers a conditional automation job with the firmware scheduler.

```javascript
scheduler.set(
  { type: 'price', asset: 'ETH', op: '<', value: 1000 },
  { type: 'tx.buy', asset: 'ETH', amount: 5 }
);
```

---

## `ui`

### `ui.render(component) → void`
Renders a UI component to the wallet display.

```javascript
ui.render({ type: 'welcome', address: '0x1234...5678' });
ui.render({ type: 'txPreview', content: previewString });
ui.render({ type: 'error', message: 'Something went wrong' });
```

### `ui.confirm(message) → Promise<boolean>`
Displays a confirmation dialog and waits for physical button press.

```javascript
const approved = await ui.confirm('Send 0.1 ETH to vitalik.eth?');
if (!approved) { return; }
```

### `ui.onInput(callback) → void`
Registers a listener for the next user text input event.

```javascript
ui.onInput((message) => {
  handleMessage(message);
});
```

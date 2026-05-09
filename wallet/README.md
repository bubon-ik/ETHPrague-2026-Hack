# Wallet UI

Local web UI that talks to the Trusted Applet over the Armory bridge.

## Run

1. Build and upload the applet:
   - make applet
   - bun run scripts/upload.ts target/armv7a-none-eabi/release/trusted_applet
2. Re-arm the USB link if the device rebooted:
   - ./scripts/armory-link.sh
3. Start the UI server:
   - bun install
   - bun run wallet/server.ts
4. Open http://127.0.0.1:3030

If you want verbose request logging in the terminal:

- WALLET_DEBUG=1 bun run wallet/server.ts

## CLI (transactions)

1. Make sure the applet is uploaded and the USB link is up.
2. Set an RPC endpoint (Sepolia recommended):
   - RPC_URL=https://your-rpc-endpoint
3. Run a transfer command:

```
bun run wallet/cli.ts transfer_to 0x1234567890abcdef1234567890abcdef12345678 0.01 ETH
```

Optional flags:
- --dry-run (build + sign only, no broadcast)
- --gas-limit 21000
- --gas-price-gwei 5
- --nonce 0
- --chain-id 11155111

Commands are listed in wallet/commands.md for the AI prompt.

## Applet methods

- Wallet.Init
- Wallet.Rotate
- Wallet.Key

## Notes

- The private key lives only in device memory. A reboot clears it.
- This demo returns the private key to the host so the server can derive
   an Ethereum address. The UI does not display the key.
- If the UI shows "empty output" errors, the wallet applet is not
   running on the device. Re-upload the applet and re-run armory-link.sh.

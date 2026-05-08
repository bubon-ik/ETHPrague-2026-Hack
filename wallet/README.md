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

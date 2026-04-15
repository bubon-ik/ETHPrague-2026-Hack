// One-shot CLI uploader — pushes a new Trusted Applet ELF to the device
// over the bridge. The Trusted OS persists it to SD and reboots; on the
// next boot the new applet is live.
//
// Usage:
//   node --experimental-strip-types examples/square/upload.ts \
//     target/armv7a-none-eabi/release/trusted_applet

import { readFileSync } from 'fs';
import { connect } from 'net';

const path = process.argv[2];
if (!path) {
  console.error('usage: upload.ts <path/to/trusted_applet.elf>');
  process.exit(2);
}

const DEVICE = {
  host: process.env.DEVICE_HOST ?? '10.0.0.1',
  port: Number(process.env.DEVICE_PORT ?? 4000),
};

const elf = readFileSync(path);
const s = connect(DEVICE, () => {
  s.write(
    JSON.stringify({
      Method: '__upload',
      Input: elf.toString('base64'),
    }) + '\n',
  );
});

s.on('data', (d) => {
  console.log(String(d).trim());
  s.end();
});
s.on('error', (e) => {
  console.error('upload failed:', e.message);
  process.exit(1);
});

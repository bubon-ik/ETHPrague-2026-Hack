// One-shot CLI uploader — pushes a new Trusted Applet ELF to the device
// over the bridge. The Trusted OS persists it to SD and reboots; on the
// next boot the new applet is live.
//
//   bun run upload target/armv7a-none-eabi/release/trusted_applet

const path = Bun.argv[2];
if (!path) {
  console.error('usage: upload.ts <path/to/trusted_applet.elf>');
  process.exit(2);
}

const DEVICE_HOST = Bun.env.DEVICE_HOST ?? '10.0.0.1';
const DEVICE_PORT = Number(Bun.env.DEVICE_PORT ?? 4000);

const elf = await Bun.file(path).bytes();
const payload =
  JSON.stringify({
    Method: '__upload',
    Input: Buffer.from(elf).toString('base64'),
  }) + '\n';

const proc = Bun.spawn(['nc', '-w', '10', DEVICE_HOST, String(DEVICE_PORT)], {
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'pipe',
});
proc.stdin.write(payload);
await proc.stdin.end();

const [stdout, stderr, exit] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (exit !== 0) {
  console.error('upload failed:', stderr.trim() || `nc exited ${exit}`);
  process.exit(1);
}

// Expected reply is "ok, rebooting". The device's reset can race past
// nc's read, so we sometimes see no reply at all even though the upload
// landed. Treat that as success — the next ping/probe will confirm.
console.log(stdout.trim() || 'ok, probably rebooting (no reply captured)');

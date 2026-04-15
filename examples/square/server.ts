// Host webserver example — exposes GET /square?x=N over HTTP and forwards
// it to the Trusted Applet via the Trusted OS bridge on the device.
//
// Run with Node's built-in TypeScript loader (Node 22+):
//   node --experimental-strip-types examples/square/server.ts
//
// Then:
//   curl 'http://localhost:3000/square?x=7'
//   # {"x":7,"result":49}
//
// Protocol note: the bridge decodes/encodes JSON with Go's default struct
// field casing, so the fields are Method/Input/Output/Error (capitalized).
// Don't lowercase them.

import { createServer } from 'http';
import { connect } from 'net';

// On real hardware the USB CDC-ECM interface appears at 10.0.0.1. In
// QEMU, run with DEVICE_HOST=127.0.0.1 — the Makefile's QEMU invocation
// hostfwds localhost:4000 onto the guest's gVisor bridge listener.
const DEVICE = {
  host: process.env.DEVICE_HOST ?? '10.0.0.1',
  port: Number(process.env.DEVICE_PORT ?? 4000),
};

function callApplet(method: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(DEVICE, () => {
      s.write(JSON.stringify({ Method: method, Input: input }) + '\n');
    });

    let buf = '';
    s.on('data', (d) => {
      buf += d;
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      s.end();
      try {
        const reply = JSON.parse(buf.slice(0, nl));
        if (reply.Error) reject(new Error(reply.Error));
        else resolve(reply.Output ?? '');
      } catch (e) {
        reject(e);
      }
    });
    s.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/square') {
    const x = url.searchParams.get('x') ?? '0';
    try {
      const out = await callApplet('Square', x);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ x: Number(x), result: Number(out) }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  if (url.pathname === '/reverse') {
    const s = url.searchParams.get('s') ?? '';
    try {
      const out = await callApplet('Reverse', s);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ s, reversed: out }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('listening on http://localhost:3000/square?x=7');
});

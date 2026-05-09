import net from "node:net";
import crypto from "node:crypto";

const HOST = process.env.DEVICE_HOST || "127.0.0.1";
const PORT = Number(process.env.DEVICE_PORT || 4000);

const HARDCODED_KEY_HEX = "37e1972733a203e0092fd308639c44c55fa9b25d360ec2c80d6b131f8fbf9861";

let key = Buffer.from(HARDCODED_KEY_HEX, "hex");
let keyReady = false;

function handleRequest(method) {
  switch (method) {
    case "__probe":
      return { Output: "" };
    case "Wallet.Init":
      if (keyReady) return { Output: "exists" };
      keyReady = true;
      return { Output: "ok" };
    case "Wallet.Rotate":
      key = crypto.randomBytes(32);
      keyReady = true;
      return { Output: "ok" };
    case "Wallet.Key":
      if (!keyReady) return { Output: "not_initialized" };
      return { Output: key.toString("hex") };
    default:
      return { Output: "" };
  }
}

const server = net.createServer((socket) => {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      idx = buffer.indexOf("\n");

      if (!line) continue;

      try {
        const payload = JSON.parse(line);
        const method = payload.Method || payload.method || "";
        const reply = handleRequest(method);
        socket.write(JSON.stringify(reply) + "\n");
      } catch {
        socket.write(JSON.stringify({ Error: "bad json" }) + "\n");
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`mock bridge listening on ${HOST}:${PORT}`);
});

import "dotenv/config";
import { graph } from "./src/graph.js";

const input = {
    messages: [{ role: "user", content: "Is gemini-test.ens free? If so, I want to buy it." }]
};

const result = await graph.invoke(input, { configurable: { thread_id: "user-1" } });
console.log("\n--- AGENT HISTORY ---");
result.messages.forEach(msg => {
    if (msg.content && typeof msg.content === 'string' && !msg.content.startsWith('Supervisor decision')) {
        console.log(`[${msg.role || 'assistant'}]: ${msg.content}`);
    }
});
console.log("----------------------------");
console.log("Agent is waiting for your approval for the transaction...");
import { graph } from "./src/graph.js";

const input = {
    messages: [{ role: "user", content: "Is gemini-test.ens free? If so, I want to buy it." }]
};

const result = await graph.invoke(input, { configurable: { thread_id: "user-1" } });
console.log("Agent is waiting for your approval in LangSmith...");
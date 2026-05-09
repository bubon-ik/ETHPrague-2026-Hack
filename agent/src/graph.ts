import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { checkENSTool, prepareBuyTool } from "./tools.js";

// Define the "Memory" of our Agent
const AgentState = Annotation.Root({
    messages: Annotation<any[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    txDetails: Annotation<any>(),
});

const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

// Supervisor Logic: Decides where to go
const supervisorNode = async (state: typeof AgentState.State) => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
};

// Node to actually execute the lookup
const ensSpecialistNode = async (state: typeof AgentState.State) => {
    const toolModel = model.bindTools([checkENSTool, prepareBuyTool]);
    const response = await toolModel.invoke(state.messages);
    return { messages: [response] };
};

// Build the Graph
export const graph = new StateGraph(AgentState)
    .addNode("supervisor", supervisorNode)
    .addNode("ens_specialist", ensSpecialistNode)
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "ens_specialist")
    // BREAKPOINT: The code will stop before 'execute_tx' for safety
    .addNode("execute_tx", async (state) => {
        console.log("Broadcasting to Blockchain...");
        return { messages: [{ role: "assistant", content: "Transaction Success!" }] };
    })
    .compile({
        // This is the magic line that creates the Human-in-the-loop pause
        interruptBefore: ["execute_tx"],
    });
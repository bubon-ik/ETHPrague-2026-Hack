import { StateGraph, Annotation, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ToolMessage } from "@langchain/core/messages";
import { checkENSTool, prepareBuyTool } from "./tools.js";
import { supervisorNode, controlFlow } from "./supervisor.js";

// Define the "Memory" of our Agent
const AgentState = Annotation.Root({
    messages: Annotation<any[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    txDetails: Annotation<any>(),
    next: Annotation<string>(),
});

const model = new ChatOpenAI({ 
    modelName: "openai/gpt-4o", 
    maxTokens: 500,
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
    }
});

const tools = [checkENSTool, prepareBuyTool];

// Custom Tool Execution Node
const toolNode = async (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const results = [];
    
    if (lastMessage?.tool_calls) {
        for (const toolCall of lastMessage.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
                const output = await tool.invoke(toolCall.args);
                results.push(new ToolMessage({
                    tool_call_id: toolCall.id,
                    content: typeof output === "string" ? output : JSON.stringify(output),
                }));
            }
        }
    }
    return { messages: results };
};

// Node to actually execute the lookup
const ensSpecialistNode = async (state: typeof AgentState.State) => {
    const toolModel = model.bindTools(tools);
    const response = await toolModel.invoke(state.messages);
    return { messages: [response] };
};

// Conditional logic to decide if we need to run tools or go back to supervisor
const shouldContinue = (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.tool_calls?.length > 0) {
        return "tools";
    }
    return "supervisor";
};

// Build the Graph
export const graph = new StateGraph(AgentState)
    .addNode("supervisor", supervisorNode)
    .addNode("ens_specialist", ensSpecialistNode)
    .addNode("tools", toolNode)
    .addNode("execute_tx", async (state) => {
        console.log("Broadcasting to Blockchain...");
        return { messages: [{ role: "assistant", content: "Transaction Success!" }] };
    })
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", controlFlow)
    .addConditionalEdges("ens_specialist", shouldContinue)
    .addEdge("tools", "ens_specialist")
    .compile({
        interruptBefore: ["execute_tx"],
    });
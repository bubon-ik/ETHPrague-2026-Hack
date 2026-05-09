import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * The Supervisor is the "Router". 
 * It decides if we need to call the ENS Agent or if we are finished.
 */
export const supervisorNode = async (state: any) => {
    const model = new ChatOpenAI({
        modelName: "openai/gpt-4o",
        temperature: 0,
        maxTokens: 500,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        },
    });

    // We define the possible routes the supervisor can take
    const routingSchema = z.object({
        next_step: z.enum(["ENS_SPECIALIST", "FINISH"]),
        reasoning: z.string().describe("Why did you choose this route?"),
    });

    // Bind the schema so the model outputs structured JSON
    const routerModel = model.withStructuredOutput(routingSchema);

    const systemPrompt = new SystemMessage(`
    You are the Web3 Registry Supervisor. 
    Your goal is to manage the user's request regarding ENS domains.
    
    - If the user wants to check availability or buy a domain AND you don't have the answer yet: Route to 'ENS_SPECIALIST'.
    - If you have already provided the answer (e.g., domain is taken or available) and no further action is needed: Route to 'FINISH'.
    - If the user is just saying thanks or goodbye: Route to 'FINISH'.
    
    Current conversation history is provided below.
  `);

    const result = await routerModel.invoke([
        systemPrompt,
        ...state.messages,
    ]);

    console.log(`Supervisor Decision: ${result.next_step} (${result.reasoning})`);

    // We return the decision to the LangGraph state
    return {
        next: result.next_step,
        messages: [new HumanMessage({ content: `Supervisor decision: ${result.next_step}` })]
    };
};

/**
 * Conditional logic function used by the Graph
 * to actually move the "token" to the next node.
 */
export const controlFlow = (state: any) => {
    if (state.next === "ENS_SPECIALIST") {
        return "ens_specialist";
    }
    return "__end__";
};
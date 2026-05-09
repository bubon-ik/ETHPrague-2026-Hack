import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * The Supervisor is the "Router". 
 * It decides if we need to call the ENS Agent or if we are finished.
 */
export const supervisorNode = async (state: any) => {
    const model = new ChatOpenAI({
        modelName: "gpt-4o",
        temperature: 0,
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
    
    - If the user wants to check availability or buy a domain: Route to 'ENS_SPECIALIST'.
    - If you have already provided the answer and the user is just saying thanks or goodbye: Route to 'FINISH'.
    
    Current conversation history is provided below.
  `);

    const result = await routerModel.invoke([
        systemPrompt,
        ...state.messages,
    ]);

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
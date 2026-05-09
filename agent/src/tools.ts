import { z } from "zod";
import { tool } from "@langchain/core/tools";

// 1. Tool to check availability
export const checkENSTool = tool(
    async ({ domain }) => {
        const response = await fetch(`https://eth.blockscout.com/api/v2/addresses/${domain}`);
        const data = await response.json();

        if (data.hash) {
            return `Domain ${domain} is TAKEN by ${data.hash}.`;
        }
        return `Domain ${domain} is AVAILABLE! Cost is approximately 0.005 ETH.`;
    },
    {
        name: "check_ens_availability",
        description: "Checks if an ENS domain is available to buy on Blockscout.",
        schema: z.object({
            domain: z.string().describe("The .ens domain name to check"),
        }),
    }
);

// 2. Tool to prepare transaction (Doesn't send yet!)
export const prepareBuyTool = tool(
    async ({ domain }) => {
        // In a real app, you'd calculate hex data for the ENS registrar contract here
        return {
            status: "pending_approval",
            domain: domain,
            to: "0x00000000000C2E0b496901f82155106085270123", // ENS Registrar
            value: "5000000000000000", // 0.005 ETH in Wei
            data: "0x..."
        };
    },
    {
        name: "prepare_ens_buy",
        description: "Prepares the transaction data to buy a domain. Requires user approval.",
        schema: z.object({
            domain: z.string().describe("The .ens domain to purchase"),
        }),
    }
);
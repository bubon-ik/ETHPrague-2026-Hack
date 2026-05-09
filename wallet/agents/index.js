import dotenv from 'dotenv';
import readline from 'readline';
import { SupervisorAgent } from './src/supervisor.js';

dotenv.config();

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    console.error("❌ Please set your OPENAI_API_KEY in the .env file.");
    process.exit(1);
  }

  const supervisor = new SupervisorAgent(apiKey);
  console.log("======================================================");
  console.log("🤖 Multi-Agent System Simulation Started");
  console.log("======================================================");
  console.log("Type your request below to test the agent in real time.");
  console.log("Examples:");
  console.log(" - Is vitalik.eth available?");
  console.log(" - Who is behind brantly.eth and how do I talk to it?");
  console.log(" - Type 'exit' to quit.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('Goodbye!');
        rl.close();
        process.exit(0);
      }

      if (input.trim() === '') {
        askQuestion();
        return;
      }

      await supervisor.handleRequest(input);
      
      // Prompt again after the response
      console.log("\n------------------------------------------------------");
      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);

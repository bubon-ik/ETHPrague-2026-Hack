import { llmChat } from '../src/llm/client.js';

async function ping() {
  try {
    console.log('Pinging OpenRouter...');
    const result = await llmChat([{ role: 'user', content: 'Say "pong" if you can hear me.' }]);
    console.log('Response:', result.text);
    console.log('Tokens used:', result.usage?.total_tokens);
  } catch (err) {
    console.error('Ping failed:', err.message);
  }
}

ping();

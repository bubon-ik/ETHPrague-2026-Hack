/**
 * Vault AI Agent — Entry Point
 * Boots the conversation loop and initializes all subsystems.
 *
 * Runtime: QuickJS/Duktape (ES2022, no Node.js built-ins)
 */

'use strict';

import { router } from './router.js';
import { ContextManager } from './context.js';
import { buildSystemPrompt } from './prompts/system.js';
import { logger } from '../utils/logger.js';
import { formatAddress } from '../utils/format.js';
import { runInitChecklist } from './init.js';

const context = new ContextManager();

/**
 * Main agent boot sequence.
 */
async function boot() {
  logger.info('Vault AI Agent booting...');

  // Inject system prompt as the first context message
  const systemPrompt = buildSystemPrompt();
  context.setSystem(systemPrompt);

  // Run silent background initialization checklist
  await runInitChecklist(context);

  // Display welcome message
  const address = await wallet.address();
  ui.render({
    type: 'welcome',
    address: formatAddress(address),
  });

  logger.info('Agent ready. Entering conversation loop.');
  conversationLoop();
}

/**
 * Main conversation loop — listens for user input and dispatches to router.
 */
async function conversationLoop() {
  // In a real hardware wallet, this is event-driven from the input device.
  // In mock/dev mode, this is driven by a simulated input queue.
  while (true) {
    const userMessage = await waitForUserInput();
    if (!userMessage || !userMessage.trim()) { continue; }

    context.addUser(userMessage);

    try {
      const response = await router.dispatch(userMessage, context);
      context.addAssistant(response.text);
      ui.render({ type: 'chat', message: response });
    } catch (err) {
      logger.error('Dispatch error', { error: err.message });
      const errorMsg = 'Sorry, something went wrong. Please try again.';
      context.addAssistant(errorMsg);
      ui.render({ type: 'error', message: errorMsg });
    }
  }
}

/**
 * Waits for the next user input event from the hardware UI.
 * In mock mode this resolves from a simulated event queue.
 * @returns {Promise<string>}
 */
async function waitForUserInput() {
  // Firmware event bridge — implemented by hardware UI layer
  return new Promise((resolve) => {
    ui.onInput(resolve);
  });
}

boot().catch((err) => {
  logger.error('Fatal boot error', { error: err.message });
  ui.render({ type: 'fatal', message: 'Agent failed to start. Restart your device.' });
});

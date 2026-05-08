/**
 * Intent Router — maps user messages to action handlers.
 *
 * Intent classification is performed via keyword matching + pattern rules.
 * For production, this would be replaced with on-device LLM inference.
 */

'use strict';

import { handleSend } from '../actions/send.js';
import { handleSwap } from '../actions/swap.js';
import { handleBuy } from '../actions/buy.js';
import { handlePortfolio } from '../actions/portfolio.js';
import { handleEnsSearch } from '../actions/ens/search.js';
import { handleEnsRenew } from '../actions/ens/renew.js';
import { handleEnsTransfer } from '../actions/ens/transfer.js';
import { handleAutomationCreate } from '../automation/parser.js';
import { handleAutomationList, handleAutomationCancel } from '../automation/store.js';
import { handlePriceQuery } from '../price/oracle.js';
import { handleBalanceQuery } from '../rpc/eth.js';
import { handleHistoryQuery } from '../rpc/client.js';
import { logger } from '../utils/logger.js';
import { INTENTS } from '../utils/constants.js';

/** Intent classification rules ordered by specificity (most specific first). */
const INTENT_RULES = [
  // Transaction intents
  { intent: INTENTS.TX_SEND,         pattern: /\b(send|transfer|pay|move\s+to)\b/i },
  { intent: INTENTS.TX_SWAP,         pattern: /\b(swap|exchange|convert|trade)\b/i },
  { intent: INTENTS.TX_BUY,          pattern: /\b(buy|purchase|get\s+some|acquire)\b/i },

  // ENS intents
  { intent: INTENTS.ENS_RENEW,       pattern: /\b(renew|extend|renewal)\b.*\.(eth|crypto)/i },
  { intent: INTENTS.ENS_TRANSFER,    pattern: /\b(transfer|give)\b.*\.(eth|crypto)/i },
  { intent: INTENTS.ENS_SEARCH,      pattern: /\b(ens|domain|\.eth|want\s+the\s+name|register)\b/i },

  // Automation intents
  { intent: INTENTS.AUTO_CANCEL,     pattern: /\b(cancel\s+rule|remove\s+automation|stop\s+watching)\b/i },
  { intent: INTENTS.AUTO_LIST,       pattern: /\b(my\s+rules|active\s+automations|what.s\s+scheduled)\b/i },
  { intent: INTENTS.AUTO_CREATE,     pattern: /\b(if|when|every|automatically|whenever)\b.*(then|do|buy|sell|swap|send)/i },

  // Query intents
  { intent: INTENTS.QUERY_HISTORY,   pattern: /\b(history|transactions|last\s+\d+\s+tx|recent\s+activity|what\s+did\s+i\s+send)\b/i },
  { intent: INTENTS.QUERY_BALANCE,   pattern: /\b(balance|holdings|portfolio|how\s+much\s+do\s+i\s+have|what\s+do\s+i\s+own)\b/i },
  { intent: INTENTS.QUERY_PRICE,     pattern: /\b(price|rate|worth|cost|value|how\s+much\s+is|trading\s+at)\b/i },

  // Help
  { intent: INTENTS.HELP,            pattern: /\b(help|what\s+can\s+you\s+do|commands|guide)\b/i },
];

/** Handler map: intent → async handler function */
const HANDLERS = {
  [INTENTS.TX_SEND]:       handleSend,
  [INTENTS.TX_SWAP]:       handleSwap,
  [INTENTS.TX_BUY]:        handleBuy,
  [INTENTS.ENS_SEARCH]:    handleEnsSearch,
  [INTENTS.ENS_RENEW]:     handleEnsRenew,
  [INTENTS.ENS_TRANSFER]:  handleEnsTransfer,
  [INTENTS.AUTO_CREATE]:   handleAutomationCreate,
  [INTENTS.AUTO_LIST]:     handleAutomationList,
  [INTENTS.AUTO_CANCEL]:   handleAutomationCancel,
  [INTENTS.QUERY_PRICE]:   handlePriceQuery,
  [INTENTS.QUERY_BALANCE]: handleBalanceQuery,
  [INTENTS.QUERY_HISTORY]: handleHistoryQuery,
  [INTENTS.HELP]:          handleHelp,
};

export const router = {
  /**
   * Classify user message and dispatch to the appropriate handler.
   * @param {string} message - Raw user input
   * @param {ContextManager} context - Current conversation context
   * @returns {Promise<{text: string}>}
   */
  async dispatch(message, context) {
    const intent = this.classify(message);
    logger.info('Intent classified', { intent, message: message.slice(0, 40) });

    const handler = HANDLERS[intent];
    if (!handler) {
      return { text: 'I didn\'t quite understand that. Type "help" to see what I can do.' };
    }

    return handler(message, context);
  },

  /**
   * Classify a message into an intent string.
   * @param {string} message
   * @returns {string} intent constant
   */
  classify(message) {
    for (const rule of INTENT_RULES) {
      if (rule.pattern.test(message)) {
        return rule.intent;
      }
    }
    return INTENTS.UNKNOWN;
  },
};

/**
 * Built-in help handler.
 * @returns {Promise<{text: string}>}
 */
async function handleHelp() {
  return {
    text: `Here's what I can do:

💸 Transactions: "Send 0.1 ETH to vitalik.eth", "Swap 100 USDC to ETH", "Buy 0.5 ETH"
🔷 ENS: "I want the domain greenparrot.eth", "Renew vitalik.eth for 2 years"
⏱️  Automation: "If ETH < $1000, buy 5 ETH", "Every Monday, swap 50 USDC to ETH"
📊 Portfolio: "What's my balance?", "Show my portfolio", "What's ETH worth?"
📜 History: "Show my last 5 transactions"

Ask me anything!`,
  };
}

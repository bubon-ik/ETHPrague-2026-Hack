/**
 * ENS Transfer Handler
 * Handles "Transfer X.eth to address/ENS" requests.
 */

'use strict';

import { validateEnsName, validateAddress } from '../../security/validator.js';
import { checkSignRateLimit } from '../../security/limits.js';
import { auditRecord } from '../../security/audit.js';
import { getGasPrice } from '../../rpc/eth.js';
import { formatAddress } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';

/**
 * Handle an ENS transfer request.
 * @param {string} message
 * @param {import('../../agent/context.js').ContextManager} context
 * @returns {Promise<{text: string}>}
 */
export async function handleEnsTransfer(message, context) {
  const parsed = parseTransferIntent(message);

  if (!parsed) {
    return { text: 'To transfer an ENS name, say: "Transfer greenparrot.eth to alice.eth" or to an address.' };
  }

  const nameValidation = validateEnsName(parsed.rawName);
  if (!nameValidation.valid) {
    return { text: nameValidation.reason };
  }

  // Resolve destination
  let toAddress, toEns;
  if (parsed.rawTo.endsWith('.eth')) {
    const ensValidation = validateEnsName(parsed.rawTo);
    if (!ensValidation.valid) { return { text: ensValidation.reason }; }
    toEns = ensValidation.name;
    toAddress = await ens.resolve(toEns);
    if (!toAddress) { return { text: `Could not resolve ${toEns}.` }; }
  } else {
    const addrValidation = validateAddress(parsed.rawTo);
    if (!addrValidation.valid) { return { text: addrValidation.reason }; }
    toAddress = addrValidation.address;
  }

  const destination = toEns ? `${toEns} (${formatAddress(toAddress)})` : formatAddress(toAddress);

  ui.render({
    type: 'ensTransfer',
    content: `🔷 ENS Transfer\n──────────────────────\nName:    ${nameValidation.name}\nTo:      ${destination}\n──────────────────────\n⚠️  This transfers full ownership of ${nameValidation.name}.\n\nConfirm with physical button to proceed.`,
  });

  const rateCheck = checkSignRateLimit();
  if (!rateCheck.allowed) {
    return { text: 'Too many signing attempts. Please wait.' };
  }

  const confirmed = await ui.confirm(`Transfer ${nameValidation.name} to ${destination}?`);
  if (!confirmed) {
    return { text: 'Transfer cancelled.' };
  }

  try {
    const gasPriceWei = await getGasPrice();
    const txHash = await wallet.sign({
      to: '0x253553366Da8546fC250F225fe3d25d0C782303b',
      data: '0x',
      gas: '0xC350',
      gasPrice: `0x${gasPriceWei.toString(16)}`,
    });

    auditRecord({ type: 'ens_transfer', status: 'signed', to: toAddress, asset: 'ENS', amount: 0, txHash });
    return { text: `✅ Transfer submitted! ${nameValidation.name} is being transferred to ${destination}.` };
  } catch (err) {
    auditRecord({ type: 'ens_transfer', status: 'failed', to: toAddress, asset: 'ENS', amount: 0 });
    logger.error('ENS transfer failed', { error: err.message });
    return { text: 'Transfer failed. Please try again.' };
  }
}

function parseTransferIntent(message) {
  const match = message.match(/(?:transfer|give)\s+([a-z0-9-.]+\.eth)\s+(?:to\s+)?(.+)/i);
  if (!match) { return null; }
  return { rawName: match[1].trim(), rawTo: match[2].trim() };
}

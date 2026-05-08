/**
 * ENS Expiry Condition Evaluator
 * Checks if an ENS name expires within a given number of days.
 */

'use strict';

/**
 * Evaluate an ENS expiry condition.
 * @param {{ name: string, days: number }} condition
 * @returns {Promise<boolean>}
 */
export async function evaluateExpiryCondition(condition) {
  let name = condition.name;

  // If "primary", resolve user's primary ENS name
  if (name === 'primary') {
    const address = await wallet.address();
    name = await ens.resolve(address).catch(() => null);
    if (!name) { return false; }
  }

  // In a production implementation, query the ENS registry for the expiry date
  // This is a placeholder — actual expiry would come from rpc.call to ENS registrar
  try {
    const expiryTimestamp = await getEnsExpiry(name);
    if (!expiryTimestamp) { return false; }

    const daysUntilExpiry = (expiryTimestamp - Date.now()) / 86_400_000;
    return daysUntilExpiry < condition.days;
  } catch {
    return false;
  }
}

/**
 * Get the expiry timestamp for an ENS name.
 * @param {string} name
 * @returns {Promise<number|null>} Unix timestamp in ms, or null
 */
async function getEnsExpiry(name) {
  // In production: call ENS BaseRegistrar contract's `nameExpires(tokenId)` method
  // For now, return a stub value
  return null;
}

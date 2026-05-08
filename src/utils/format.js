/**
 * Utility Formatters
 * Number, address, date, and currency formatters.
 * No sensitive data is ever returned unmasked.
 */

'use strict';

/**
 * Format an Ethereum address for display: 0x1234...5678
 * @param {string} address
 * @returns {string}
 */
export function formatAddress(address) {
  if (!address || address.length < 10) { return address || ''; }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a wei value to ETH string (4 decimal places).
 * @param {string|bigint|number} wei
 * @returns {string}
 */
export function formatEth(wei) {
  const value = typeof wei === 'bigint' ? wei : BigInt(String(wei));
  const eth = Number(value) / 1e18;
  return eth.toFixed(4);
}

/**
 * Format a USD value with commas and 2 decimal places.
 * @param {number} usd
 * @returns {string}
 */
export function formatUsd(usd) {
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a price with appropriate precision.
 * @param {number} price
 * @returns {string}
 */
export function formatPrice(price) {
  if (price >= 1000) { return formatUsd(price); }
  if (price >= 1) { return `$${price.toFixed(4)}`; }
  return `$${price.toFixed(8)}`;
}

/**
 * Format a token amount with its symbol.
 * @param {number|string} amount
 * @param {string} symbol
 * @param {number} decimals
 * @returns {string}
 */
export function formatToken(amount, symbol, decimals = 18) {
  const value = typeof amount === 'bigint'
    ? Number(amount) / Math.pow(10, decimals)
    : Number(amount);

  const formatted = value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : value.toFixed(4);

  return `${formatted} ${symbol}`;
}

/**
 * Format a timestamp as a relative time string (e.g. "2 days ago").
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) { return 'just now'; }
  if (diff < 3600) { return `${Math.floor(diff / 60)} minutes ago`; }
  if (diff < 86400) { return `${Math.floor(diff / 3600)} hours ago`; }
  if (diff < 604800) { return `${Math.floor(diff / 86400)} days ago`; }
  return `${Math.floor(diff / 604800)} weeks ago`;
}

/**
 * Format a date as YYYY-MM-DD.
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

/**
 * Format a percentage change with sign and color indicator.
 * @param {number} change - Decimal percentage (e.g. 0.042 for +4.2%)
 * @returns {string}
 */
export function formatPctChange(change) {
  const pct = (change * 100).toFixed(2);
  return change >= 0 ? `+${pct}%` : `${pct}%`;
}

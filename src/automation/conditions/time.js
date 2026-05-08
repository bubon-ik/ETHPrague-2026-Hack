/**
 * Time Condition Evaluator
 * Evaluates time-based/cron-style automation triggers.
 */

'use strict';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Evaluate a time-based condition.
 * @param {{ schedule: string, lastExecuted?: number }} condition
 * @returns {Promise<boolean>}
 */
export async function evaluateTimeCondition(condition) {
  const schedule = condition.schedule.toLowerCase();
  const now = new Date();

  // "Every Monday"
  const dayMatch = schedule.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dayMatch) {
    const targetDay = DAY_NAMES.indexOf(dayMatch[1]);
    if (now.getDay() !== targetDay) { return false; }
    return !executedToday(condition.lastExecuted);
  }

  // "Every day"
  if (/every\s+day/.test(schedule)) {
    return !executedToday(condition.lastExecuted);
  }

  // "Every N hours"
  const hoursMatch = schedule.match(/every\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const intervalMs = parseInt(hoursMatch[1], 10) * 3_600_000;
    return !condition.lastExecuted || (Date.now() - condition.lastExecuted) >= intervalMs;
  }

  return false;
}

function executedToday(lastExecuted) {
  if (!lastExecuted) { return false; }
  const last = new Date(lastExecuted);
  const now = new Date();
  return last.toDateString() === now.toDateString();
}

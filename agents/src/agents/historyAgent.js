import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncEncryptedSessionHistoryToSwarm } from './sessionHistorySwarm.js';

const HISTORY_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * History Agent
 * Responsibility: Immutable session logging and archival.
 */

export async function archiveSession(logData) {
  console.log(`\n[History Agent]: Archiving session...`);

  const logsDir = path.join(HISTORY_DIR, '..', '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  const logFilePath = path.join(logsDir, 'session_history.json');
  
  let currentLogs = [];
  if (fs.existsSync(logFilePath)) {
    const data = fs.readFileSync(logFilePath, 'utf8');
    try {
      currentLogs = JSON.parse(data);
    } catch (e) {
      currentLogs = [];
    }
  }

  currentLogs.push(logData);
  fs.writeFileSync(logFilePath, JSON.stringify(currentLogs, null, 2));

  try {
    const swarm = await syncEncryptedSessionHistoryToSwarm(currentLogs);
    if (swarm.skipped) {
      console.log(`[History Agent]: Swarm sync skipped — ${swarm.reason}`);
    } else {
      console.log(`[History Agent]: Encrypted session history synced to Swarm`);
    }
  } catch (e) {
    console.warn(
      `[History Agent]: Swarm sync failed (local archive is saved): ${e?.message ?? e}`,
    );
  }

  console.log(`[History Agent]: Session archived successfully at ${logFilePath}`);
  return { status: 'ARCHIVED' };
}

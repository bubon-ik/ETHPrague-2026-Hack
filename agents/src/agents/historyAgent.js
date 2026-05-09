import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HISTORY_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * History Agent
 * Responsibility: Immutable session logging and archival.
 */

export async function archiveSession(logData) {
  console.log(`\n[History Agent]: Archiving session...`);
  
  // In a real implementation for a decentralised stack:
  // You might post this data to Swarm using a postage batch ID
  // e.g. using @erebos/swarm or simple axios POST to SWARM_NODE_URL
  
  // Simulated logic: saving to a local JSON file
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

  console.log(`[History Agent]: Session archived successfully at ${logFilePath}`);
  return { status: 'ARCHIVED' };
}

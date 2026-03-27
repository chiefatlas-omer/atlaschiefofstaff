import Database, { Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import * as schema from './schema';

// Try the configured DB path first, fall back to user's home directory
const userHome = process.env.USERPROFILE || process.env.HOME || '';
const fallbackDbPath = path.resolve(userHome, '.atlas-chief', 'chiefofstaff.db');
const configuredPath = path.resolve(config.db.path);

// Use configured path if it exists, otherwise fall back to user home
const dbPath = fs.existsSync(configuredPath) ? configuredPath : fallbackDbPath;
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create an empty DB if none exists (standalone desktop mode)
if (!fs.existsSync(dbPath)) {
  console.log('No existing database found. Creating new database at:', dbPath);
  // Touch the file — better-sqlite3 will create it
}

const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

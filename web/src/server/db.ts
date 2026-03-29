import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';

// NOTE: DATABASE_PATH env var should be set to an absolute path in production.
// The fallback resolves relative to this compiled file's directory (__dirname = web/src/server).
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
const sqlite = new Database(dbPath, { readonly: false });
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

// Ensure team_members table exists (bot creates it on startup, but web may run independently)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    team TEXT NOT NULL,
    display_name TEXT,
    coaching_role TEXT,
    created_at INTEGER NOT NULL
  );
`);
try { sqlite.exec('ALTER TABLE team_members ADD COLUMN coaching_role TEXT'); } catch (_e) { /* already exists */ }

import * as schema from '../../../bot/src/db/schema';
import * as analyticsSchema from './schema-analytics';
import * as emailDraftSchema from './schema-email-drafts';
export const db = drizzle(sqlite, { schema: { ...schema, ...analyticsSchema, ...emailDraftSchema } });
// Re-export analytics tables for use by routes without bot imports
export { callAnalyses, productSignals, coachingSnapshots } from './schema-analytics';
export { emailDrafts } from './schema-email-drafts';

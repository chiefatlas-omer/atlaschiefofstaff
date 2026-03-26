import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.env.DATABASE_PATH || '../bot/data/chiefofstaff.db');
const sqlite = new Database(dbPath, { readonly: false });
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

import * as schema from '../../../bot/src/db/schema';
import * as analyticsSchema from './schema-analytics';
import * as emailDraftSchema from './schema-email-drafts';
export const db = drizzle(sqlite, { schema: { ...schema, ...analyticsSchema, ...emailDraftSchema } });
// Re-export analytics tables for use by routes without bot imports
export { callAnalyses, productSignals, coachingSnapshots } from './schema-analytics';
export { emailDrafts } from './schema-email-drafts';

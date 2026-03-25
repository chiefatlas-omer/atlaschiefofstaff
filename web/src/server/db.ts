import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.env.DATABASE_PATH || '../bot/data/chiefofstaff.db');
const sqlite = new Database(dbPath, { readonly: false });
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

import * as schema from '../../../bot/src/db/schema';
export const db = drizzle(sqlite, { schema });

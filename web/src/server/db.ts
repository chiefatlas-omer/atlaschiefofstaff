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

// Ensure ALL tables exist with correct schema (production fresh DB)
// Drop tasks if it's missing columns (from earlier incomplete schema)
try {
  sqlite.prepare("SELECT raw_message_text FROM tasks LIMIT 1").get();
} catch (_e) {
  try { sqlite.exec('DROP TABLE IF EXISTS tasks'); } catch (_e2) { /* ignore */ }
}
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, slack_user_id TEXT NOT NULL, slack_user_name TEXT, description TEXT NOT NULL, raw_message_text TEXT, source_channel_id TEXT, source_message_ts TEXT, source_thread_ts TEXT, bot_reply_ts TEXT, status TEXT NOT NULL DEFAULT 'DETECTED', confidence TEXT, team TEXT, deadline_text TEXT, deadline INTEGER, completed_at INTEGER, last_reminder_at INTEGER, escalated_at INTEGER, source TEXT NOT NULL DEFAULT 'slack', zoom_meeting_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS team_members (id INTEGER PRIMARY KEY AUTOINCREMENT, slack_user_id TEXT NOT NULL, team TEXT NOT NULL, display_name TEXT, coaching_role TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS escalation_targets (id INTEGER PRIMARY KEY AUTOINCREMENT, slack_user_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT, content TEXT, version INTEGER NOT NULL DEFAULT 1, auto_generated INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS knowledge_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_id TEXT NOT NULL, content TEXT NOT NULL, embedding BLOB, embedding_model TEXT, metadata TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, company_id TEXT, role TEXT, slack_user_id TEXT, source TEXT NOT NULL DEFAULT 'manual', metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, status TEXT NOT NULL DEFAULT 'prospect', revenue INTEGER, employee_count INTEGER, website TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS deals (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'lead', value INTEGER, close_date INTEGER, owner_id TEXT, owner_slack_id TEXT, source TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, date INTEGER, duration INTEGER, source TEXT NOT NULL DEFAULT 'zoom', zoom_meeting_id TEXT, calendar_event_id TEXT, transcript_text TEXT, summary TEXT, meeting_type TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, what TEXT NOT NULL, context TEXT, decided_by TEXT, meeting_id TEXT, source_type TEXT NOT NULL DEFAULT 'meeting', source_ref TEXT, metadata TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS call_analyses (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id TEXT, zoom_meeting_id TEXT, title TEXT, date INTEGER, duration INTEGER, rep_slack_id TEXT, rep_name TEXT, business_name TEXT, business_type TEXT, business_stage TEXT, estimated_revenue TEXT, employee_count TEXT, objections TEXT, pains TEXT, desires TEXT, awareness_level TEXT, talk_listen_ratio INTEGER, question_count INTEGER, open_question_count INTEGER, next_steps TEXT, outcome TEXT, risk_flags TEXT, summary TEXT, raw_analysis TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS product_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, description TEXT NOT NULL, category TEXT, severity TEXT, verbatim_quote TEXT, business_name TEXT, business_revenue TEXT, call_analysis_id INTEGER, meeting_id TEXT, reported_by TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS coaching_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, rep_slack_id TEXT NOT NULL, rep_name TEXT, week_start INTEGER, call_count INTEGER, avg_talk_ratio INTEGER, avg_question_count INTEGER, avg_open_question_ratio INTEGER, top_objections TEXT, outcome_breakdown TEXT, coaching_flags TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS email_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_name TEXT, recipient_company TEXT, recipient_email TEXT, archetype TEXT, email_body TEXT, meeting_title TEXT, call_analysis_id INTEGER, rep_slack_id TEXT, rep_name TEXT, status TEXT DEFAULT 'draft', created_at INTEGER);
  CREATE TABLE IF NOT EXISTS topic_counts (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, normalized_topic TEXT NOT NULL, occurrences INTEGER NOT NULL DEFAULT 1, source_types TEXT, source_ids TEXT, last_seen_at INTEGER, sop_generated INTEGER DEFAULT 0, sop_id TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS qa_interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, was_correct INTEGER, correction TEXT, confidence TEXT, source_entry_ids TEXT, asked_by TEXT, asked_via TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, relationship_type TEXT NOT NULL, metadata TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS zoom_user_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, zoom_display_name TEXT NOT NULL UNIQUE, slack_user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, sent_at INTEGER NOT NULL, recipient_slack_id TEXT NOT NULL, task_count INTEGER NOT NULL, overdue_count INTEGER NOT NULL, completed_count INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS processed_messages (message_ts TEXT PRIMARY KEY, channel_id TEXT NOT NULL, processed_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL, department_label TEXT, status TEXT NOT NULL DEFAULT 'idle', trust_level TEXT NOT NULL DEFAULT 'supervised', reports_to TEXT, icon TEXT, skills TEXT, training_materials TEXT, standing_instructions TEXT, hours_used INTEGER DEFAULT 0, hours_allocated INTEGER DEFAULT 0, approvals_count INTEGER DEFAULT 0, deliverables_count INTEGER DEFAULT 0, hire_date TEXT, is_chief_of_staff INTEGER DEFAULT 0, owner_slack_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_activity (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, employee_name TEXT, employee_icon TEXT, action TEXT NOT NULL, detail TEXT, timestamp TEXT, needs_approval INTEGER DEFAULT 0, approved INTEGER, deliverable_preview TEXT, owner_slack_id TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_routines (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, days TEXT, time TEXT, enabled INTEGER DEFAULT 1, owner_slack_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`);
try { sqlite.exec('ALTER TABLE team_members ADD COLUMN coaching_role TEXT'); } catch (_e) { /* already exists */ }

import * as schema from '../../../bot/src/db/schema';
import * as analyticsSchema from './schema-analytics';
import * as emailDraftSchema from './schema-email-drafts';
import * as teamSchema from './schema-team';
export const db = drizzle(sqlite, { schema: { ...schema, ...analyticsSchema, ...emailDraftSchema, ...teamSchema } });
// Re-export analytics tables for use by routes without bot imports
export { callAnalyses, productSignals, coachingSnapshots } from './schema-analytics';
export { emailDrafts } from './schema-email-drafts';
export { aiEmployees, aiActivity, aiRoutines } from './schema-team';

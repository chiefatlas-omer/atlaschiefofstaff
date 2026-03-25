import { sqlite } from './connection';

// Create tables directly using SQL (simpler than drizzle-kit for initial setup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    slack_user_id TEXT NOT NULL,
    slack_user_name TEXT,
    description TEXT NOT NULL,
    raw_message_text TEXT,
    source_channel_id TEXT,
    source_message_ts TEXT,
    source_thread_ts TEXT,
    bot_reply_ts TEXT,
    status TEXT NOT NULL DEFAULT 'DETECTED',
    confidence TEXT,
    team TEXT,
    deadline_text TEXT,
    deadline INTEGER,
    completed_at INTEGER,
    last_reminder_at INTEGER,
    escalated_at INTEGER,
    source TEXT NOT NULL DEFAULT 'slack',
    zoom_meeting_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(slack_user_id, status);

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    team TEXT NOT NULL,
    display_name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS escalation_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zoom_user_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zoom_display_name TEXT NOT NULL UNIQUE,
    slack_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS digest_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sent_at INTEGER NOT NULL,
    recipient_slack_id TEXT NOT NULL,
    task_count INTEGER NOT NULL,
    overdue_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_messages (
    message_ts TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    processed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_processed_channel_ts ON processed_messages(channel_id, message_ts);
`);

// Migration: make source_channel_id and source_message_ts nullable for desktop app
try {
  const tableInfo = sqlite.pragma('table_info(tasks)') as Array<{ name: string; notnull: number }>;
  const channelCol = tableInfo.find((c: { name: string }) => c.name === 'source_channel_id');
  if (channelCol && channelCol.notnull === 1) {
    console.log('Migrating tasks table: making source_channel_id and source_message_ts nullable...');
    sqlite.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        slack_user_id TEXT NOT NULL,
        slack_user_name TEXT,
        description TEXT NOT NULL,
        raw_message_text TEXT,
        source_channel_id TEXT,
        source_message_ts TEXT,
        source_thread_ts TEXT,
        bot_reply_ts TEXT,
        status TEXT NOT NULL DEFAULT 'DETECTED',
        confidence TEXT,
        team TEXT,
        deadline_text TEXT,
        deadline INTEGER,
        completed_at INTEGER,
        last_reminder_at INTEGER,
        escalated_at INTEGER,
        source TEXT NOT NULL DEFAULT 'slack',
        zoom_meeting_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO tasks_new SELECT * FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(slack_user_id, status);
    `);
    console.log('Migration complete.');
  }
} catch (e) {
  console.log('Migration check skipped (table may not exist yet).');
}

// ─── Sales Intelligence Tables ────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS call_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT,
    zoom_meeting_id TEXT,
    title TEXT,
    date INTEGER,
    duration INTEGER,
    rep_slack_id TEXT,
    rep_name TEXT,
    business_name TEXT,
    business_type TEXT,
    business_stage TEXT,
    estimated_revenue TEXT,
    employee_count TEXT,
    objections TEXT,
    pains TEXT,
    desires TEXT,
    awareness_level TEXT,
    talk_listen_ratio INTEGER,
    question_count INTEGER,
    open_question_count INTEGER,
    next_steps TEXT,
    outcome TEXT,
    risk_flags TEXT,
    summary TEXT,
    raw_analysis TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_call_analyses_rep_slack_id ON call_analyses(rep_slack_id);
  CREATE INDEX IF NOT EXISTS idx_call_analyses_date ON call_analyses(date);
  CREATE INDEX IF NOT EXISTS idx_call_analyses_outcome ON call_analyses(outcome);

  CREATE TABLE IF NOT EXISTS product_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    severity TEXT,
    verbatim_quote TEXT,
    business_name TEXT,
    business_revenue TEXT,
    call_analysis_id INTEGER,
    meeting_id TEXT,
    reported_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_product_signals_type ON product_signals(type);
  CREATE INDEX IF NOT EXISTS idx_product_signals_category ON product_signals(category);
  CREATE INDEX IF NOT EXISTS idx_product_signals_severity ON product_signals(severity);

  CREATE TABLE IF NOT EXISTS coaching_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_slack_id TEXT NOT NULL,
    rep_name TEXT,
    week_start INTEGER,
    call_count INTEGER,
    avg_talk_ratio INTEGER,
    avg_question_count INTEGER,
    avg_open_question_ratio INTEGER,
    top_objections TEXT,
    outcome_breakdown TEXT,
    coaching_flags TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_coaching_snapshots_rep_slack_id ON coaching_snapshots(rep_slack_id);
  CREATE INDEX IF NOT EXISTS idx_coaching_snapshots_week_start ON coaching_snapshots(week_start);
`);

console.log('Database migrated successfully.');
process.exit(0);

import { App, LogLevel } from '@slack/bolt';
import { config } from './config';
import { registerAllListeners } from './slack/listeners';
import { startCronJobs } from './scheduler/cron-jobs';
import { handleZoomWebhook } from './zoom/webhook-handler';
import http from 'http';

// Run database migrations on startup
import './db/connection';
import { sqlite } from './db/connection';

// Create tables if they don't exist
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

  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company_id TEXT,
    role TEXT,
    slack_user_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_people_email ON people(email);
  CREATE INDEX IF NOT EXISTS idx_people_slack_user_id ON people(slack_user_id);
  CREATE INDEX IF NOT EXISTS idx_people_company_id ON people(company_id);

  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    status TEXT NOT NULL DEFAULT 'prospect',
    revenue INTEGER,
    employee_count INTEGER,
    website TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
  CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'lead',
    value INTEGER,
    close_date INTEGER,
    owner_id TEXT,
    owner_slack_id TEXT,
    source TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id);
  CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
  CREATE INDEX IF NOT EXISTS idx_deals_owner_slack_id ON deals(owner_slack_id);

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date INTEGER,
    duration INTEGER,
    source TEXT NOT NULL DEFAULT 'zoom',
    zoom_meeting_id TEXT,
    calendar_event_id TEXT,
    transcript_text TEXT,
    summary TEXT,
    meeting_type TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meetings_zoom_meeting_id ON meetings(zoom_meeting_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT,
    content TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
  CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    what TEXT NOT NULL,
    context TEXT,
    decided_by TEXT,
    meeting_id TEXT,
    source_type TEXT NOT NULL DEFAULT 'meeting',
    source_ref TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_decisions_meeting_id ON decisions(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_decided_by ON decisions(decided_by);

  CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_type, source_id);
  CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);

  CREATE TABLE IF NOT EXISTS knowledge_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_entries_source ON knowledge_entries(source_type, source_id);

  CREATE TABLE IF NOT EXISTS topic_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    normalized_topic TEXT NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1,
    source_types TEXT,
    source_ids TEXT,
    last_seen_at INTEGER,
    sop_generated INTEGER DEFAULT 0,
    sop_id TEXT,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_topic_counts_normalized ON topic_counts(normalized_topic);
  CREATE INDEX IF NOT EXISTS idx_topic_counts_occurrences ON topic_counts(occurrences);

  CREATE TABLE IF NOT EXISTS qa_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    was_correct INTEGER,
    correction TEXT,
    confidence TEXT,
    source_entry_ids TEXT,
    asked_by TEXT,
    asked_via TEXT,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_qa_asked_by ON qa_interactions(asked_by);
  CREATE INDEX IF NOT EXISTS idx_qa_was_correct ON qa_interactions(was_correct);
`);

console.log('Database initialized.');

// Initialize the Slack Bolt app
const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Register all Slack event handlers
registerAllListeners(app);

// Start cron jobs for reminders, escalation, and weekly digest
startCronJobs(app.client);

// Start a simple HTTP server for Zoom webhooks
const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/zoom/webhook') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);

        // Verify Zoom webhook signature
        const signature = req.headers['x-zm-signature'] as string;
        const timestamp = req.headers['x-zm-request-timestamp'] as string;
        const webhookSecret = config.zoom.webhookSecretToken || config.zoom.clientSecret;

        if (webhookSecret && signature && timestamp) {
          const crypto = require('crypto');
          const message = `v0:${timestamp}:${body}`;
          const expectedSig = 'v0=' + crypto.createHmac('sha256', webhookSecret).update(message).digest('hex');
          if (signature !== expectedSig) {
            console.warn('Zoom webhook signature mismatch — rejecting.');
            res.writeHead(403);
            res.end('Invalid signature');
            return;
          }
        } else if (webhookSecret && payload.event !== 'endpoint.url_validation') {
          console.warn('Zoom webhook missing signature headers — rejecting.');
          res.writeHead(403);
          res.end('Missing signature');
          return;
        }

        // Log every incoming webhook event for debugging
        console.log('Zoom webhook received:', payload.event, JSON.stringify(payload).substring(0, 200));

        // Zoom webhook signature verification (warn-only, does not block)
        const zoomSignature = req.headers['x-zm-signature'] as string | undefined;
        const zoomTimestamp = req.headers['x-zm-request-timestamp'] as string | undefined;
        if (zoomSignature && zoomTimestamp && config.zoom.webhookSecretToken) {
          const crypto = require('crypto');
          const message = `v0:${zoomTimestamp}:${body}`;
          const expectedSig = 'v0=' + crypto.createHmac('sha256', config.zoom.webhookSecretToken).update(message).digest('hex');
          if (zoomSignature !== expectedSig) {
            console.warn('Zoom webhook signature mismatch! Expected:', expectedSig.substring(0, 20) + '...', 'Got:', zoomSignature.substring(0, 20) + '...');
          }
        }

        // Zoom webhook validation challenge
        if (payload.event === 'endpoint.url_validation') {
          const crypto = require('crypto');
          const hashForValidation = crypto
            .createHmac('sha256', config.zoom.webhookSecretToken || config.zoom.clientSecret || '')
            .update(payload.payload.plainToken)
            .digest('hex');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            plainToken: payload.payload.plainToken,
            encryptedToken: hashForValidation,
          }));
          return;
        }

        // Handle the webhook
        await handleZoomWebhook(payload, app.client);
        res.writeHead(200);
        res.end('OK');
      } catch (error) {
        console.error('Zoom webhook error:', error);
        res.writeHead(500);
        res.end('Error');
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'atlaschief' }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Start everything
async function start() {
  await app.start();
  console.log('Atlas Chief of Staff bot is running! (Socket Mode)');

  httpServer.listen(config.port, () => {
    console.log('HTTP server listening on port ' + config.port + ' (for Zoom webhooks + health check)');
  });

  console.log('');
  console.log('=== Atlas Chief of Staff (@atlaschief) ===');
  console.log('Monitoring Slack channels for commitments...');
  console.log('Zoom webhook endpoint: http://localhost:' + config.port + '/zoom/webhook');
  console.log('Health check: http://localhost:' + config.port + '/health');
  console.log('');
}

start().catch((error) => {
  console.error('Failed to start bot:', error);
  process.exit(1);
});

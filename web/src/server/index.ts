import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import briefingRouter from './routes/briefing';
import tasksRouter from './routes/tasks';
import dashboardRouter from './routes/dashboard';
import graphRouter from './routes/graph';
import settingsRouter from './routes/settings';
const app = express();
const PORT = Number(process.env.WEB_PORT) || 3001;

// ─── Initialize DB tables on startup (production: fresh volume) ──────
{
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
  const initDb = new Database(dbPath);
  initDb.exec(`
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
  `);
  initDb.close();
  console.log('[server] Database tables initialized.');
}

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true  // Allow same-origin in production (served from same server)
    : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());

// ─── User context middleware — attach userId + isAdmin to every request ──
app.use((req: any, _res: any, next: any) => {
  const userId = req.headers['x-user-id'] as string | undefined;
  req.userId = userId || null;
  req.isAdmin = false;
  if (userId) {
    try {
      const Database = require('better-sqlite3');
      const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
      const sqlite = new Database(dbPath, { readonly: true });
      const esc = sqlite.prepare('SELECT role FROM escalation_targets WHERE slack_user_id = ?').get(userId) as any;
      sqlite.close();
      req.isAdmin = esc?.role === 'owner';
    } catch { /* not admin */ }
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth endpoints ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { slackUserId } = req.body as { slackUserId: string };
    if (!slackUserId || !/^U[A-Z0-9]+$/.test(slackUserId)) {
      res.status(400).json({ error: 'Invalid Slack User ID format. Should start with U followed by letters and numbers.' });
      return;
    }

    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath);

    // Ensure tables exist (fresh DB on first deploy)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS team_members (id INTEGER PRIMARY KEY AUTOINCREMENT, slack_user_id TEXT NOT NULL, team TEXT NOT NULL, display_name TEXT, coaching_role TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS escalation_targets (id INTEGER PRIMARY KEY AUTOINCREMENT, slack_user_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, slack_user_id TEXT NOT NULL, slack_user_name TEXT, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DETECTED', confidence TEXT, team TEXT, deadline_text TEXT, deadline INTEGER, completed_at INTEGER, source TEXT NOT NULL DEFAULT 'slack', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT, content TEXT, version INTEGER NOT NULL DEFAULT 1, auto_generated INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_id TEXT NOT NULL, content TEXT NOT NULL, embedding BLOB, embedding_model TEXT, metadata TEXT, created_at INTEGER NOT NULL);
    `);

    // Check if user exists in team_members, escalation_targets, or has tasks
    const member = sqlite.prepare('SELECT display_name, team, coaching_role FROM team_members WHERE slack_user_id = ?').get(slackUserId) as any;
    const escalation = sqlite.prepare('SELECT display_name, role FROM escalation_targets WHERE slack_user_id = ?').get(slackUserId) as any;
    const hasTask = sqlite.prepare('SELECT 1 FROM tasks WHERE slack_user_id = ? LIMIT 1').get(slackUserId) as any;

    // Also check env-configured admin IDs (bot stores these as env vars, not in DB)
    const envAdminIds = [
      process.env.OMER_SLACK_USER_ID,
      process.env.MARK_SLACK_USER_ID,
      process.env.EHSAN_SLACK_USER_ID,
    ].filter(Boolean);
    const isEnvAdmin = envAdminIds.includes(slackUserId);

    // Bootstrap: if no escalation targets configured yet, allow any valid Slack ID
    // (admin can then set up proper access via Settings)
    const totalEscalation = sqlite.prepare('SELECT count(*) as c FROM escalation_targets').get() as any;
    const noEscalationTargets = (totalEscalation?.c ?? 0) === 0;

    sqlite.close();

    // Allow login if user found in any table, is an env admin, OR no escalation targets exist yet (bootstrap)
    if (!member && !escalation && !hasTask && !isEnvAdmin && !noEscalationTargets) {
      res.status(403).json({ error: 'User not found. Ask your admin to add you to the team in Settings.' });
      return;
    }

    // Admin if: env admin, DB escalation owner, or first user during bootstrap
    const isAdmin = isEnvAdmin || escalation?.role === 'owner' || (noEscalationTargets && !member);

    // Resolve display name: DB first, then Slack API for real name
    let displayName = member?.display_name || escalation?.display_name || null;
    if (!displayName && process.env.SLACK_BOT_TOKEN) {
      try {
        const slackRes = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
          headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
        });
        const slackData = await slackRes.json() as any;
        if (slackData.ok && slackData.user) {
          displayName = slackData.user.real_name || slackData.user.profile?.real_name || slackData.user.name;
        }
      } catch { /* fallback to ID */ }
    }
    displayName = displayName || slackUserId;

    res.json({
      slackUserId,
      displayName,
      isAdmin,
      team: member?.team || null,
      coachingRole: member?.coaching_role || null,
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Slack workspace users ───────────────────────────────────────────
app.get('/api/slack-users', async (_req, res) => {
  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
      return;
    }

    const response = await fetch('https://slack.com/api/users.list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json() as any;

    if (!data.ok) {
      res.status(500).json({ error: `Slack API error: ${data.error}` });
      return;
    }

    // Filter out bots, deactivated users, and Slackbot
    const users = (data.members || [])
      .filter((u: any) => !u.is_bot && !u.deleted && u.id !== 'USLACKBOT')
      .map((u: any) => ({
        slackUserId: u.id,
        displayName: u.real_name || u.profile?.real_name || u.name,
        email: u.profile?.email || null,
        avatar: u.profile?.image_48 || null,
        title: u.profile?.title || null,
      }));

    res.json(users);
  } catch (err) {
    console.error('[slack-users] error:', err);
    res.status(500).json({ error: 'Failed to fetch Slack users' });
  }
});

// ─── SOPs — raw SQL to avoid bot import chain issues ─────────────────
app.get('/api/sops', (_req, res) => {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath, { readonly: true });
    const rows = sqlite.prepare("SELECT * FROM documents WHERE type = 'sop' ORDER BY updated_at DESC").all();
    sqlite.close();
    const enriched = (rows as any[]).map((d) => {
      let meta: any = {};
      try { meta = d.metadata ? JSON.parse(d.metadata) : {}; } catch { /* ignore */ }
      return { ...d, summary: meta.summary || null, format: meta.format || null };
    });
    res.json(enriched);
  } catch (err) {
    console.error('[sops] error:', err);
    res.json([]);
  }
});

// ─── Knowledge upload — raw SQL fallback ─────────────────────────────
app.post('/api/knowledge/upload', (req, res) => {
  try {
    const { title, type, content } = req.body as { title: string; type: string; content: string };
    if (!title || !type || !content) {
      res.status(400).json({ error: 'title, type, and content are required' });
      return;
    }
    const Database = require('better-sqlite3');
    const path = require('path');
    const crypto = require('crypto');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath);
    const docId = `doc_${crypto.randomBytes(6).toString('hex')}`;
    const now = Math.floor(Date.now() / 1000);

    sqlite.prepare(`INSERT INTO documents (id, title, type, content, version, auto_generated, status, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, 'published', ?, ?)`).run(docId, title, type, content, now, now);

    // Also insert a knowledge entry so it's searchable via /ask
    sqlite.prepare(`INSERT INTO knowledge_entries (source_type, source_id, content, created_at) VALUES ('document', ?, ?, ?)`).run(docId, content.slice(0, 10000), now);

    sqlite.close();
    res.json({ success: true, docId, chunkCount: 0, entities: { people: 0, companies: 0 }, note: 'Document saved. Text search is available.' });
  } catch (err) {
    console.error('[knowledge-upload] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Atlas Brain — Claude-powered Q&A with knowledge base context ────
app.post('/api/ask', async (req, res) => {
  try {
    const { question, generateEmail } = req.body as { question?: string; generateEmail?: boolean };
    if (!question?.trim()) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const q = question.trim();
    const Database = require('better-sqlite3');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath, { readonly: true });

    // ── Step 1: Search knowledge base for relevant context ──
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'was', 'one', 'our', 'has', 'have', 'what', 'how', 'who', 'where', 'when', 'why', 'which', 'that', 'this', 'with', 'from', 'about', 'does', 'will', 'would', 'could', 'should']);
    const keywords = q.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w));

    let matches: any[] = [];
    for (const kw of keywords.slice(0, 8)) {
      const rows = sqlite.prepare('SELECT id, content, source_type as sourceType, source_id as sourceId FROM knowledge_entries WHERE content LIKE ? LIMIT 15').all(`%${kw}%`);
      matches.push(...rows);
    }
    const seen = new Set<number>();
    matches = matches.filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    // Score by keyword overlap and take top entries
    matches.sort((a: any, b: any) => {
      const aScore = keywords.filter(kw => a.content.toLowerCase().includes(kw)).length;
      const bScore = keywords.filter(kw => b.content.toLowerCase().includes(kw)).length;
      return bScore - aScore;
    });
    matches = matches.slice(0, 8);

    // Also search documents directly
    let docMatches: any[] = [];
    for (const kw of keywords.slice(0, 5)) {
      const rows = sqlite.prepare('SELECT id, title, content, type FROM documents WHERE content LIKE ? OR title LIKE ? LIMIT 5').all(`%${kw}%`, `%${kw}%`);
      docMatches.push(...rows);
    }
    const seenDocs = new Set<string>();
    docMatches = docMatches.filter((d: any) => { if (seenDocs.has(d.id)) return false; seenDocs.add(d.id); return true; }).slice(0, 5);

    sqlite.close();

    // ── Step 2: Send to Claude with knowledge context ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: return raw matches if no API key
      const parts = matches.map((m: any, i: number) => `[${i + 1}] ${m.content.slice(0, 500)}`);
      res.json({ answer: parts.join('\n\n') || 'No relevant knowledge found.', question: q, sources: matches.map((m: any) => ({ id: m.id, sourceType: m.sourceType })) });
      return;
    }

    // Build context from knowledge entries + documents
    const contextParts: string[] = [];
    matches.forEach((m: any, i: number) => {
      contextParts.push(`[Source ${i + 1}] (${m.sourceType}):\n${m.content.slice(0, 2000)}`);
    });
    docMatches.forEach((d: any) => {
      contextParts.push(`[Document: ${d.title}] (${d.type}):\n${(d.content || '').slice(0, 2000)}`);
    });
    const context = contextParts.join('\n\n---\n\n');

    const isEmailRequest = generateEmail || /email|draft|compose|write to|follow.?up|message to/i.test(q);

    const systemPrompt = isEmailRequest
      ? `You are Atlas Chief of Staff, an elite AI executive assistant for Atlas Growth (youratlas.com). You draft professional follow-up emails.

Rules:
- Write the email ready to send — subject line + body
- Be concise, professional, and action-oriented
- Reference specific details from the knowledge base context
- Match the tone to the situation (warm for CS, direct for sales)
- End with a clear call-to-action
- Sign off as the rep (not as Atlas)
- Never include placeholder brackets like [Name] — use context to fill in real details`
      : `You are Atlas Brain — the living knowledge engine for Atlas Growth (youratlas.com). You speak as a brilliant, warm, and trusted colleague who knows everything about Atlas. You ARE the company brain.

Your personality:
- Conversational and natural — like talking to a senior colleague who genuinely wants to help
- Confident but not robotic — you say "Our onboarding process is..." not "The onboarding process consists of..."
- Polished enough to share with clients — every answer should be presentation-ready
- Adaptive length — short punchy answers for simple questions, detailed walkthroughs for complex ones
- You use "we" and "our" because you're part of the team

Response style:
- Lead with the answer, not a preamble. No "Great question!" or "Based on the knowledge base..."
- Write like Claude — natural, flowing, intelligent prose. Not bullet-point dumps
- Use formatting sparingly and purposefully — headers only for long answers, bold for key terms
- For processes: walk through it naturally like you're explaining to a new team member
- For strategy/competitive: be direct and opinionated, like a seasoned exec
- For customer-facing prep: give answers polished enough to paste into an email or deck
- If something isn't in the knowledge base, be honest: "I don't have specifics on that yet — you might want to upload [X] to fill that gap"
- Never say "according to the documents" or cite sources with brackets — just speak with authority`;

    const userPrompt = context.length > 0
      ? `Here is relevant context from the Atlas knowledge base:\n\n${context}\n\n---\n\nQuestion: ${q}`
      : `Question: ${q}\n\n(Note: No matching documents were found in the knowledge base for this query. Answer based on general best practices if possible, and suggest what documents might help if uploaded.)`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const claudeData = await claudeRes.json() as any;

    if (!claudeRes.ok) {
      console.error('[ask] Claude API error:', claudeData);
      res.status(500).json({ error: 'AI processing failed. Please try again.' });
      return;
    }

    const answer = claudeData.content?.[0]?.text || 'No response generated.';

    // Record the Q&A interaction
    try {
      const writeDb = new (require('better-sqlite3'))(process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db'));
      writeDb.prepare('INSERT INTO qa_interactions (question, answer, confidence, source_entry_ids, asked_via, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        q, answer, matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low',
        JSON.stringify(matches.map((m: any) => m.id)), 'web', Math.floor(Date.now() / 1000)
      );
      writeDb.close();
    } catch { /* non-critical */ }

    res.json({
      answer,
      question: q,
      sources: matches.map((m: any) => ({ id: m.id, sourceType: m.sourceType })),
      isEmail: isEmailRequest,
    });
  } catch (err) {
    console.error('[ask] error:', err);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// Email drafts — use raw SQL to avoid import-triggered Express dual-instance issues
app.get('/api/email-drafts', (req: any, res) => {
  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath, { readonly: true });
    // Non-admins only see their own follow-up drafts
    const drafts = (req.userId && !req.isAdmin)
      ? sqlite.prepare('SELECT * FROM email_drafts WHERE rep_slack_id = ? ORDER BY created_at DESC LIMIT 20').all(req.userId)
      : sqlite.prepare('SELECT * FROM email_drafts ORDER BY created_at DESC LIMIT 20').all();
    sqlite.close();
    res.json(drafts);
  } catch (err) {
    console.error('[email-drafts] error:', err);
    res.json([]);
  }
});

app.post('/api/email-drafts/:id/status', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body as { status: string };
    if (!status || !['sent', 'dismissed', 'draft'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath);
    sqlite.prepare('UPDATE email_drafts SET status = ? WHERE id = ?').run(status, id);
    sqlite.close();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Routes - order matters in Express 5
// Mount briefing first — avoids Express 5 router ordering issues
app.use('/api', briefingRouter);
app.use('/api', tasksRouter);
app.use('/api', dashboardRouter);
app.use('/api', graphRouter);
app.use('/api', settingsRouter);

// Knowledge router loaded via require to isolate its heavy bot imports
try {
  const knowledgeMod = require('./routes/knowledge');
  app.use('/api', knowledgeMod.default || knowledgeMod);
} catch (err: any) {
  console.error('[server] Knowledge routes failed:', err.message);
}

// ─── Static files (production Vite build) ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDir = path.resolve(__dirname, '../../dist/client');
  app.use(express.static(clientDir));
  // SPA fallback — serve index.html for all non-API routes (Express 5 syntax)
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Atlas Command Center API running on http://localhost:${PORT}`);
});

export default app;

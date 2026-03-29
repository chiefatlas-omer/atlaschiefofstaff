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

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true  // Allow same-origin in production (served from same server)
    : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());

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
    const sqlite = new Database(dbPath, { readonly: true });

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

// ─── Knowledge Q&A — raw SQL ─────────────────────────────────────────
app.post('/api/ask', (req, res) => {
  try {
    const { question } = req.body as { question?: string };
    if (!question?.trim()) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath, { readonly: true });

    const q = question.trim();
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'was', 'one', 'our', 'has', 'have', 'what', 'how', 'who', 'where', 'when', 'why', 'which', 'that', 'this', 'with', 'from', 'about', 'does', 'will']);
    const keywords = q.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w));

    let matches: any[] = [];
    for (const kw of keywords.slice(0, 5)) {
      const rows = sqlite.prepare(`SELECT id, content, source_type as sourceType, source_id as sourceId FROM knowledge_entries WHERE content LIKE ? LIMIT 10`).all(`%${kw}%`);
      matches.push(...rows);
    }
    // Deduplicate
    const seen = new Set<number>();
    matches = matches.filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; }).slice(0, 5);

    sqlite.close();

    if (matches.length === 0) {
      res.json({ answer: 'No knowledge entries found matching your question. Upload documents to build your knowledge base.', question: q, sources: [] });
      return;
    }

    const parts = ['Here\'s what I found in the knowledge base:\n'];
    matches.forEach((m: any, i: number) => {
      const snippet = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content;
      parts.push(`**[${i + 1}]** (${m.sourceType}): ${snippet}`);
    });

    res.json({ answer: parts.join('\n'), question: q, sources: matches.map((m: any) => ({ id: m.id, sourceType: m.sourceType })) });
  } catch (err) {
    console.error('[ask] error:', err);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// Email drafts — use raw SQL to avoid import-triggered Express dual-instance issues
app.get('/api/email-drafts', (_req, res) => {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const sqlite = new Database(dbPath, { readonly: true });
    const drafts = sqlite.prepare('SELECT * FROM email_drafts ORDER BY created_at DESC LIMIT 20').all();
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

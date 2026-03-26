import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import briefingRouter from './routes/briefing';
import tasksRouter from './routes/tasks';
import dashboardRouter from './routes/dashboard';
import graphRouter from './routes/graph';
const app = express();
const PORT = Number(process.env.WEB_PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Email drafts — use raw SQL to avoid import-triggered Express dual-instance issues
app.get('/api/email-drafts', (_req, res) => {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.resolve(process.env.DATABASE_PATH || '../bot/data/chiefofstaff.db');
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
    const dbPath = path.resolve(process.env.DATABASE_PATH || '../bot/data/chiefofstaff.db');
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

// Knowledge router loaded via require to isolate its heavy bot imports
try {
  const knowledgeMod = require('./routes/knowledge');
  app.use('/api', knowledgeMod.default || knowledgeMod);
} catch (err: any) {
  console.error('[server] Knowledge routes failed:', err.message);
}

app.listen(PORT, () => {
  console.log(`Atlas Command Center API running on http://localhost:${PORT}`);
});

export default app;

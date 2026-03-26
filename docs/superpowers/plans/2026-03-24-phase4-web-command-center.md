# Phase 4: Web Command Center + Outcome Dashboards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based command center where any team member sees tasks, meetings, follow-ups, decisions, SOPs, and knowledge bot search in one place — plus outcome dashboards showing real business impact metrics.

**Architecture:** Create a `web/` directory with an Express API backend that imports the existing bot service layer (task-service, knowledge-bot, sop-service, feedback-service, graph-service, topic-tracker). Serve a React SPA (built with Vite) for the frontend. Both the bot and web app read/write the same SQLite database. Simple team auth via environment-configured user list for internal use.

**Tech Stack:** Express.js (API), React + Vite (frontend), Tailwind CSS (styling), existing Drizzle ORM services, shared SQLite database.

---

## File Structure

### New Directory: `web/`

```
web/
  package.json
  tsconfig.json
  vite.config.ts
  .env
  src/
    server/
      index.ts              — Express server entry point
      routes/
        tasks.ts            — GET /api/tasks, /api/tasks/stats
        knowledge.ts        — POST /api/ask
        sops.ts             — GET /api/sops
        dashboard.ts        — GET /api/dashboard (aggregated metrics)
        graph.ts            — GET /api/people, /api/companies, /api/meetings
    client/
      index.html            — Vite entry
      main.tsx              — React root
      App.tsx               — Router + layout
      pages/
        Dashboard.tsx       — Command center home (unified inbox)
        Metrics.tsx         — Outcome dashboards
        Knowledge.tsx       — Knowledge bot search
        SOPs.tsx            — SOP library
      components/
        TaskList.tsx        — Task table with status badges
        MetricCard.tsx      — Single metric display card
        SearchBar.tsx       — Knowledge bot search input
        SOPCard.tsx         — SOP preview card
        Layout.tsx          — Navigation sidebar + header
      lib/
        api.ts              — Fetch wrapper for API calls
      styles/
        globals.css         — Tailwind imports
```

### Modified Files
- `bot/src/index.ts` — No changes needed (bot runs independently)
- Root `.gitignore` — Add web/dist/, web/node_modules/

---

## Task 1: Initialize Web Project with Express + Vite + React

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/.env`
- Create: `web/src/server/index.ts`
- Create: `web/src/client/index.html`
- Create: `web/src/client/main.tsx`
- Create: `web/src/client/styles/globals.css`

- [ ] **Step 1: Create web/package.json**

```bash
cd "C:/Users/omerj/OneDrive/Desktop/Code/atlas-chief-of-staff" && mkdir -p web
cd web && npm init -y
```

Then install dependencies:
```bash
npm install express cors dotenv better-sqlite3 drizzle-orm
npm install react react-dom react-router-dom
npm install -D typescript @types/node @types/express @types/cors @types/react @types/react-dom @types/better-sqlite3
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite tsx
```

- [ ] **Step 2: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@bot/*": ["../bot/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create web/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: './src/client',
  build: {
    outDir: '../../dist/client',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Create web/.env**

```
DATABASE_PATH=../bot/data/chiefofstaff.db
WEB_PORT=3001
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 5: Create web/src/server/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WEB_PORT || 3001;

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atlas-cos-web' });
});

app.listen(PORT, () => {
  console.log(`[web] Atlas Command Center running on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Create client entry files**

Create `web/src/client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atlas Command Center</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

Create `web/src/client/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(<App />);
```

Create `web/src/client/styles/globals.css`:
```css
@import 'tailwindcss';
```

Create `web/src/client/App.tsx`:
```tsx
import React from 'react';

export function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="flex items-center justify-center h-screen">
        <h1 className="text-3xl font-bold text-purple-400">Atlas Command Center</h1>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add scripts to package.json**

Update `web/package.json` scripts:
```json
{
  "scripts": {
    "dev": "concurrently \"npx tsx src/server/index.ts\" \"npx vite\"",
    "dev:server": "npx tsx watch src/server/index.ts",
    "dev:client": "npx vite",
    "build": "vite build && tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js"
  }
}
```

Install concurrently: `npm install -D concurrently`

- [ ] **Step 8: Verify it runs**

```bash
cd web && npx vite --port 5173 &
# Should serve React app at localhost:5173
```

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat: initialize web command center — Express + Vite + React + Tailwind"
```

---

## Task 2: Build API Routes (Tasks, Dashboard, Graph)

**Files:**
- Create: `web/src/server/db.ts` — Shared DB connection for web app
- Create: `web/src/server/routes/tasks.ts`
- Create: `web/src/server/routes/dashboard.ts`
- Create: `web/src/server/routes/graph.ts`
- Modify: `web/src/server/index.ts` — Register routes

Since the web app and bot share the same SQLite file, we create a separate DB connection in the web app (both use WAL mode which supports concurrent readers).

- [ ] **Step 1: Create web/src/server/db.ts**

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import * as schema from '../../../bot/src/db/schema';

const dbPath = path.resolve(process.env.DATABASE_PATH || '../bot/data/chiefofstaff.db');
const sqlite = new Database(dbPath, { readonly: false });
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };
```

- [ ] **Step 2: Create tasks route**

Create `web/src/server/routes/tasks.ts`:

```typescript
import { Router } from 'express';
import { db } from '../db';
import { tasks } from '../../../../bot/src/db/schema';
import { eq, and, not, lt, desc } from 'drizzle-orm';

const router = Router();

// GET /api/tasks — all open tasks
router.get('/', (_req, res) => {
  const openTasks = db.select().from(tasks)
    .where(and(
      not(eq(tasks.status, 'COMPLETED')),
      not(eq(tasks.status, 'DISMISSED')),
    ))
    .orderBy(desc(tasks.createdAt))
    .all();
  res.json(openTasks);
});

// GET /api/tasks/stats — task metrics
router.get('/stats', (_req, res) => {
  const all = db.select().from(tasks).all();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const open = all.filter(t => !['COMPLETED', 'DISMISSED'].includes(t.status));
  const overdue = open.filter(t => t.deadline && new Date(t.deadline as any) < now);
  const completedThisWeek = all.filter(t =>
    t.status === 'COMPLETED' && t.completedAt && new Date(t.completedAt as any) > weekAgo
  );
  const createdThisWeek = all.filter(t =>
    t.createdAt && new Date(t.createdAt as any) > weekAgo
  );

  res.json({
    totalOpen: open.length,
    overdue: overdue.length,
    completedThisWeek: completedThisWeek.length,
    createdThisWeek: createdThisWeek.length,
    completionRate: createdThisWeek.length > 0
      ? Math.round((completedThisWeek.length / createdThisWeek.length) * 100)
      : null,
  });
});

export { router as tasksRouter };
```

- [ ] **Step 3: Create dashboard route (aggregated metrics)**

Create `web/src/server/routes/dashboard.ts`:

```typescript
import { Router } from 'express';
import { db } from '../db';
import { tasks, documents, meetings, decisions, qaInteractions, topicCounts } from '../../../../bot/src/db/schema';
import { eq, and, not, desc, gt } from 'drizzle-orm';

const router = Router();

// GET /api/dashboard — all outcome metrics in one call
router.get('/', (_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 24 * 60 * 60;
  const monthAgo = now - 30 * 24 * 60 * 60;

  // Tasks
  const allTasks = db.select().from(tasks).all();
  const openTasks = allTasks.filter(t => !['COMPLETED', 'DISMISSED'].includes(t.status));
  const overdueTasks = openTasks.filter(t => t.deadline && (t.deadline as any) < new Date());
  const completedWeek = allTasks.filter(t => t.status === 'COMPLETED' && t.completedAt);
  const createdWeek = allTasks.filter(t => t.createdAt);

  // Meetings
  const allMeetings = db.select().from(meetings).all();
  const meetingsThisWeek = allMeetings.filter(m => m.date && m.date > weekAgo);
  const meetingsWithSummary = allMeetings.filter(m => m.summary);

  // SOPs
  const allSops = db.select().from(documents).where(eq(documents.type, 'sop')).all();
  const activeSops = allSops.filter(s => s.status === 'active');
  const draftSops = allSops.filter(s => s.status === 'draft');

  // Decisions
  const allDecisions = db.select().from(decisions).all();
  const recentDecisions = allDecisions.filter(d => d.createdAt && d.createdAt > weekAgo);

  // Q&A accuracy
  const allQa = db.select().from(qaInteractions).all();
  const rated = allQa.filter(q => q.wasCorrect !== null);
  const correct = rated.filter(q => q.wasCorrect === true);
  const accuracyRate = rated.length > 0 ? Math.round((correct.length / rated.length) * 100) : null;

  // Topics
  const topTopics = db.select().from(topicCounts)
    .orderBy(desc(topicCounts.occurrences))
    .limit(10)
    .all();

  res.json({
    tasks: {
      totalOpen: openTasks.length,
      overdue: overdueTasks.length,
      completedThisWeek: completedWeek.length,
      createdThisWeek: createdWeek.length,
    },
    meetings: {
      totalTracked: allMeetings.length,
      thisWeek: meetingsThisWeek.length,
      preppedRate: allMeetings.length > 0
        ? Math.round((meetingsWithSummary.length / allMeetings.length) * 100)
        : null,
    },
    sops: {
      active: activeSops.length,
      drafts: draftSops.length,
      total: allSops.length,
    },
    decisions: {
      total: allDecisions.length,
      thisWeek: recentDecisions.length,
    },
    knowledgeBot: {
      totalQuestions: allQa.length,
      accuracyRate,
      knowledgeGaps: allQa.filter(q => q.confidence === 'low').length,
    },
    topTopics: topTopics.map(t => ({
      topic: t.topic,
      occurrences: t.occurrences,
      hasSop: t.sopGenerated,
    })),
  });
});

export { router as dashboardRouter };
```

- [ ] **Step 4: Create graph route**

Create `web/src/server/routes/graph.ts`:

```typescript
import { Router } from 'express';
import { db } from '../db';
import { people, companies, deals, meetings, decisions } from '../../../../bot/src/db/schema';
import { desc } from 'drizzle-orm';

const router = Router();

router.get('/people', (_req, res) => {
  res.json(db.select().from(people).orderBy(desc(people.createdAt)).limit(100).all());
});

router.get('/companies', (_req, res) => {
  res.json(db.select().from(companies).orderBy(desc(companies.createdAt)).limit(100).all());
});

router.get('/deals', (_req, res) => {
  res.json(db.select().from(deals).orderBy(desc(deals.createdAt)).limit(100).all());
});

router.get('/meetings', (_req, res) => {
  res.json(db.select().from(meetings).orderBy(desc(meetings.date)).limit(50).all());
});

router.get('/decisions', (_req, res) => {
  res.json(db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(50).all());
});

export { router as graphRouter };
```

- [ ] **Step 5: Create knowledge route**

Create `web/src/server/routes/knowledge.ts`:

```typescript
import { Router } from 'express';
import { db } from '../db';
import { documents } from '../../../../bot/src/db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/sops
router.get('/sops', (_req, res) => {
  const sops = db.select().from(documents).where(eq(documents.type, 'sop')).all();
  res.json(sops);
});

// POST /api/ask — simplified (no embeddings in web, just returns relevant docs)
// For full semantic search, the bot's knowledge-bot service is needed
// Phase 4 MVP: basic text search in knowledge entries
router.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }
  // For now, return a message directing to Slack /ask
  // Full web-based semantic search would require importing the embedding service
  res.json({
    answer: 'Use /ask in Slack for full knowledge bot queries. Web-based search coming soon.',
    confidence: 'low',
    sourceCount: 0,
  });
});

export { router as knowledgeRouter };
```

- [ ] **Step 6: Register all routes in server/index.ts**

Update `web/src/server/index.ts`:

```typescript
import { tasksRouter } from './routes/tasks';
import { dashboardRouter } from './routes/dashboard';
import { graphRouter } from './routes/graph';
import { knowledgeRouter } from './routes/knowledge';

// Register routes
app.use('/api/tasks', tasksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/graph', graphRouter);
app.use('/api/knowledge', knowledgeRouter);
```

- [ ] **Step 7: Verify server starts**

```bash
cd web && npx tsx src/server/index.ts
# Should start on port 3001
# Test: curl http://localhost:3001/api/health
```

- [ ] **Step 8: Commit**

```bash
git add web/src/server/
git commit -m "feat: add API routes — tasks, dashboard metrics, graph entities, knowledge/SOPs"
```

---

## Task 3: Build React Frontend — Layout + Dashboard Page

**Files:**
- Create: `web/src/client/components/Layout.tsx`
- Create: `web/src/client/components/MetricCard.tsx`
- Create: `web/src/client/pages/Dashboard.tsx`
- Create: `web/src/client/lib/api.ts`
- Modify: `web/src/client/App.tsx`

- [ ] **Step 1: Create API client**

Create `web/src/client/lib/api.ts`:

```typescript
const API_BASE = '/api';

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  dashboard: () => fetchApi<DashboardData>('/dashboard'),
  tasks: () => fetchApi<Task[]>('/tasks'),
  taskStats: () => fetchApi<TaskStats>('/tasks/stats'),
  sops: () => fetchApi<SOP[]>('/knowledge/sops'),
  people: () => fetchApi<Person[]>('/graph/people'),
  companies: () => fetchApi<Company[]>('/graph/companies'),
  meetings: () => fetchApi<Meeting[]>('/graph/meetings'),
  decisions: () => fetchApi<Decision[]>('/graph/decisions'),
};

// Types
export interface DashboardData {
  tasks: { totalOpen: number; overdue: number; completedThisWeek: number; createdThisWeek: number };
  meetings: { totalTracked: number; thisWeek: number; preppedRate: number | null };
  sops: { active: number; drafts: number; total: number };
  decisions: { total: number; thisWeek: number };
  knowledgeBot: { totalQuestions: number; accuracyRate: number | null; knowledgeGaps: number };
  topTopics: Array<{ topic: string; occurrences: number; hasSop: boolean }>;
}

export interface Task {
  id: string;
  slackUserId: string;
  slackUserName: string | null;
  description: string;
  status: string;
  deadline: string | null;
  createdAt: string;
}

export interface TaskStats {
  totalOpen: number;
  overdue: number;
  completedThisWeek: number;
  createdThisWeek: number;
  completionRate: number | null;
}

export interface SOP { id: string; title: string; type: string; content: string; status: string; metadata: any; }
export interface Person { id: string; name: string; email: string | null; role: string | null; }
export interface Company { id: string; name: string; industry: string | null; status: string | null; }
export interface Meeting { id: string; title: string | null; date: number | null; summary: string | null; }
export interface Decision { id: string; what: string; decidedBy: string | null; createdAt: number | null; }
```

- [ ] **Step 2: Create Layout component**

Create `web/src/client/components/Layout.tsx`:

```tsx
import React from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: '📊' },
  { label: 'Metrics', path: '/metrics', icon: '📈' },
  { label: 'Knowledge', path: '/knowledge', icon: '🧠' },
  { label: 'SOPs', path: '/sops', icon: '📋' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const currentPath = window.location.pathname;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="text-xl font-bold text-purple-400 mb-8">Atlas CoS</div>
        {NAV_ITEMS.map(item => (
          <a
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
              currentPath === item.path
                ? 'bg-purple-500/20 text-purple-300'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create MetricCard component**

Create `web/src/client/components/MetricCard.tsx`:

```tsx
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'purple' | 'green' | 'red' | 'yellow' | 'blue';
}

const colorMap = {
  purple: 'border-purple-500/30 bg-purple-500/5',
  green: 'border-green-500/30 bg-green-500/5',
  red: 'border-red-500/30 bg-red-500/5',
  yellow: 'border-yellow-500/30 bg-yellow-500/5',
  blue: 'border-blue-500/30 bg-blue-500/5',
};

export function MetricCard({ label, value, subtitle, color = 'purple' }: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-100">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create Dashboard page**

Create `web/src/client/pages/Dashboard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api, DashboardData } from '../lib/api';
import { MetricCard } from '../components/MetricCard';

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!data) return <div className="text-red-400">Failed to load dashboard</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Command Center</h1>

      {/* Task Metrics */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Tasks</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Open Tasks" value={data.tasks.totalOpen} color="purple" />
        <MetricCard label="Overdue" value={data.tasks.overdue} color={data.tasks.overdue > 0 ? 'red' : 'green'} />
        <MetricCard label="Completed This Week" value={data.tasks.completedThisWeek} color="green" />
        <MetricCard label="Created This Week" value={data.tasks.createdThisWeek} color="blue" />
      </div>

      {/* Meeting & Knowledge Metrics */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Intelligence</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Meetings Tracked" value={data.meetings.totalTracked} color="purple" />
        <MetricCard label="Meetings Prepped" value={data.meetings.preppedRate !== null ? `${data.meetings.preppedRate}%` : 'N/A'} color="blue" subtitle="With AI briefings" />
        <MetricCard label="Bot Accuracy" value={data.knowledgeBot.accuracyRate !== null ? `${data.knowledgeBot.accuracyRate}%` : 'N/A'} color={data.knowledgeBot.accuracyRate && data.knowledgeBot.accuracyRate >= 70 ? 'green' : 'yellow'} />
        <MetricCard label="Knowledge Gaps" value={data.knowledgeBot.knowledgeGaps} color={data.knowledgeBot.knowledgeGaps > 5 ? 'red' : 'yellow'} />
      </div>

      {/* SOPs & Decisions */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Knowledge Base</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Active SOPs" value={data.sops.active} color="green" />
        <MetricCard label="Draft SOPs" value={data.sops.drafts} color="yellow" />
        <MetricCard label="Decisions Tracked" value={data.decisions.total} color="purple" />
        <MetricCard label="Decisions This Week" value={data.decisions.thisWeek} color="blue" />
      </div>

      {/* Top Topics */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Trending Topics</h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        {data.topTopics.length === 0 ? (
          <div className="text-gray-500">No topics tracked yet</div>
        ) : (
          <div className="space-y-2">
            {data.topTopics.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className="text-gray-300">{t.topic}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{t.occurrences} mentions</span>
                  {t.hasSop && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">SOP</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire up App.tsx with router**

Update `web/src/client/App.tsx`:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/metrics" element={<div className="text-gray-400">Metrics — Coming soon</div>} />
          <Route path="/knowledge" element={<div className="text-gray-400">Knowledge — Coming soon</div>} />
          <Route path="/sops" element={<div className="text-gray-400">SOPs — Coming soon</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Verify frontend builds**

```bash
cd web && npx vite build
```

- [ ] **Step 7: Commit**

```bash
git add web/src/client/
git commit -m "feat: add React frontend — Dashboard with metric cards, Layout with sidebar navigation"
```

---

## Task 4: Build Metrics Page (Outcome Dashboards)

**Files:**
- Create: `web/src/client/pages/Metrics.tsx`
- Create: `web/src/client/components/TaskList.tsx`
- Modify: `web/src/client/App.tsx` — Wire Metrics route

- [ ] **Step 1: Create TaskList component**

Create `web/src/client/components/TaskList.tsx`:

```tsx
import React from 'react';
import { Task } from '../lib/api';

const statusColors: Record<string, string> = {
  DETECTED: 'bg-yellow-500/20 text-yellow-400',
  CONFIRMED: 'bg-blue-500/20 text-blue-400',
  OVERDUE: 'bg-red-500/20 text-red-400',
  ESCALATED: 'bg-red-600/20 text-red-500',
  COMPLETED: 'bg-green-500/20 text-green-400',
};

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <div className="text-gray-500 p-4">No tasks</div>;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400">
            <th className="text-left p-3">Task</th>
            <th className="text-left p-3">Owner</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
            <tr key={task.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="p-3 text-gray-200 max-w-md truncate">{task.description}</td>
              <td className="p-3 text-gray-400">{task.slackUserName || task.slackUserId}</td>
              <td className="p-3">
                <span className={`text-xs px-2 py-1 rounded ${statusColors[task.status] || 'bg-gray-700 text-gray-300'}`}>
                  {task.status}
                </span>
              </td>
              <td className="p-3 text-gray-400 text-xs">
                {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create Metrics page**

Create `web/src/client/pages/Metrics.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api, Task, DashboardData } from '../lib/api';
import { MetricCard } from '../components/MetricCard';
import { TaskList } from '../components/TaskList';

export function Metrics() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.dashboard(), api.tasks()])
      .then(([d, t]) => { setData(d); setTasks(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!data) return <div className="text-red-400">Failed to load metrics</div>;

  const overdueTasks = tasks.filter(t => t.status === 'OVERDUE' || t.status === 'ESCALATED');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Outcome Dashboards</h1>

      {/* Impact Metrics */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Impact This Week</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Tasks Completed" value={data.tasks.completedThisWeek} color="green" subtitle="This week" />
        <MetricCard label="Meetings Prepped" value={data.meetings.preppedRate !== null ? `${data.meetings.preppedRate}%` : 'N/A'} color="blue" subtitle="AI briefings generated" />
        <MetricCard label="Decisions Captured" value={data.decisions.thisWeek} color="purple" subtitle="From meetings + Slack" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="SOPs Active" value={data.sops.active} color="green" subtitle="Knowledge formalized" />
        <MetricCard label="Bot Accuracy" value={data.knowledgeBot.accuracyRate !== null ? `${data.knowledgeBot.accuracyRate}%` : 'N/A'} color={data.knowledgeBot.accuracyRate && data.knowledgeBot.accuracyRate >= 70 ? 'green' : 'red'} subtitle="Questions answered correctly" />
        <MetricCard label="Questions Answered" value={data.knowledgeBot.totalQuestions} color="purple" subtitle="Escalations prevented" />
      </div>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-red-400 mb-3">Overdue Tasks ({overdueTasks.length})</h2>
          <div className="mb-8">
            <TaskList tasks={overdueTasks} />
          </div>
        </>
      )}

      {/* All Open Tasks */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">All Open Tasks ({tasks.length})</h2>
      <TaskList tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 3: Wire Metrics page into App.tsx**

Update the `/metrics` route in `App.tsx`:
```tsx
import { Metrics } from './pages/Metrics';
// ...
<Route path="/metrics" element={<Metrics />} />
```

- [ ] **Step 4: Commit**

```bash
git add web/src/client/
git commit -m "feat: add Metrics page — outcome dashboards with task list, impact metrics, overdue tracking"
```

---

## Task 5: Build Knowledge + SOPs Pages

**Files:**
- Create: `web/src/client/pages/Knowledge.tsx`
- Create: `web/src/client/pages/SOPs.tsx`
- Create: `web/src/client/components/SearchBar.tsx`
- Create: `web/src/client/components/SOPCard.tsx`
- Modify: `web/src/client/App.tsx`

- [ ] **Step 1: Create SearchBar component**

Create `web/src/client/components/SearchBar.tsx`:

```tsx
import React, { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  loading?: boolean;
}

export function SearchBar({ onSearch, placeholder = 'Ask a question...', loading }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Searching...' : 'Ask'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create Knowledge page**

Create `web/src/client/pages/Knowledge.tsx`:

```tsx
import React, { useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { fetchApi } from '../lib/api';

export function Knowledge() {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    setLoading(true);
    try {
      const result = await fetchApi<{ answer: string; confidence: string; sourceCount: number }>('/knowledge/ask', {
        method: 'POST',
        body: JSON.stringify({ question: query }),
      });
      setAnswer(result.answer);
    } catch {
      setAnswer('Failed to search. Try using /ask in Slack for full knowledge bot queries.');
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Knowledge Base</h1>
      <SearchBar onSearch={handleSearch} loading={loading} placeholder="Ask anything about the business..." />
      {answer && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="text-gray-200 whitespace-pre-wrap">{answer}</div>
        </div>
      )}
      <p className="mt-4 text-gray-500 text-sm">
        For full knowledge bot with semantic search and citations, use <code>/ask</code> in Slack.
        Web-based semantic search coming in a future update.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create SOPCard + SOPs page**

Create `web/src/client/components/SOPCard.tsx`:

```tsx
import React, { useState } from 'react';
import { SOP } from '../lib/api';

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  draft: 'bg-yellow-500/20 text-yellow-400',
  archived: 'bg-gray-600/20 text-gray-400',
};

export function SOPCard({ sop }: { sop: SOP }) {
  const [expanded, setExpanded] = useState(false);
  const meta = sop.metadata as any;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-200">{sop.title}</h3>
        <span className={`text-xs px-2 py-1 rounded ${statusColors[sop.status] || statusColors.draft}`}>
          {sop.status}
        </span>
      </div>
      {meta?.summary && <p className="text-sm text-gray-400 mb-3">{meta.summary}</p>}
      {meta?.format && <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{meta.format}</span>}
      <button
        onClick={() => setExpanded(!expanded)}
        className="block mt-3 text-sm text-purple-400 hover:text-purple-300"
      >
        {expanded ? 'Collapse' : 'View Content'}
      </button>
      {expanded && (
        <div className="mt-3 bg-gray-950 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
          {sop.content}
        </div>
      )}
    </div>
  );
}
```

Create `web/src/client/pages/SOPs.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api, SOP } from '../lib/api';
import { SOPCard } from '../components/SOPCard';

export function SOPs() {
  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sops().then(s => { setSops(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;

  const active = sops.filter(s => s.status === 'active');
  const drafts = sops.filter(s => s.status === 'draft');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Standard Operating Procedures</h1>

      {active.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-green-400 mb-3">Active ({active.length})</h2>
          <div className="grid gap-4 mb-8">
            {active.map(s => <SOPCard key={s.id} sop={s} />)}
          </div>
        </>
      )}

      {drafts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-yellow-400 mb-3">Drafts ({drafts.length})</h2>
          <div className="grid gap-4 mb-8">
            {drafts.map(s => <SOPCard key={s.id} sop={s} />)}
          </div>
        </>
      )}

      {sops.length === 0 && (
        <div className="text-gray-500">No SOPs generated yet. Use <code>/sop topic</code> in Slack to create one.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire pages into App.tsx**

Update imports and routes:
```tsx
import { Knowledge } from './pages/Knowledge';
import { SOPs } from './pages/SOPs';
// ...
<Route path="/knowledge" element={<Knowledge />} />
<Route path="/sops" element={<SOPs />} />
```

- [ ] **Step 5: Commit**

```bash
git add web/src/client/
git commit -m "feat: add Knowledge search page + SOPs library with expandable cards"
```

---

## Task 6: Add launch.json + Integration Verification

**Files:**
- Modify: `web/.claude/launch.json` or root `.claude/launch.json`
- Modify: Root `.gitignore`

- [ ] **Step 1: Update .claude/launch.json for web dev server**

Update `C:/Users/omerj/OneDrive/Desktop/Code/atlas-chief-of-staff/.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["vite", "--port", "5173"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 2: Update .gitignore**

Add to root `.gitignore`:
```
web/node_modules/
web/dist/
```

- [ ] **Step 3: Verify everything compiles**

```bash
cd bot && npx tsc --noEmit
cd ../desktop && npx tsc --noEmit
cd ../web && npx vite build
```

- [ ] **Step 4: Start dev server and verify**

```bash
cd web && npx tsx src/server/index.ts &
npx vite --port 5173
```

Test API: `curl http://localhost:3001/api/health`
Open browser: `http://localhost:5173`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Phase 4 complete — web command center with dashboard, metrics, knowledge, SOPs"
```

---

## Verification Summary

| What | How to Test | Expected |
|------|-------------|----------|
| API health | `curl localhost:3001/api/health` | `{"status":"ok"}` |
| Dashboard API | `curl localhost:3001/api/dashboard` | JSON with task/meeting/SOP/knowledge metrics |
| Tasks API | `curl localhost:3001/api/tasks` | Array of open tasks |
| React app loads | Open `localhost:5173` | Dashboard with metric cards |
| Metrics page | Navigate to /metrics | Outcome dashboards + task list |
| Knowledge page | Navigate to /knowledge | Search bar + results |
| SOPs page | Navigate to /sops | SOP cards with expand/collapse |
| Vite proxy | API calls from frontend | Proxied to Express on 3001 |

# Phase 1: Knowledge Graph + Memory Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unified knowledge graph data model, ingestion pipeline, and embedding layer that forms the foundation of Atlas Chief of Staff's self-learning company OS. Also remove Computer Use agent from the desktop app.

**Architecture:** Extend the existing SQLite database (via Drizzle ORM) with entity tables (people, companies, deals, meetings, documents, decisions), a universal relationships table, and a knowledge_entries table with vector embeddings. Extend existing Zoom and Slack handlers to extract entities and populate the graph. Remove Computer Use entirely from the desktop Electron app.

**Tech Stack:** TypeScript, Drizzle ORM, better-sqlite3, @anthropic-ai/sdk (Claude Sonnet for entity extraction), sqlite-vec or manual cosine similarity for embeddings, Voyage AI or OpenAI for embedding generation.

---

## File Structure

### New Files (Bot)
- `bot/src/db/schema-graph.ts` — New entity tables: people, companies, deals, meetings, documents, decisions, relationships, knowledge_entries
- `bot/src/services/graph-service.ts` — CRUD for entities + relationships, graph traversal queries
- `bot/src/services/embedding-service.ts` — Chunk text, generate embeddings, semantic search
- `bot/src/services/ingestion-service.ts` — Orchestrates: raw content → chunk → extract entities → embed → link
- `bot/src/ai/entity-extractor.ts` — Claude prompts for extracting people, companies, decisions, topics from text

### Modified Files (Bot)
- `bot/src/db/schema.ts` — Import and re-export graph schema tables
- `bot/src/index.ts` — Auto-create new tables on startup
- `bot/src/zoom/webhook-handler.ts` — After transcript processing, run ingestion pipeline
- `bot/src/slack/messages.ts` — After commitment extraction, run knowledge extraction
- `bot/src/ai/prompts.ts` — Add entity extraction prompts
- `bot/package.json` — Add embedding dependency if needed

### Delete Files (Desktop — Computer Use Removal)
- `desktop/src/main/computer-use/agent.ts` — Delete entirely
- `desktop/src/main/computer-use/screen.ts` — Delete entirely
- `desktop/src/main/computer-use/input.ts` — Delete entirely
- `desktop/src/main/computer-use/` — Delete directory

### Modified Files (Desktop — Computer Use Removal)
- `desktop/src/shared/types.ts` — Remove COMPUTER_USE from AppState enum + IPC channels
- `desktop/src/main/ipc-handlers.ts` — Remove Computer Use branch from AUDIO_DATA handler
- `desktop/src/main/ai/intent-classifier.ts` — Remove COMPUTER_USE intent + patterns
- `desktop/src/preload/preload.ts` — Remove onComputerUseStatus/onComputerUseResult
- `desktop/src/renderer/app.ts` — Remove computer-use panel logic
- `desktop/src/renderer/index.html` — Remove computer-use-panel markup
- `desktop/src/renderer/styles.css` — Remove .computer-use-panel styling
- `desktop/package.json` — Remove @nut-tree-fork/nut-js dependency

---

## Task 1: Remove Computer Use Agent from Desktop App

**Files:**
- Delete: `desktop/src/main/computer-use/agent.ts`
- Delete: `desktop/src/main/computer-use/screen.ts`
- Delete: `desktop/src/main/computer-use/input.ts`
- Modify: `desktop/src/shared/types.ts`
- Modify: `desktop/src/main/ai/intent-classifier.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/preload/preload.ts`
- Modify: `desktop/src/renderer/app.ts`
- Modify: `desktop/src/renderer/index.html`
- Modify: `desktop/src/renderer/styles.css`
- Modify: `desktop/package.json`

- [ ] **Step 1: Delete the computer-use directory**

Delete these 3 files entirely:
- `desktop/src/main/computer-use/agent.ts`
- `desktop/src/main/computer-use/screen.ts`
- `desktop/src/main/computer-use/input.ts`

Then remove the empty directory `desktop/src/main/computer-use/`.

- [ ] **Step 2: Remove COMPUTER_USE from shared types**

In `desktop/src/shared/types.ts`:

Remove `COMPUTER_USE = 'computer-use',` from the `AppState` enum (line 6).

Remove these IPC channel constants (lines 31-32):
```typescript
COMPUTER_USE_STATUS: 'computer-use:status',
COMPUTER_USE_RESULT: 'computer-use:result',
```

- [ ] **Step 3: Remove COMPUTER_USE from intent classifier**

In `desktop/src/main/ai/intent-classifier.ts`:

Remove `'COMPUTER_USE'` from the Intent type union.

Remove the computer use regex pattern block (lines 14-19):
```typescript
const computerUsePatterns = /\b(open|click|go to|navigate|type|scroll|move .* to|drag|search for|fill in|submit|close the|switch to|log into)\b/i;
```

Remove the COMPUTER_USE return branch and any `command` extraction for it.

- [ ] **Step 4: Remove Computer Use branch from IPC handlers**

In `desktop/src/main/ipc-handlers.ts`:

Remove the import: `import { runComputerUseAgent } from './computer-use/agent';`

Remove the entire `if (intent === 'COMPUTER_USE')` block (lines 115-138) from the AUDIO_DATA handler. Keep all other intent branches (TASK_QUERY, MEETING_PREP, GENERAL, dictation).

- [ ] **Step 5: Remove Computer Use from preload bridge**

In `desktop/src/preload/preload.ts`:

Remove the IPC channel definitions for COMPUTER_USE_STATUS and COMPUTER_USE_RESULT (lines 14-15).

Remove the `onComputerUseStatus` and `onComputerUseResult` method exposures (lines 57-62).

- [ ] **Step 6: Remove Computer Use from renderer**

In `desktop/src/renderer/app.ts`:

Remove DOM references (lines 35-36):
```typescript
const computerUsePanel = document.getElementById('computer-use-panel')!;
const computerUseStatus = document.getElementById('computer-use-status')!;
```

Remove the `state === 'computer-use'` handler block (lines 77-81).

Remove the `onComputerUseStatus` and `onComputerUseResult` event listeners (lines 213-224).

In `desktop/src/renderer/index.html`:

Remove the computer-use-panel markup (lines 30-33):
```html
<div id="computer-use-panel" class="computer-use-panel hidden">
  <div class="computer-use-indicator"></div>
  <span id="computer-use-status"></span>
</div>
```

In `desktop/src/renderer/styles.css`:

Remove the `.computer-use-panel` and `.computer-use-indicator` styles (lines 179-206).

- [ ] **Step 7: Remove Computer Use dependencies**

In `desktop/package.json`:

Remove: `"@nut-tree-fork/nut-js": "^4.2.6"`

Keep `@anthropic-ai/sdk` — it's used by other features (meeting briefing, intent classification).

- [ ] **Step 8: Verify desktop app builds**

Run:
```bash
cd desktop && npm run build
```

Expected: Build succeeds with no errors. No references to deleted files.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: remove Computer Use agent from desktop app

Strip all Computer Use code: agent, screen capture, input control,
IPC channels, UI panels, and @nut-tree-fork/nut-js dependency.
Voice commands, meeting prep, and task features remain intact."
```

---

## Task 2: Define Knowledge Graph Schema

**Files:**
- Create: `bot/src/db/schema-graph.ts`
- Modify: `bot/src/db/schema.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create the graph schema file**

Create `bot/src/db/schema-graph.ts`:

```typescript
import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';

// ─── People ───────────────────────────────────────────────
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),                    // ppl_<nanoid>
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  companyId: text('company_id'),                  // FK to companies.id
  role: text('role'),                             // e.g. 'owner', 'sales_rep', 'crew_lead'
  slackUserId: text('slack_user_id'),             // link to Slack identity
  source: text('source').notNull().default('manual'), // 'slack', 'zoom', 'manual', 'upload'
  metadata: text('metadata', { mode: 'json' }),   // flexible JSON blob
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer('updated_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_people_email').on(table.email),
  index('idx_people_slack').on(table.slackUserId),
  index('idx_people_company').on(table.companyId),
]);

// ─── Companies ────────────────────────────────────────────
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),                    // cmp_<nanoid>
  name: text('name').notNull(),
  industry: text('industry'),                     // e.g. 'landscaping', 'property_mgmt'
  status: text('status').default('prospect'),     // 'prospect', 'active', 'churned', 'lead'
  revenue: integer('revenue'),                    // annual revenue estimate
  employeeCount: integer('employee_count'),
  website: text('website'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer('updated_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_companies_name').on(table.name),
  index('idx_companies_status').on(table.status),
]);

// ─── Deals ────────────────────────────────────────────────
export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),                    // deal_<nanoid>
  companyId: text('company_id'),                  // FK to companies.id
  name: text('name').notNull(),                   // e.g. 'ABC Landscaping - Maintenance Contract'
  stage: text('stage').default('lead'),           // 'lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
  value: integer('value'),                        // dollar amount
  closeDate: integer('close_date'),               // unix timestamp
  ownerId: text('owner_id'),                      // FK to people.id (sales rep)
  ownerSlackId: text('owner_slack_id'),           // convenience: Slack user ID of owner
  source: text('source').default('manual'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer('updated_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_deals_company').on(table.companyId),
  index('idx_deals_stage').on(table.stage),
  index('idx_deals_owner').on(table.ownerSlackId),
]);

// ─── Meetings ─────────────────────────────────────────────
export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),                    // mtg_<nanoid>
  title: text('title'),
  date: integer('date'),                          // unix timestamp
  duration: integer('duration'),                  // minutes
  source: text('source').default('zoom'),         // 'zoom', 'calendar', 'manual'
  zoomMeetingId: text('zoom_meeting_id'),         // dedup key
  calendarEventId: text('calendar_event_id'),
  transcriptText: text('transcript_text'),        // full transcript
  summary: text('summary'),                       // Claude-generated summary
  meetingType: text('meeting_type'),              // 'team', 'private', 'external'
  metadata: text('metadata', { mode: 'json' }),   // attendee list, recording URL, etc.
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer('updated_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_meetings_zoom').on(table.zoomMeetingId),
  index('idx_meetings_date').on(table.date),
]);

// ─── Documents ────────────────────────────────────────────
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),                    // doc_<nanoid>
  title: text('title').notNull(),
  type: text('type').notNull(),                   // 'sop', 'playbook', 'pricing_guide', 'process_doc', 'customer_info', 'general'
  content: text('content').notNull(),             // full document content (markdown)
  version: integer('version').default(1),
  autoGenerated: integer('auto_generated', { mode: 'boolean' }).default(false),
  status: text('status').default('draft'),        // 'draft', 'active', 'archived'
  createdBy: text('created_by'),                  // slack user ID or 'system'
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer('updated_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_documents_type').on(table.type),
  index('idx_documents_status').on(table.status),
]);

// ─── Decisions ────────────────────────────────────────────
export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),                    // dec_<nanoid>
  what: text('what').notNull(),                   // the decision made
  context: text('context'),                       // surrounding context
  decidedBy: text('decided_by'),                  // slack user ID or name
  meetingId: text('meeting_id'),                  // FK to meetings.id
  sourceType: text('source_type').default('meeting'), // 'meeting', 'slack', 'voice'
  sourceRef: text('source_ref'),                  // message_ts, meeting ID, etc.
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_decisions_meeting').on(table.meetingId),
  index('idx_decisions_decided_by').on(table.decidedBy),
]);

// ─── Relationships (Universal Junction Table) ─────────────
export const relationships = sqliteTable('relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceType: text('source_type').notNull(),      // 'person', 'company', 'deal', 'meeting', 'document', 'decision', 'task'
  sourceId: text('source_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  relationshipType: text('relationship_type').notNull(), // 'owner', 'attendee', 'produced', 'applies_to', 'mentioned_in', etc.
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_rel_source').on(table.sourceType, table.sourceId),
  index('idx_rel_target').on(table.targetType, table.targetId),
  index('idx_rel_type').on(table.relationshipType),
]);

// ─── Knowledge Entries (Embedded Content Chunks) ──────────
export const knowledgeEntries = sqliteTable('knowledge_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceType: text('source_type').notNull(),      // 'zoom_transcript', 'slack_message', 'document', 'voice', 'manual'
  sourceId: text('source_id'),                    // meeting ID, message_ts, doc ID, etc.
  content: text('content').notNull(),             // the text chunk
  embedding: blob('embedding'),                   // float32 vector as binary blob
  embeddingModel: text('embedding_model'),        // e.g. 'voyage-3' or 'text-embedding-3-small'
  metadata: text('metadata', { mode: 'json' }),   // { channel, speaker, topic, etc. }
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_ke_source').on(table.sourceType, table.sourceId),
]);
```

- [ ] **Step 2: Re-export graph schema from main schema**

In `bot/src/db/schema.ts`, add at the bottom:

```typescript
// Knowledge Graph tables
export {
  people, companies, deals, meetings, documents, decisions,
  relationships, knowledgeEntries
} from './schema-graph';
```

- [ ] **Step 3: Add auto-create SQL for new tables in index.ts**

In `bot/src/index.ts`, add raw SQL CREATE TABLE statements for each new table inside the existing auto-create block (after line 78). Follow the exact pattern used for existing tables — raw `db.run()` calls with `CREATE TABLE IF NOT EXISTS`.

Add CREATE TABLE statements for: `people`, `companies`, `deals`, `meetings`, `documents`, `decisions`, `relationships`, `knowledge_entries`.

Add CREATE INDEX statements for all indexes defined in the schema.

- [ ] **Step 4: Verify tables create on startup**

Run:
```bash
cd bot && npx tsx src/index.ts
```

Expected: App starts, tables created, no SQL errors. Ctrl+C to stop. Verify with:
```bash
npx tsx -e "const Database = require('better-sqlite3'); const db = new Database('./data/chiefofstaff.db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"
```

Expected: Output includes `people`, `companies`, `deals`, `meetings`, `documents`, `decisions`, `relationships`, `knowledge_entries` alongside existing tables.

- [ ] **Step 5: Commit**

```bash
git add bot/src/db/schema-graph.ts bot/src/db/schema.ts bot/src/index.ts
git commit -m "feat: add knowledge graph schema — people, companies, deals, meetings, documents, decisions, relationships, knowledge_entries"
```

---

## Task 3: Build Graph Service (Entity CRUD + Relationship Linking)

**Files:**
- Create: `bot/src/services/graph-service.ts`

- [ ] **Step 1: Create graph-service.ts with entity CRUD**

Create `bot/src/services/graph-service.ts`:

```typescript
import { db } from '../db/connection';
import { people, companies, deals, meetings, documents, decisions, relationships } from '../db/schema';
import { eq, and, or, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// ─── ID Generators ────────────────────────────────────────
export const generateId = {
  person: () => `ppl_${nanoid(8)}`,
  company: () => `cmp_${nanoid(8)}`,
  deal: () => `deal_${nanoid(8)}`,
  meeting: () => `mtg_${nanoid(8)}`,
  document: () => `doc_${nanoid(8)}`,
  decision: () => `dec_${nanoid(8)}`,
};

// ─── People ───────────────────────────────────────────────
export function createPerson(input: {
  name: string;
  email?: string;
  phone?: string;
  companyId?: string;
  role?: string;
  slackUserId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = generateId.person();
  db.insert(people).values({ id, ...input }).run();
  return id;
}

export function findPersonBySlackId(slackUserId: string) {
  return db.select().from(people).where(eq(people.slackUserId, slackUserId)).get();
}

export function findPersonByEmail(email: string) {
  return db.select().from(people).where(eq(people.email, email)).get();
}

export function findPersonByName(name: string) {
  return db.select().from(people).where(like(people.name, `%${name}%`)).all();
}

export function findOrCreatePerson(input: {
  name: string;
  slackUserId?: string;
  email?: string;
  source?: string;
}) {
  // Try Slack ID first, then email, then name exact match
  if (input.slackUserId) {
    const existing = findPersonBySlackId(input.slackUserId);
    if (existing) return existing.id;
  }
  if (input.email) {
    const existing = findPersonByEmail(input.email);
    if (existing) return existing.id;
  }
  const nameMatches = findPersonByName(input.name);
  if (nameMatches.length === 1) return nameMatches[0].id;

  return createPerson(input);
}

// ─── Companies ────────────────────────────────────────────
export function createCompany(input: {
  name: string;
  industry?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = generateId.company();
  db.insert(companies).values({ id, ...input }).run();
  return id;
}

export function findCompanyByName(name: string) {
  return db.select().from(companies).where(like(companies.name, `%${name}%`)).all();
}

export function findOrCreateCompany(name: string, source?: string) {
  const matches = findCompanyByName(name);
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) return matches[0].id; // best match = first
  const id = generateId.company();
  db.insert(companies).values({ id, name, source: source || 'auto' }).run();
  return id;
}

// ─── Deals ────────────────────────────────────────────────
export function createDeal(input: {
  name: string;
  companyId?: string;
  stage?: string;
  value?: number;
  ownerSlackId?: string;
}) {
  const id = generateId.deal();
  db.insert(deals).values({ id, ...input }).run();
  return id;
}

// ─── Meetings ─────────────────────────────────────────────
export function createMeeting(input: {
  title?: string;
  date?: number;
  duration?: number;
  source?: string;
  zoomMeetingId?: string;
  transcriptText?: string;
  summary?: string;
  meetingType?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = generateId.meeting();
  db.insert(meetings).values({ id, ...input }).run();
  return id;
}

export function findMeetingByZoomId(zoomMeetingId: string) {
  return db.select().from(meetings).where(eq(meetings.zoomMeetingId, zoomMeetingId)).get();
}

// ─── Documents ────────────────────────────────────────────
export function createDocument(input: {
  title: string;
  type: string;
  content: string;
  autoGenerated?: boolean;
  createdBy?: string;
}) {
  const id = generateId.document();
  db.insert(documents).values({ id, ...input }).run();
  return id;
}

// ─── Decisions ────────────────────────────────────────────
export function createDecision(input: {
  what: string;
  context?: string;
  decidedBy?: string;
  meetingId?: string;
  sourceType?: string;
  sourceRef?: string;
}) {
  const id = generateId.decision();
  db.insert(decisions).values({ id, ...input }).run();
  return id;
}

// ─── Relationships ────────────────────────────────────────
export function linkEntities(
  sourceType: string, sourceId: string,
  targetType: string, targetId: string,
  relationshipType: string,
  metadata?: Record<string, unknown>,
) {
  // Prevent duplicate links
  const existing = db.select().from(relationships).where(
    and(
      eq(relationships.sourceType, sourceType),
      eq(relationships.sourceId, sourceId),
      eq(relationships.targetType, targetType),
      eq(relationships.targetId, targetId),
      eq(relationships.relationshipType, relationshipType),
    )
  ).get();

  if (existing) return existing.id;

  const result = db.insert(relationships).values({
    sourceType, sourceId, targetType, targetId, relationshipType, metadata,
  }).run();
  return Number(result.lastInsertRowid);
}

export function getRelatedEntities(
  entityType: string,
  entityId: string,
  relType?: string,
) {
  const asSource = db.select().from(relationships).where(
    relType
      ? and(eq(relationships.sourceType, entityType), eq(relationships.sourceId, entityId), eq(relationships.relationshipType, relType))
      : and(eq(relationships.sourceType, entityType), eq(relationships.sourceId, entityId))
  ).all();

  const asTarget = db.select().from(relationships).where(
    relType
      ? and(eq(relationships.targetType, entityType), eq(relationships.targetId, entityId), eq(relationships.relationshipType, relType))
      : and(eq(relationships.targetType, entityType), eq(relationships.targetId, entityId))
  ).all();

  return { outgoing: asSource, incoming: asTarget };
}
```

- [ ] **Step 2: Verify graph service compiles**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/graph-service.ts
git commit -m "feat: add graph service — entity CRUD and relationship linking for knowledge graph"
```

---

## Task 4: Build Entity Extraction (Claude AI)

**Files:**
- Create: `bot/src/ai/entity-extractor.ts`
- Modify: `bot/src/ai/prompts.ts`

- [ ] **Step 1: Add entity extraction prompt**

In `bot/src/ai/prompts.ts`, add:

```typescript
export const ENTITY_EXTRACTION_PROMPT = `You are an entity extraction engine for a business intelligence system. Given text from a meeting transcript or Slack conversation, extract structured entities.

Return ONLY valid JSON with this structure:
{
  "people": [{ "name": "...", "role": "..." }],
  "companies": [{ "name": "...", "industry": "..." }],
  "decisions": [{ "what": "...", "decided_by": "...", "context": "..." }],
  "topics": ["topic1", "topic2"],
  "followups": [{ "who": "...", "what": "...", "deadline_text": "..." }]
}

Rules:
- Extract real people names mentioned (not pronouns)
- Extract company/business names mentioned
- Extract explicit decisions ("we decided", "let's go with", "the plan is")
- Extract key topics discussed
- Extract follow-ups/action items with owner if identifiable
- If a field has no data, use an empty array
- Do NOT invent entities not in the text`;
```

- [ ] **Step 2: Create entity-extractor.ts**

Create `bot/src/ai/entity-extractor.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ENTITY_EXTRACTION_PROMPT } from './prompts';

const anthropic = new Anthropic();

export interface ExtractedEntities {
  people: Array<{ name: string; role?: string }>;
  companies: Array<{ name: string; industry?: string }>;
  decisions: Array<{ what: string; decided_by?: string; context?: string }>;
  topics: string[];
  followups: Array<{ who?: string; what: string; deadline_text?: string }>;
}

export async function extractEntities(text: string): Promise<ExtractedEntities> {
  // Truncate very long text to avoid token limits
  const truncated = text.length > 15000 ? text.substring(0, 15000) + '\n[...truncated]' : text;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: ENTITY_EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: truncated }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return { people: [], companies: [], decisions: [], topics: [], followups: [] };
  }

  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { people: [], companies: [], decisions: [], topics: [], followups: [] };
    }
    return JSON.parse(jsonMatch[0]) as ExtractedEntities;
  } catch {
    console.error('[entity-extractor] Failed to parse response:', content.text.substring(0, 200));
    return { people: [], companies: [], decisions: [], topics: [], followups: [] };
  }
}
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add bot/src/ai/entity-extractor.ts bot/src/ai/prompts.ts
git commit -m "feat: add entity extraction — Claude extracts people, companies, decisions, topics from text"
```

---

## Task 5: Build Embedding Service

**Files:**
- Create: `bot/src/services/embedding-service.ts`
- Modify: `bot/package.json` (if adding openai for embeddings)

- [ ] **Step 1: Create embedding-service.ts**

We'll use OpenAI's `text-embedding-3-small` (already in desktop deps, cheap and fast). If the `openai` package isn't in bot deps yet, add it.

Create `bot/src/services/embedding-service.ts`:

```typescript
import OpenAI from 'openai';
import { db } from '../db/connection';
import { knowledgeEntries } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const openai = new OpenAI();
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200;

// ─── Chunking ─────────────────────────────────────────────
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  if (text.length <= CHUNK_SIZE) {
    chunks.push(text.trim());
    return chunks;
  }

  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + CHUNK_SIZE / 2) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.substring(start, end).trim());
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter(c => c.length > 50); // skip tiny fragments
}

// ─── Embedding Generation ─────────────────────────────────
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return new Float32Array(response.data[0].embedding);
}

// ─── Store Knowledge Entry ────────────────────────────────
export async function storeKnowledgeEntry(input: {
  sourceType: string;
  sourceId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const embedding = await generateEmbedding(input.content);
  const embeddingBuffer = Buffer.from(embedding.buffer);

  db.insert(knowledgeEntries).values({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    content: input.content,
    embedding: embeddingBuffer,
    embeddingModel: EMBEDDING_MODEL,
    metadata: input.metadata,
  }).run();
}

// ─── Ingest Full Text (Chunk + Embed + Store) ─────────────
export async function ingestText(input: {
  sourceType: string;
  sourceId?: string;
  text: string;
  metadata?: Record<string, unknown>;
}) {
  const chunks = chunkText(input.text);
  for (const chunk of chunks) {
    await storeKnowledgeEntry({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      content: chunk,
      metadata: { ...input.metadata, chunkIndex: chunks.indexOf(chunk) },
    });
  }
  return chunks.length;
}

// ─── Semantic Search ──────────────────────────────────────
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function semanticSearch(query: string, limit = 10): Promise<Array<{
  id: number;
  content: string;
  sourceType: string;
  sourceId: string | null;
  similarity: number;
  metadata: unknown;
}>> {
  const queryEmbedding = await generateEmbedding(query);

  // Load all entries (for small-medium datasets this is fine;
  // migrate to sqlite-vec or Postgres pgvector for scale)
  const allEntries = db.select().from(knowledgeEntries).all();

  const scored = allEntries
    .filter(e => e.embedding) // skip entries without embeddings
    .map(entry => {
      const entryEmbedding = new Float32Array(
        (entry.embedding as Buffer).buffer,
        (entry.embedding as Buffer).byteOffset,
        (entry.embedding as Buffer).byteLength / 4,
      );
      return {
        id: entry.id,
        content: entry.content,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        metadata: entry.metadata,
        similarity: cosineSimilarity(queryEmbedding, entryEmbedding),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored;
}
```

- [ ] **Step 2: Add openai to bot dependencies**

Run:
```bash
cd bot && npm install openai
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add bot/src/services/embedding-service.ts bot/package.json bot/package-lock.json
git commit -m "feat: add embedding service — chunk text, generate embeddings, semantic search with cosine similarity"
```

---

## Task 6: Build Ingestion Service (Orchestrator)

**Files:**
- Create: `bot/src/services/ingestion-service.ts`

- [ ] **Step 1: Create ingestion-service.ts**

This orchestrates the full pipeline: raw content → extract entities → create graph nodes → embed → link.

Create `bot/src/services/ingestion-service.ts`:

```typescript
import { extractEntities } from '../ai/entity-extractor';
import { ingestText } from './embedding-service';
import {
  findOrCreatePerson,
  findOrCreateCompany,
  createDecision,
  createDocument,
  createMeeting,
  findMeetingByZoomId,
  linkEntities,
} from './graph-service';

// ─── Ingest Zoom Transcript ──────────────────────────────
export async function ingestZoomTranscript(input: {
  transcriptText: string;
  zoomMeetingId: string;
  title?: string;
  date?: number;
  duration?: number;
  meetingType?: string;
  participants?: Array<{ name: string; slackUserId?: string }>;
}) {
  console.log(`[ingestion] Processing Zoom transcript: ${input.title || input.zoomMeetingId}`);

  // 1. Create or find meeting entity
  let meetingId: string;
  const existing = findMeetingByZoomId(input.zoomMeetingId);
  if (existing) {
    meetingId = existing.id;
    console.log(`[ingestion] Meeting already exists: ${meetingId}`);
  } else {
    meetingId = createMeeting({
      title: input.title,
      date: input.date,
      duration: input.duration,
      source: 'zoom',
      zoomMeetingId: input.zoomMeetingId,
      transcriptText: input.transcriptText,
      meetingType: input.meetingType,
      metadata: { participants: input.participants },
    });
    console.log(`[ingestion] Created meeting: ${meetingId}`);
  }

  // 2. Create/link participant people
  if (input.participants) {
    for (const p of input.participants) {
      const personId = findOrCreatePerson({
        name: p.name,
        slackUserId: p.slackUserId,
        source: 'zoom',
      });
      linkEntities('person', personId, 'meeting', meetingId, 'attendee');
    }
  }

  // 3. Extract entities from transcript
  const entities = await extractEntities(input.transcriptText);

  // 4. Create people entities from extraction
  for (const p of entities.people) {
    const personId = findOrCreatePerson({ name: p.name, source: 'zoom' });
    linkEntities('person', personId, 'meeting', meetingId, 'mentioned_in');
  }

  // 5. Create company entities
  for (const c of entities.companies) {
    const companyId = findOrCreateCompany(c.name, 'zoom');
    linkEntities('company', companyId, 'meeting', meetingId, 'discussed_in');
  }

  // 6. Create decisions
  for (const d of entities.decisions) {
    const decisionId = createDecision({
      what: d.what,
      decidedBy: d.decided_by,
      context: d.context,
      meetingId,
      sourceType: 'meeting',
      sourceRef: input.zoomMeetingId,
    });
    linkEntities('meeting', meetingId, 'decision', decisionId, 'produced');
  }

  // 7. Embed transcript chunks
  const chunkCount = await ingestText({
    sourceType: 'zoom_transcript',
    sourceId: meetingId,
    text: input.transcriptText,
    metadata: {
      title: input.title,
      meetingType: input.meetingType,
      topics: entities.topics,
    },
  });

  console.log(`[ingestion] Zoom transcript complete: ${entities.people.length} people, ${entities.companies.length} companies, ${entities.decisions.length} decisions, ${chunkCount} chunks embedded`);

  return { meetingId, entities, chunkCount };
}

// ─── Ingest Slack Message ─────────────────────────────────
export async function ingestSlackMessage(input: {
  text: string;
  userId: string;
  userName?: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}) {
  // Skip short messages (< 50 chars) — not worth ingesting
  if (input.text.length < 50) return null;

  // 1. Ensure person exists
  const personId = findOrCreatePerson({
    name: input.userName || input.userId,
    slackUserId: input.userId,
    source: 'slack',
  });

  // 2. Extract entities (only for substantial messages)
  let entities = null;
  if (input.text.length >= 100) {
    entities = await extractEntities(input.text);

    // Link any companies mentioned
    for (const c of entities.companies) {
      const companyId = findOrCreateCompany(c.name, 'slack');
      linkEntities('person', personId, 'company', companyId, 'mentioned');
    }

    // Create decisions and link to person
    for (const d of entities.decisions) {
      const decisionId = createDecision({
        what: d.what,
        decidedBy: input.userId,
        sourceType: 'slack',
        sourceRef: input.messageTs,
      });
      linkEntities('person', personId, 'decision', decisionId, 'made');
    }
  }

  // 3. Embed the message
  await ingestText({
    sourceType: 'slack_message',
    sourceId: input.messageTs,
    text: input.text,
    metadata: {
      userId: input.userId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      topics: entities?.topics,
    },
  });

  return { personId, entities };
}

// ─── Ingest Uploaded Document ─────────────────────────────
export async function ingestDocument(input: {
  title: string;
  content: string;
  type: string;
  uploadedBy?: string;
}) {
  const docId = createDocument({
    title: input.title,
    type: input.type,
    content: input.content,
    createdBy: input.uploadedBy,
  });

  // Extract entities from document
  const entities = await extractEntities(input.content);

  // Link companies
  for (const c of entities.companies) {
    const companyId = findOrCreateCompany(c.name, 'upload');
    linkEntities('document', docId, 'company', companyId, 'applies_to');
  }

  // Embed document
  const chunkCount = await ingestText({
    sourceType: 'document',
    sourceId: docId,
    text: input.content,
    metadata: { title: input.title, type: input.type, topics: entities.topics },
  });

  console.log(`[ingestion] Document ingested: "${input.title}" — ${chunkCount} chunks`);
  return { docId, entities, chunkCount };
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/ingestion-service.ts
git commit -m "feat: add ingestion service — orchestrates entity extraction, graph linking, and embedding for Zoom, Slack, and documents"
```

---

## Task 7: Wire Ingestion into Zoom Handler

**Files:**
- Modify: `bot/src/zoom/webhook-handler.ts`

- [ ] **Step 1: Add ingestion call after transcript processing**

In `bot/src/zoom/webhook-handler.ts`, after the existing `processTranscript()` call (which extracts action items and creates tasks), add a call to the ingestion pipeline.

At the top, add import:
```typescript
import { ingestZoomTranscript } from '../services/ingestion-service';
```

After the transcript is processed and tasks are created (around line 596, after the `processTranscript` results are handled), add:

```typescript
// ─── Knowledge Graph Ingestion ────────────────────────────
try {
  await ingestZoomTranscript({
    transcriptText,
    zoomMeetingId: meetingUUID,
    title: meetingTopic,
    date: Math.floor(new Date(meetingStartTime).getTime() / 1000),
    duration: meetingDuration,
    meetingType: classification.type,
    participants: Object.entries(participantMapping).map(([name, slackId]) => ({
      name,
      slackUserId: slackId || undefined,
    })),
  });
} catch (err) {
  console.error('[zoom] Knowledge graph ingestion failed (non-fatal):', err);
}
```

This is a non-fatal add-on — if ingestion fails, the existing task creation still works.

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/zoom/webhook-handler.ts
git commit -m "feat: wire Zoom transcript ingestion into knowledge graph — extracts entities, embeds chunks after each meeting"
```

---

## Task 8: Wire Ingestion into Slack Message Handler

**Files:**
- Modify: `bot/src/slack/messages.ts`

- [ ] **Step 1: Add knowledge ingestion to processBatch**

In `bot/src/slack/messages.ts`, add import at top:
```typescript
import { ingestSlackMessage } from '../services/ingestion-service';
```

In the `processBatch` function (around line 540), after the commitment extraction and handling is complete, add knowledge ingestion for each message in the batch:

```typescript
// ─── Knowledge Graph Ingestion (non-blocking) ─────────────
for (const msg of batch) {
  ingestSlackMessage({
    text: msg.text,
    userId: msg.user,
    userName: msg.userName,
    channelId,
    messageTs: msg.ts,
    threadTs: msg.threadTs,
  }).catch(err => {
    console.error('[slack] Knowledge ingestion failed for message (non-fatal):', err);
  });
}
```

Note: This runs fire-and-forget (non-blocking) so it doesn't slow down commitment extraction. Errors are logged but don't affect core functionality.

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/slack/messages.ts
git commit -m "feat: wire Slack message ingestion into knowledge graph — extracts entities and embeds messages after commitment extraction"
```

---

## Task 9: Add Document Upload via Slack Command

**Files:**
- Modify: `bot/src/slack/commands.ts`

- [ ] **Step 1: Add /upload command**

In `bot/src/slack/commands.ts`, add the `/upload` command handler:

```typescript
import { ingestDocument } from '../services/ingestion-service';
```

Add the command handler (follow existing pattern from `/tasks`, `/complete`, etc.):

```typescript
app.command('/upload', async ({ command, ack, client }) => {
  await ack();

  // Expect: /upload <title> | <type> | <content>
  // Or: /upload with file attachment
  const text = command.text.trim();

  if (!text) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: 'Usage: `/upload Title | type | Content...`\nTypes: sop, playbook, pricing_guide, process_doc, customer_info, general',
    });
    return;
  }

  const parts = text.split('|').map(p => p.trim());
  if (parts.length < 3) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: 'Please use format: `/upload Title | type | Content...`',
    });
    return;
  }

  const [title, type, ...contentParts] = parts;
  const content = contentParts.join('|'); // rejoin in case content had pipes
  const validTypes = ['sop', 'playbook', 'pricing_guide', 'process_doc', 'customer_info', 'general'];

  if (!validTypes.includes(type)) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Invalid type "${type}". Valid types: ${validTypes.join(', ')}`,
    });
    return;
  }

  try {
    const result = await ingestDocument({
      title,
      content,
      type,
      uploadedBy: command.user_id,
    });

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Document "${title}" ingested into knowledge base. ${result.chunkCount} chunks embedded. ${result.entities.people.length} people, ${result.entities.companies.length} companies detected.`,
    });
  } catch (err) {
    console.error('[upload] Document ingestion failed:', err);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: 'Failed to ingest document. Please try again.',
    });
  }
});
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/slack/commands.ts
git commit -m "feat: add /upload Slack command — ingest documents into knowledge graph via Slack"
```

---

## Task 10: Wire Voice Interactions into Knowledge Graph

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `bot/src/services/ingestion-service.ts`

The desktop app shares the same SQLite database as the bot. Voice interactions (transcripts + AI responses) should be logged as knowledge entries so they become searchable context.

- [ ] **Step 1: Add voice ingestion function to ingestion-service.ts**

In `bot/src/services/ingestion-service.ts`, add:

```typescript
// ─── Ingest Voice Interaction ─────────────────────────────
export async function ingestVoiceInteraction(input: {
  transcript: string;
  response: string;
  intent: string;
  userId?: string;
}) {
  const combined = `Voice command: ${input.transcript}\nResponse: ${input.response}`;

  await ingestText({
    sourceType: 'voice',
    sourceId: `voice_${Date.now()}`,
    text: combined,
    metadata: {
      transcript: input.transcript,
      intent: input.intent,
      userId: input.userId,
      timestamp: Date.now(),
    },
  });
}
```

- [ ] **Step 2: Wire into desktop IPC handler**

In `desktop/src/main/ipc-handlers.ts`, after each successful voice command processing (TASK_QUERY, MEETING_PREP, GENERAL intents), add a fire-and-forget call to log the interaction.

Since the desktop app shares the SQLite DB with the bot, it can import the ingestion service directly. Add at the top:

```typescript
import { ingestVoiceInteraction } from '../../bot/src/services/ingestion-service';
```

Note: If the import path doesn't resolve cleanly across the monorepo, alternatively use the shared DB connection directly to insert a knowledge_entry row via raw SQL. The key is: every voice transcript + response gets stored as a searchable knowledge entry.

After each successful voice response (in the GENERAL, TASK_QUERY, and MEETING_PREP handlers), add:

```typescript
ingestVoiceInteraction({
  transcript,
  response: aiResponse,
  intent: classification.intent,
  userId: process.env.SLACK_USER_ID,
}).catch(err => console.error('[voice] Knowledge ingestion failed (non-fatal):', err));
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
cd desktop && npm run build
```

Expected: Both compile without errors.

- [ ] **Step 4: Commit**

```bash
git add bot/src/services/ingestion-service.ts desktop/src/main/ipc-handlers.ts
git commit -m "feat: wire voice interactions into knowledge graph — transcripts and responses become searchable context"
```

---

## Task 11: Integration Test — End-to-End Verification

- [ ] **Step 1: Verify desktop app builds without Computer Use**

```bash
cd desktop && npm run build
```

Expected: Clean build, no errors referencing computer-use files.

- [ ] **Step 2: Verify bot builds and starts**

```bash
cd bot && npm run build && npx tsx src/index.ts
```

Expected: App starts, all tables created (including new graph tables), no errors. Ctrl+C after confirming startup.

- [ ] **Step 3: Verify database has all tables**

```bash
cd bot && npx tsx -e "
const Database = require('better-sqlite3');
const db = new Database('./data/chiefofstaff.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
console.log('Tables:', tables.map(t => t.name));
"
```

Expected: Output includes all existing tables PLUS: `people`, `companies`, `deals`, `meetings`, `documents`, `decisions`, `relationships`, `knowledge_entries`.

- [ ] **Step 4: Smoke test ingestion with a dummy document**

```bash
cd bot && npx tsx -e "
const { ingestDocument } = require('./dist/services/ingestion-service');
ingestDocument({
  title: 'Test SOP',
  content: 'When a new client signs up for lawn maintenance, first schedule the initial site visit within 3 business days. During the visit, measure the property and note any special requirements like irrigation zones or landscaping features. Then create a service proposal with pricing based on property size.',
  type: 'sop',
  uploadedBy: 'test',
}).then(r => console.log('Result:', r)).catch(e => console.error('Error:', e));
"
```

Expected: Output shows `docId`, `entities` (should detect topics like "lawn maintenance", "site visit"), `chunkCount` (likely 1 for this short text).

- [ ] **Step 5: Verify semantic search works**

```bash
cd bot && npx tsx -e "
const { semanticSearch } = require('./dist/services/embedding-service');
semanticSearch('How do we handle new client onboarding?', 5)
  .then(results => results.forEach(r => console.log(r.similarity.toFixed(3), r.content.substring(0, 80))))
  .catch(e => console.error('Error:', e));
"
```

Expected: Returns the test SOP chunk with a high similarity score (> 0.7).

- [ ] **Step 6: Final commit with all integration fixes**

If any fixes were needed during integration testing:
```bash
git add -A
git commit -m "fix: integration test fixes for Phase 1 knowledge graph"
```

---

## Verification Summary

| What | How to Test | Expected |
|------|-------------|----------|
| Computer Use removed | `cd desktop && npm run build` | Clean build, no CU references |
| Graph tables created | Start bot, check SQLite tables | All 8 new tables exist |
| Entity extraction | Ingest a document via `/upload` | People, companies, topics extracted |
| Embedding + search | Run semantic search query | Relevant chunks returned with similarity > 0.7 |
| Zoom ingestion | Process a real Zoom transcript | Meeting entity created, people linked, chunks embedded |
| Slack ingestion | Send messages in monitored channel | Messages chunked and embedded, entities extracted |
| Voice ingestion | Use voice command on desktop | Transcript + response stored as knowledge entry |

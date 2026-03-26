# Phase 2: Self-Learning Engine + SOP Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-learning system that detects recurring patterns across conversations and auto-suggests SOPs, while also allowing manual SOP generation on demand. The system improves over time through user feedback and correction loops.

**Architecture:** Add a topic tracker that counts how often topics appear across knowledge entries. When a topic crosses a threshold (default 5), Claude synthesizes all related content into an SOP draft. Users can also manually trigger SOP creation for any topic via `/sop <topic>`. SOPs are living documents — new conversations touching the topic trigger update proposals. A Q&A feedback loop stores corrections as high-weight knowledge entries.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Claude Sonnet (SOP synthesis + topic detection), existing embedding/graph services from Phase 1.

---

## File Structure

### New Files
- `bot/src/services/topic-tracker.ts` — Detects and counts topic frequency across knowledge entries, identifies SOP candidates
- `bot/src/services/sop-service.ts` — SOP generation (auto + manual), versioning, update proposals, publishing
- `bot/src/ai/sop-generator.ts` — Claude prompts and calls for synthesizing SOPs from related knowledge entries
- `bot/src/services/feedback-service.ts` — Stores Q&A interactions, corrections, confidence scoring, knowledge gap detection

### Modified Files
- `bot/src/db/schema-graph.ts` — Add `topic_counts` and `qa_interactions` tables
- `bot/src/db/schema.ts` — Re-export new tables
- `bot/src/index.ts` — Add CREATE TABLE SQL for new tables, register SOP cron job
- `bot/src/ai/prompts.ts` — Add SOP generation + topic detection prompts
- `bot/src/slack/commands.ts` — Add `/sop`, `/ask` commands
- `bot/src/slack/interactions.ts` — Add SOP approval/dismiss button handlers
- `bot/src/services/ingestion-service.ts` — After ingestion, update topic counts + check SOP triggers
- `bot/src/scheduler/cron-jobs.ts` — Add weekly SOP review cron

---

## Task 1: Add Topic Tracking and Q&A Schema

**Files:**
- Modify: `bot/src/db/schema-graph.ts`
- Modify: `bot/src/db/schema.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Add topic_counts table to schema-graph.ts**

At the end of `bot/src/db/schema-graph.ts`, add:

```typescript
// ─── Topic Counts (Pattern Detection) ─────────────────────
export const topicCounts = sqliteTable('topic_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topic: text('topic').notNull(),
  normalizedTopic: text('normalized_topic').notNull(),  // lowercase, trimmed
  occurrences: integer('occurrences').notNull().default(1),
  sourceTypes: text('source_types', { mode: 'json' }),  // ['zoom_transcript', 'slack_message', ...]
  sourceIds: text('source_ids', { mode: 'json' }),      // array of source IDs where topic appeared
  lastSeenAt: integer('last_seen_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
  sopGenerated: integer('sop_generated', { mode: 'boolean' }).default(false),
  sopId: text('sop_id'),                                // FK to documents.id if SOP was generated
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_topic_counts_normalized').on(table.normalizedTopic),
  index('idx_topic_counts_occurrences').on(table.occurrences),
]);

// ─── Q&A Interactions (Self-Learning Feedback Loop) ───────
export const qaInteractions = sqliteTable('qa_interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  wasCorrect: integer('was_correct', { mode: 'boolean' }),  // null = no feedback, true/false from user
  correction: text('correction'),                            // if wasCorrect=false, what should it have been
  confidence: text('confidence'),                            // 'high', 'medium', 'low'
  sourceEntryIds: text('source_entry_ids', { mode: 'json' }), // knowledge_entry IDs used to answer
  askedBy: text('asked_by'),                                 // slack user ID
  askedVia: text('asked_via'),                               // 'slack', 'voice', 'web'
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_qa_asked_by').on(table.askedBy),
  index('idx_qa_was_correct').on(table.wasCorrect),
]);
```

- [ ] **Step 2: Re-export from schema.ts**

In `bot/src/db/schema.ts`, update the re-export line to include the new tables:

```typescript
export {
  people, companies, deals, meetings, documents, decisions,
  relationships, knowledgeEntries, topicCounts, qaInteractions
} from './schema-graph';
```

- [ ] **Step 3: Add CREATE TABLE SQL in index.ts**

In `bot/src/index.ts`, add after the existing CREATE TABLE statements:

```sql
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
```

- [ ] **Step 4: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add bot/src/db/schema-graph.ts bot/src/db/schema.ts bot/src/index.ts
git commit -m "feat: add topic_counts and qa_interactions tables for self-learning engine"
```

---

## Task 2: Build Topic Tracker Service

**Files:**
- Create: `bot/src/services/topic-tracker.ts`

- [ ] **Step 1: Create topic-tracker.ts**

```typescript
import { db } from '../db/connection';
import { topicCounts } from '../db/schema';
import { eq } from 'drizzle-orm';

const SOP_SUGGESTION_THRESHOLD = 5;

function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Record topic occurrences from an entity extraction result.
 * Called after each ingestion (Zoom, Slack, document).
 */
export function recordTopics(
  topics: string[],
  sourceType: string,
  sourceId: string,
): string[] {
  const sopCandidates: string[] = [];

  for (const topic of topics) {
    const normalized = normalizeTopic(topic);
    if (normalized.length < 3) continue; // skip trivial topics

    const existing = db.select().from(topicCounts)
      .where(eq(topicCounts.normalizedTopic, normalized))
      .get();

    if (existing) {
      // Update occurrence count and sources
      const sources: string[] = (existing.sourceIds as string[]) || [];
      if (!sources.includes(sourceId)) {
        sources.push(sourceId);
      }
      const types: string[] = (existing.sourceTypes as string[]) || [];
      if (!types.includes(sourceType)) {
        types.push(sourceType);
      }

      const newCount = existing.occurrences + 1;
      db.update(topicCounts)
        .set({
          occurrences: newCount,
          sourceTypes: types,
          sourceIds: sources,
          lastSeenAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(topicCounts.id, existing.id))
        .run();

      // Check if this topic just crossed the SOP threshold
      if (newCount >= SOP_SUGGESTION_THRESHOLD && !existing.sopGenerated) {
        sopCandidates.push(topic);
      }
    } else {
      // New topic
      db.insert(topicCounts).values({
        topic,
        normalizedTopic: normalized,
        occurrences: 1,
        sourceTypes: [sourceType],
        sourceIds: [sourceId],
      }).run();
    }
  }

  return sopCandidates;
}

/**
 * Get all topics that have crossed the SOP threshold but no SOP generated yet.
 */
export function getSOPCandidates(): Array<{
  id: number;
  topic: string;
  occurrences: number;
  sourceIds: string[];
}> {
  const candidates = db.select().from(topicCounts)
    .where(eq(topicCounts.sopGenerated, false))
    .all()
    .filter(t => t.occurrences >= SOP_SUGGESTION_THRESHOLD);

  return candidates.map(c => ({
    id: c.id,
    topic: c.topic,
    occurrences: c.occurrences,
    sourceIds: (c.sourceIds as string[]) || [],
  }));
}

/**
 * Mark a topic as having an SOP generated.
 */
export function markSOPGenerated(topicId: number, sopDocId: string) {
  db.update(topicCounts)
    .set({ sopGenerated: true, sopId: sopDocId })
    .where(eq(topicCounts.id, topicId))
    .run();
}

/**
 * Get all topics sorted by occurrence count (for reporting).
 */
export function getTopTopics(limit = 20) {
  return db.select().from(topicCounts)
    .orderBy(topicCounts.occurrences)
    .limit(limit)
    .all()
    .reverse(); // DESC order
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/topic-tracker.ts
git commit -m "feat: add topic tracker — counts topic frequency across ingested content, identifies SOP candidates"
```

---

## Task 3: Build SOP Generator (Claude AI)

**Files:**
- Create: `bot/src/ai/sop-generator.ts`
- Modify: `bot/src/ai/prompts.ts`

- [ ] **Step 1: Add SOP prompts to prompts.ts**

Add at the end of `bot/src/ai/prompts.ts`:

```typescript
export const SOP_GENERATION_PROMPT = `You are an SOP generator for a business. Given multiple excerpts from meetings, Slack conversations, and documents about a specific topic, synthesize a clear, actionable Standard Operating Procedure.

Analyze the content and choose the most appropriate format:
1. CHECKLIST — for sequential procedural tasks (numbered steps)
2. DECISION_TREE — for conditional logic / "if this then that" scenarios (use clear if/then structure)
3. WIKI — for reference material that evolves over time (organized by subtopics)

Return ONLY valid JSON:
{
  "format": "CHECKLIST" | "DECISION_TREE" | "WIKI",
  "title": "SOP: <descriptive title>",
  "content": "<full SOP content in markdown>",
  "summary": "<2-3 sentence summary of what this SOP covers>",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Base the SOP entirely on what's in the provided excerpts
- Use specific details, names, and numbers from the actual content
- If the excerpts show conflicting approaches, note the conflict and recommend the most common approach
- Format content as clean markdown (headers, lists, bold for emphasis)
- Do NOT invent steps or procedures not supported by the excerpts`;

export const SOP_UPDATE_PROMPT = `You are reviewing whether new information should update an existing SOP. Given the current SOP content and new excerpts, determine if an update is needed.

Return ONLY valid JSON:
{
  "needs_update": true | false,
  "reason": "<why update is or isn't needed>",
  "updated_content": "<full updated SOP in markdown, or null if no update needed>",
  "changes_summary": "<bullet list of what changed, or null>"
}

Rules:
- Only suggest updates for substantive changes (new steps, corrected information, new exceptions)
- Do NOT suggest updates for minor wording differences
- Preserve the existing structure and format unless it needs to change
- If updating, return the COMPLETE updated content (not just the diff)`;
```

- [ ] **Step 2: Create sop-generator.ts**

Create `bot/src/ai/sop-generator.ts`:

```typescript
import { anthropic } from './client';
import { SOP_GENERATION_PROMPT, SOP_UPDATE_PROMPT } from './prompts';

export interface GeneratedSOP {
  format: 'CHECKLIST' | 'DECISION_TREE' | 'WIKI';
  title: string;
  content: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SOPUpdateResult {
  needs_update: boolean;
  reason: string;
  updated_content: string | null;
  changes_summary: string | null;
}

/**
 * Generate an SOP from a collection of related content excerpts.
 */
export async function generateSOP(
  topic: string,
  excerpts: string[],
): Promise<GeneratedSOP | null> {
  const input = `Topic: ${topic}\n\nRelated excerpts:\n\n${excerpts.map((e, i) => `--- Excerpt ${i + 1} ---\n${e}`).join('\n\n')}`;

  // Truncate if too long
  const truncated = input.length > 20000 ? input.substring(0, 20000) + '\n[...truncated]' : input;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SOP_GENERATION_PROMPT,
      messages: [{ role: 'user', content: truncated }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/) || content.text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[1] || jsonMatch[0]) as GeneratedSOP;
  } catch (err) {
    console.error('[sop-generator] Failed to generate SOP:', err);
    return null;
  }
}

/**
 * Check if an existing SOP needs updating based on new content.
 */
export async function checkSOPUpdate(
  currentContent: string,
  newExcerpts: string[],
): Promise<SOPUpdateResult | null> {
  const input = `Current SOP:\n${currentContent}\n\nNew information:\n\n${newExcerpts.map((e, i) => `--- New Excerpt ${i + 1} ---\n${e}`).join('\n\n')}`;

  const truncated = input.length > 20000 ? input.substring(0, 20000) + '\n[...truncated]' : input;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SOP_UPDATE_PROMPT,
      messages: [{ role: 'user', content: truncated }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/) || content.text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[1] || jsonMatch[0]) as SOPUpdateResult;
  } catch (err) {
    console.error('[sop-generator] Failed to check SOP update:', err);
    return null;
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add bot/src/ai/sop-generator.ts bot/src/ai/prompts.ts
git commit -m "feat: add SOP generator — Claude synthesizes SOPs from related knowledge excerpts"
```

---

## Task 4: Build SOP Service (Orchestrator)

**Files:**
- Create: `bot/src/services/sop-service.ts`

- [ ] **Step 1: Create sop-service.ts**

```typescript
import { db } from '../db/connection';
import { documents } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { semanticSearch } from './embedding-service';
import { generateSOP, checkSOPUpdate } from '../ai/sop-generator';
import { createDocument, linkEntities } from './graph-service';
import { markSOPGenerated } from './topic-tracker';
import { ingestText } from './embedding-service';

/**
 * Generate an SOP for a topic by pulling related knowledge and synthesizing with Claude.
 * Used for both auto-suggestions (from topic tracker) and manual /sop commands.
 */
export async function createSOPForTopic(
  topic: string,
  options?: { topicCountId?: number; requestedBy?: string },
): Promise<{ docId: string; title: string; format: string; summary: string } | null> {
  console.log(`[sop] Generating SOP for topic: "${topic}"`);

  // 1. Pull related knowledge entries via semantic search
  const results = await semanticSearch(topic, 20);
  if (results.length === 0) {
    console.log(`[sop] No related knowledge found for topic: "${topic}"`);
    return null;
  }

  const excerpts = results
    .filter(r => r.similarity > 0.3) // only reasonably related content
    .map(r => r.content);

  if (excerpts.length < 2) {
    console.log(`[sop] Not enough related content for SOP (found ${excerpts.length})`);
    return null;
  }

  // 2. Generate SOP with Claude
  const generated = await generateSOP(topic, excerpts);
  if (!generated) {
    console.error(`[sop] Claude failed to generate SOP for: "${topic}"`);
    return null;
  }

  // 3. Store as document
  const doc = createDocument({
    title: generated.title,
    type: 'sop',
    content: generated.content,
    autoGenerated: true,
    status: 'draft',
    createdBy: options?.requestedBy || 'system',
    metadata: {
      format: generated.format,
      summary: generated.summary,
      confidence: generated.confidence,
      topic,
      sourceCount: excerpts.length,
      generatedAt: Date.now(),
    },
  });
  const docId = doc.id;

  // 4. Embed the SOP content for future search
  await ingestText({
    sourceType: 'document',
    sourceId: docId,
    text: generated.content,
    metadata: { title: generated.title, type: 'sop', topic },
  });

  // 5. If triggered by topic tracker, mark as generated
  if (options?.topicCountId) {
    markSOPGenerated(options.topicCountId, docId);
  }

  console.log(`[sop] SOP created: "${generated.title}" (${generated.format}, ${generated.confidence} confidence)`);

  return {
    docId,
    title: generated.title,
    format: generated.format,
    summary: generated.summary,
  };
}

/**
 * Check if an existing SOP needs updating based on new content related to its topic.
 */
export async function reviewSOPForUpdates(
  docId: string,
): Promise<{ needsUpdate: boolean; changesSummary: string | null; updatedDocId?: string } | null> {
  // 1. Get the current SOP
  const doc = db.select().from(documents).where(eq(documents.id, docId)).get();
  if (!doc) return null;

  const topic = (doc.metadata as any)?.topic;
  if (!topic) return null;

  // 2. Get recent knowledge entries related to this topic
  const results = await semanticSearch(topic, 10);
  const recentExcerpts = results
    .filter(r => r.similarity > 0.4)
    .map(r => r.content);

  if (recentExcerpts.length === 0) return { needsUpdate: false, changesSummary: null };

  // 3. Ask Claude if update is needed
  const updateResult = await checkSOPUpdate(doc.content, recentExcerpts);
  if (!updateResult) return null;

  if (!updateResult.needs_update) {
    return { needsUpdate: false, changesSummary: null };
  }

  // 4. Create new version of the document
  const newVersion = (doc.version || 1) + 1;
  const newDoc = createDocument({
    title: doc.title,
    type: 'sop',
    content: updateResult.updated_content || doc.content,
    autoGenerated: true,
    status: 'draft',
    createdBy: 'system',
    metadata: {
      ...(doc.metadata as any),
      previousVersion: docId,
      version: newVersion,
      updateReason: updateResult.reason,
      changesSummary: updateResult.changes_summary,
      updatedAt: Date.now(),
    },
  });
  const newDocId = newDoc.id;

  // Link old → new version
  linkEntities('document', docId, 'document', newDocId, 'superseded_by');

  // Embed updated content
  await ingestText({
    sourceType: 'document',
    sourceId: newDocId,
    text: updateResult.updated_content || doc.content,
    metadata: { title: doc.title, type: 'sop', topic },
  });

  console.log(`[sop] SOP update proposed: "${doc.title}" v${newVersion} — ${updateResult.changes_summary}`);

  return {
    needsUpdate: true,
    changesSummary: updateResult.changes_summary,
    updatedDocId: newDocId,
  };
}

/**
 * Get all SOPs, optionally filtered by status.
 */
export function getSOPs(status?: string) {
  if (status) {
    return db.select().from(documents)
      .where(and(eq(documents.type, 'sop'), eq(documents.status, status)))
      .all();
  }
  return db.select().from(documents)
    .where(eq(documents.type, 'sop'))
    .all();
}

/**
 * Publish a draft SOP (change status from draft to active).
 */
export function publishSOP(docId: string) {
  db.update(documents)
    .set({ status: 'active', updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(documents.id, docId))
    .run();
}

/**
 * Archive an SOP.
 */
export function archiveSOP(docId: string) {
  db.update(documents)
    .set({ status: 'archived', updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(documents.id, docId))
    .run();
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/sop-service.ts
git commit -m "feat: add SOP service — generates, versions, and manages SOPs from knowledge graph"
```

---

## Task 5: Build Feedback Service (Self-Learning Loop)

**Files:**
- Create: `bot/src/services/feedback-service.ts`

- [ ] **Step 1: Create feedback-service.ts**

```typescript
import { db } from '../db/connection';
import { qaInteractions, knowledgeEntries } from '../db/schema';
import { eq } from 'drizzle-orm';
import { storeKnowledgeEntry } from './embedding-service';

/**
 * Record a Q&A interaction for learning.
 */
export function recordQA(input: {
  question: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sourceEntryIds: number[];
  askedBy?: string;
  askedVia?: string;
}): number {
  const result = db.insert(qaInteractions).values({
    question: input.question,
    answer: input.answer,
    confidence: input.confidence,
    sourceEntryIds: input.sourceEntryIds,
    askedBy: input.askedBy,
    askedVia: input.askedVia,
  }).run();

  return Number(result.lastInsertRowid);
}

/**
 * Record user correction — this becomes a high-weight knowledge entry.
 */
export async function recordCorrection(
  qaId: number,
  correction: string,
) {
  // 1. Mark the QA as incorrect
  db.update(qaInteractions)
    .set({ wasCorrect: false, correction })
    .where(eq(qaInteractions.id, qaId))
    .run();

  // 2. Get the original QA
  const qa = db.select().from(qaInteractions)
    .where(eq(qaInteractions.id, qaId))
    .get();

  if (!qa) return;

  // 3. Store correction as high-weight knowledge entry
  const correctionText = `CORRECTION: When asked "${qa.question}", the correct answer is: ${correction}. (Previous incorrect answer was: ${qa.answer})`;

  await storeKnowledgeEntry({
    sourceType: 'correction',
    sourceId: `qa_${qaId}`,
    content: correctionText,
    metadata: {
      originalQuestion: qa.question,
      originalAnswer: qa.answer,
      correction,
      weight: 'high',
      correctedBy: qa.askedBy,
    },
  });

  console.log(`[feedback] Correction recorded for QA #${qaId} — stored as high-weight knowledge entry`);
}

/**
 * Mark a QA interaction as correct (positive reinforcement).
 */
export function markCorrect(qaId: number) {
  db.update(qaInteractions)
    .set({ wasCorrect: true })
    .where(eq(qaInteractions.id, qaId))
    .run();
}

/**
 * Get questions the system couldn't answer confidently (knowledge gaps).
 */
export function getKnowledgeGaps(limit = 10): Array<{
  question: string;
  confidence: string | null;
  count: number;
}> {
  // Get low-confidence or unanswered questions
  const lowConfidence = db.select().from(qaInteractions)
    .where(eq(qaInteractions.confidence, 'low'))
    .all();

  // Group by similar questions and count
  const gaps = new Map<string, { question: string; confidence: string | null; count: number }>();
  for (const qa of lowConfidence) {
    const key = qa.question.toLowerCase().trim();
    const existing = gaps.get(key);
    if (existing) {
      existing.count++;
    } else {
      gaps.set(key, { question: qa.question, confidence: qa.confidence, count: 1 });
    }
  }

  return Array.from(gaps.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get accuracy stats for the self-learning system.
 */
export function getAccuracyStats(): {
  total: number;
  correct: number;
  incorrect: number;
  unrated: number;
  accuracyRate: number | null;
} {
  const all = db.select().from(qaInteractions).all();
  const correct = all.filter(q => q.wasCorrect === true).length;
  const incorrect = all.filter(q => q.wasCorrect === false).length;
  const rated = correct + incorrect;

  return {
    total: all.length,
    correct,
    incorrect,
    unrated: all.length - rated,
    accuracyRate: rated > 0 ? Math.round((correct / rated) * 100) : null,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/feedback-service.ts
git commit -m "feat: add feedback service — Q&A tracking, corrections as high-weight knowledge, accuracy stats"
```

---

## Task 6: Wire Topic Tracking into Ingestion Pipeline

**Files:**
- Modify: `bot/src/services/ingestion-service.ts`

- [ ] **Step 1: Import topic tracker and add topic recording**

At the top of `bot/src/services/ingestion-service.ts`, add:

```typescript
import { recordTopics } from './topic-tracker';
```

In `ingestZoomTranscript`, after entity extraction and linking (after the `// 7. Embed transcript chunks` section), add:

```typescript
  // 8. Record topics for SOP pattern detection
  const sopCandidates = recordTopics(entities.topics, 'zoom_transcript', meetingId);
  if (sopCandidates.length > 0) {
    console.log(`[ingestion] SOP candidates detected from Zoom: ${sopCandidates.join(', ')}`);
  }
```

Update the return to include `sopCandidates`:

In `ingestSlackMessage`, after entity extraction (inside the `if (input.text.length >= 100)` block), add:

```typescript
    // Record topics
    if (entities.topics.length > 0) {
      const sopCandidates = recordTopics(entities.topics, 'slack_message', input.messageTs);
      if (sopCandidates.length > 0) {
        console.log(`[ingestion] SOP candidates detected from Slack: ${sopCandidates.join(', ')}`);
      }
    }
```

In `ingestDocument`, after entity extraction, add:

```typescript
  // Record topics
  if (entities.topics.length > 0) {
    recordTopics(entities.topics, 'document', docId);
  }
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/ingestion-service.ts
git commit -m "feat: wire topic tracking into ingestion pipeline — Zoom, Slack, and document ingestion now record topics"
```

---

## Task 7: Add /sop and /ask Slack Commands

**Files:**
- Modify: `bot/src/slack/commands.ts`
- Modify: `bot/src/slack/interactions.ts`

- [ ] **Step 1: Add /sop command**

In `bot/src/slack/commands.ts`, add imports:

```typescript
import { createSOPForTopic, getSOPs, publishSOP, archiveSOP } from '../services/sop-service';
import { getSOPCandidates, getTopTopics } from '../services/topic-tracker';
```

Add the `/sop` command following the existing pattern:

```typescript
  app.command('/sop', async ({ command, ack, client }) => {
    await ack();
    const text = command.text.trim();

    if (!text || text === 'list') {
      // List all SOPs
      const sops = getSOPs();
      if (sops.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: 'No SOPs generated yet. Use `/sop <topic>` to create one, or wait for auto-suggestions.',
        });
        return;
      }

      const sopList = sops.map(s => {
        const meta = s.metadata as any;
        return `• *${s.title}* (${s.status}) — ${meta?.summary || 'No summary'}`;
      }).join('\n');

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*SOPs (${sops.length}):*\n${sopList}`,
      });
      return;
    }

    if (text === 'candidates') {
      // Show topics ready for SOP generation
      const candidates = getSOPCandidates();
      if (candidates.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: 'No SOP candidates yet. Topics need 5+ occurrences across conversations.',
        });
        return;
      }

      const list = candidates.map(c => `• "${c.topic}" — mentioned ${c.occurrences} times`).join('\n');
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*Topics ready for SOP generation:*\n${list}\n\nUse \`/sop <topic>\` to generate.`,
      });
      return;
    }

    if (text === 'topics') {
      const topics = getTopTopics(15);
      const list = topics.map(t => {
        const sopStatus = t.sopGenerated ? ' ✅ SOP exists' : '';
        return `• "${t.topic}" — ${t.occurrences} mentions${sopStatus}`;
      }).join('\n');

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*Top topics across conversations:*\n${list}`,
      });
      return;
    }

    // Generate SOP for specific topic
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Generating SOP for "${text}"... This may take a moment.`,
    });

    try {
      const result = await createSOPForTopic(text, { requestedBy: command.user_id });
      if (!result) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: `Couldn't generate SOP for "${text}" — not enough related content in the knowledge base yet.`,
        });
        return;
      }

      await client.chat.postMessage({
        channel: command.channel_id,
        text: `📋 *New SOP Generated: ${result.title}*\n\nFormat: ${result.format}\n${result.summary}\n\nStatus: Draft — review and publish with the buttons below.`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `📋 *New SOP Generated: ${result.title}*\n\nFormat: ${result.format}\n${result.summary}` },
          },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Publish' }, action_id: 'sop_publish', value: result.docId, style: 'primary' },
              { type: 'button', text: { type: 'plain_text', text: 'Dismiss' }, action_id: 'sop_dismiss', value: result.docId },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[sop] Generation failed:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'SOP generation failed. Please try again.',
      });
    }
  });
```

- [ ] **Step 2: Add /ask command**

In `bot/src/slack/commands.ts`, add imports:

```typescript
import { semanticSearch } from '../services/embedding-service';
import { recordQA } from '../services/feedback-service';
```

Add the `/ask` command:

```typescript
  app.command('/ask', async ({ command, ack, client }) => {
    await ack();
    const question = command.text.trim();

    if (!question) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Usage: `/ask <your question>`\nExample: `/ask What is our process for client onboarding?`',
      });
      return;
    }

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Searching knowledge base for: "${question}"...`,
    });

    try {
      // Search knowledge base
      const results = await semanticSearch(question, 8);
      const relevant = results.filter(r => r.similarity > 0.3);

      if (relevant.length === 0) {
        const qaId = recordQA({
          question,
          answer: 'No relevant information found.',
          confidence: 'low',
          sourceEntryIds: [],
          askedBy: command.user_id,
          askedVia: 'slack',
        });

        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: `I don't have enough information to answer "${question}" yet. This has been flagged as a knowledge gap.`,
        });
        return;
      }

      // Use Claude to synthesize an answer
      const { anthropic } = require('../ai/client');
      const context = relevant.map((r, i) => `[Source ${i + 1}] ${r.content}`).join('\n\n');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are a business knowledge assistant. Answer the question based ONLY on the provided context. Cite sources as [Source N]. If the context does not fully answer the question, say what you can and note what is missing. Be concise and direct.',
        messages: [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }],
      });

      const answer = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate answer.';

      // Determine confidence based on similarity scores
      const avgSimilarity = relevant.reduce((sum, r) => sum + r.similarity, 0) / relevant.length;
      const confidence = avgSimilarity > 0.6 ? 'high' : avgSimilarity > 0.4 ? 'medium' : 'low';

      // Record the Q&A
      const qaId = recordQA({
        question,
        answer,
        confidence,
        sourceEntryIds: relevant.map(r => r.id),
        askedBy: command.user_id,
        askedVia: 'slack',
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text: answer,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Q: ${question}*\n\n${answer}\n\n_Confidence: ${confidence} | Based on ${relevant.length} sources_` },
          },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: '👍 Correct' }, action_id: 'qa_correct', value: String(qaId) },
              { type: 'button', text: { type: 'plain_text', text: '👎 Wrong' }, action_id: 'qa_incorrect', value: String(qaId) },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[ask] Failed:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Failed to search knowledge base. Please try again.',
      });
    }
  });
```

- [ ] **Step 3: Add SOP and Q&A button handlers to interactions.ts**

In `bot/src/slack/interactions.ts`, add imports:

```typescript
import { publishSOP, archiveSOP } from '../services/sop-service';
import { markCorrect, recordCorrection } from '../services/feedback-service';
```

Add action handlers following the existing pattern:

```typescript
  app.action('sop_publish', async ({ body, ack, client }) => {
    await ack();
    const docId = (body as any).actions[0].value;
    publishSOP(docId);
    await client.chat.postMessage({
      channel: (body as any).channel.id,
      text: `✅ SOP published and active.`,
    });
  });

  app.action('sop_dismiss', async ({ body, ack, client }) => {
    await ack();
    const docId = (body as any).actions[0].value;
    archiveSOP(docId);
    await client.chat.postMessage({
      channel: (body as any).channel.id,
      text: `SOP dismissed and archived.`,
    });
  });

  app.action('qa_correct', async ({ body, ack }) => {
    await ack();
    const qaId = parseInt((body as any).actions[0].value, 10);
    markCorrect(qaId);
  });

  app.action('qa_incorrect', async ({ body, ack, client }) => {
    await ack();
    const qaId = parseInt((body as any).actions[0].value, 10);
    // For now, just mark as incorrect. Phase 3 will add a correction input modal.
    await recordCorrection(qaId, 'User indicated answer was incorrect — awaiting correction details.');
    await client.chat.postEphemeral({
      channel: (body as any).channel.id,
      user: (body as any).user.id,
      text: 'Thanks for the feedback. This has been noted and will help improve future answers.',
    });
  });
```

- [ ] **Step 4: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add bot/src/slack/commands.ts bot/src/slack/interactions.ts
git commit -m "feat: add /sop and /ask Slack commands with publish/dismiss and feedback buttons"
```

---

## Task 8: Add Weekly SOP Review Cron Job

**Files:**
- Modify: `bot/src/scheduler/cron-jobs.ts`

- [ ] **Step 1: Add SOP review cron**

In `bot/src/scheduler/cron-jobs.ts`, add imports:

```typescript
import { getSOPCandidates } from '../services/topic-tracker';
import { createSOPForTopic } from '../services/sop-service';
```

Add a new cron job after the existing ones. This runs Wednesday 10 AM CT — mid-week to catch patterns from Monday/Tuesday meetings:

```typescript
  // Wednesday 10 AM CT — Auto-generate SOPs for qualifying topics
  cron.schedule('0 10 * * 3', async () => {
    console.log('[cron] Running weekly SOP review...');
    try {
      const candidates = getSOPCandidates();
      if (candidates.length === 0) {
        console.log('[cron] No SOP candidates this week.');
        return;
      }

      for (const candidate of candidates) {
        console.log(`[cron] Generating SOP for: "${candidate.topic}" (${candidate.occurrences} mentions)`);
        const result = await createSOPForTopic(candidate.topic, {
          topicCountId: candidate.id,
        });

        if (result) {
          // Notify leadership channel about new SOP
          try {
            await client.chat.postMessage({
              channel: config.slack.founderHubChannelId || config.slack.teamAChannelId,
              text: `📋 *Auto-generated SOP: ${result.title}*\nBased on ${candidate.occurrences} mentions across conversations.\n\n${result.summary}\n\nReview with \`/sop list\``,
            });
          } catch (notifyErr) {
            console.error('[cron] Failed to notify about new SOP:', notifyErr);
          }
        }
      }
    } catch (err) {
      console.error('[cron] SOP review failed:', err);
    }
  }, { timezone: 'America/Chicago' });
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bot/src/scheduler/cron-jobs.ts
git commit -m "feat: add weekly SOP review cron — auto-generates SOPs for topics with 5+ mentions"
```

---

## Task 9: Integration Verification

- [ ] **Step 1: Verify both apps compile**

```bash
cd bot && npx tsc --noEmit
cd ../desktop && npx tsc --noEmit
```

Expected: Both clean.

- [ ] **Step 2: Verify new tables create**

```bash
cd bot && node -e "
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, 'data', 'test-phase2.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS topic_counts (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, normalized_topic TEXT NOT NULL, occurrences INTEGER NOT NULL DEFAULT 1, source_types TEXT, source_ids TEXT, last_seen_at INTEGER, sop_generated INTEGER DEFAULT 0, sop_id TEXT, created_at INTEGER)');
db.exec('CREATE TABLE IF NOT EXISTS qa_interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, was_correct INTEGER, correction TEXT, confidence TEXT, source_entry_ids TEXT, asked_by TEXT, asked_via TEXT, created_at INTEGER)');
var tables = db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all('table');
console.log('Tables:', tables.map(function(t) { return t.name; }));
db.prepare('INSERT INTO topic_counts (topic, normalized_topic, occurrences) VALUES (?, ?, ?)').run('client onboarding', 'client onboarding', 5);
db.prepare('INSERT INTO qa_interactions (question, answer, confidence) VALUES (?, ?, ?)').run('What is our onboarding process?', 'Test answer', 'medium');
console.log('topic_counts:', db.prepare('SELECT * FROM topic_counts').all());
console.log('qa_interactions:', db.prepare('SELECT * FROM qa_interactions').all());
console.log('PHASE 2 SCHEMA TESTS PASSED');
db.close();
fs.unlinkSync(dbPath);
"
```

Expected: Tables created, inserts work, PASSED.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: Phase 2 integration fixes"
```

---

## Verification Summary

| What | How to Test | Expected |
|------|-------------|----------|
| Topic tracking | Ingest content with overlapping topics | topic_counts increments |
| SOP auto-detection | Topic reaches 5 occurrences | Console logs "SOP candidates detected" |
| `/sop <topic>` | Run command in Slack | SOP generated from knowledge base |
| `/sop list` | Run command | Shows all generated SOPs |
| `/sop candidates` | Run command | Shows topics ready for SOP generation |
| `/ask <question>` | Ask a question | Answer with citations + feedback buttons |
| Feedback loop | Click 👎 Wrong | Correction stored as high-weight knowledge entry |
| Weekly cron | Wait for Wednesday 10AM or trigger manually | Auto-generates SOPs for qualifying topics |
| SOP publish/dismiss | Click buttons on SOP message | Status changes to active/archived |

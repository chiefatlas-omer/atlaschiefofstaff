# Phase 5: Sales Intelligence + Team Coaching + Product Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every sales and CS conversation into coaching material and product intelligence. Weekly Friday digest to the whole team with objections, pains, desires, and awareness levels. Coaching flags to leadership. Data-driven product roadmap from real customer conversations.

**Architecture:** Add a call analyzer service that processes Zoom transcripts through Claude to extract structured sales/CS intelligence (objections, pains, desires, awareness levels, business metadata). Store in new `call_analyses` and `product_signals` tables. A Friday cron job aggregates the week's analyses into a team-wide digest sent via Slack. A coaching engine compares per-rep patterns against team averages. Product intelligence aggregates feature requests and cancellation reasons ranked by business impact. All data surfaces in new web dashboard pages.

**Tech Stack:** TypeScript, Claude Sonnet (call analysis), existing Drizzle ORM + SQLite, Slack (digest delivery), Express API + React (dashboard pages).

---

## File Structure

### New Files (Bot)
- `bot/src/db/schema-analytics.ts` — call_analyses, product_signals, coaching_snapshots tables
- `bot/src/services/call-analyzer.ts` — Analyzes individual call transcripts for sales intelligence
- `bot/src/services/sales-digest.ts` — Aggregates weekly call analyses into team digest
- `bot/src/services/coaching-engine.ts` — Per-rep analytics, coaching flags, leadership alerts
- `bot/src/services/product-intelligence.ts` — Feature requests, cancellation reasons, roadmap input
- `bot/src/ai/call-analysis-prompts.ts` — Claude prompts for call analysis + coaching

### Modified Files (Bot)
- `bot/src/db/schema.ts` — Re-export new analytics tables
- `bot/src/index.ts` — Add CREATE TABLE SQL for new tables
- `bot/src/zoom/webhook-handler.ts` — After transcript ingestion, trigger call analysis
- `bot/src/scheduler/cron-jobs.ts` — Add Friday sales digest cron + Monday coaching cron

### New Files (Web)
- `web/src/server/routes/analytics.ts` — API routes for sales intelligence + coaching + product signals
- `web/src/client/pages/SalesIntel.tsx` — Sales intelligence dashboard
- `web/src/client/pages/Coaching.tsx` — Team coaching view
- `web/src/client/pages/ProductIntel.tsx` — Product intelligence / roadmap input

### Modified Files (Web)
- `web/src/client/App.tsx` — Add new routes
- `web/src/client/components/Layout.tsx` — Add nav items
- `web/src/client/lib/api.ts` — Add API methods + types
- `web/src/server/index.ts` — Register analytics routes

---

## Task 1: Add Analytics Schema

**Files:**
- Create: `bot/src/db/schema-analytics.ts`
- Modify: `bot/src/db/schema.ts`
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Create schema-analytics.ts**

```typescript
import { sqliteTable, text, integer, index, blob } from 'drizzle-orm/sqlite-core';

// ─── Call Analyses (Per-Call Sales Intelligence) ──────────
export const callAnalyses = sqliteTable('call_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: text('meeting_id'),                    // FK to meetings.id
  zoomMeetingId: text('zoom_meeting_id'),           // dedup key
  title: text('title'),
  date: integer('date'),                            // unix timestamp
  duration: integer('duration'),                    // minutes
  repSlackId: text('rep_slack_id'),                 // sales/CS rep who ran the call
  repName: text('rep_name'),

  // Business metadata
  businessName: text('business_name'),
  businessType: text('business_type'),              // 'landscaping', 'property_mgmt', etc.
  businessStage: text('business_stage'),            // 'startup', 'growth', 'established'
  estimatedRevenue: text('estimated_revenue'),      // '$100k-$500k', etc.
  employeeCount: text('employee_count'),            // '1-5', '6-20', etc.

  // Sales intelligence
  objections: text('objections', { mode: 'json' }),       // [{ objection, category, severity }]
  pains: text('pains', { mode: 'json' }),                 // [{ pain, severity, verbatim_quote }]
  desires: text('desires', { mode: 'json' }),             // [{ desire, priority }]
  awarenessLevel: text('awareness_level'),                // 'unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'

  // Call quality
  talkListenRatio: text('talk_listen_ratio'),             // '70/30' (rep/prospect)
  questionCount: integer('question_count'),
  openQuestionCount: integer('open_question_count'),
  nextSteps: text('next_steps', { mode: 'json' }),        // [{ who, what, deadline }]
  outcome: text('outcome'),                               // 'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost', 'follow_up', 'no_action'
  riskFlags: text('risk_flags', { mode: 'json' }),        // [{ flag, severity }]

  // Full analysis
  summary: text('summary'),
  rawAnalysis: text('raw_analysis', { mode: 'json' }),    // complete Claude response
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_call_analyses_rep').on(table.repSlackId),
  index('idx_call_analyses_date').on(table.date),
  index('idx_call_analyses_outcome').on(table.outcome),
]);

// ─── Product Signals (Feature Requests, Bugs, Churn Reasons) ─
export const productSignals = sqliteTable('product_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),                     // 'feature_request', 'bug', 'churn_reason', 'ux_friction', 'praise'
  description: text('description').notNull(),
  category: text('category'),                       // e.g. 'pricing', 'onboarding', 'integrations'
  severity: text('severity'),                       // 'critical', 'high', 'medium', 'low'
  verbatimQuote: text('verbatim_quote'),            // exact customer words
  businessName: text('business_name'),
  businessRevenue: text('business_revenue'),
  callAnalysisId: integer('call_analysis_id'),      // FK to call_analyses.id
  meetingId: text('meeting_id'),                    // FK to meetings.id
  reportedBy: text('reported_by'),                  // rep slack ID
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_product_signals_type').on(table.type),
  index('idx_product_signals_category').on(table.category),
  index('idx_product_signals_severity').on(table.severity),
]);

// ─── Coaching Snapshots (Weekly Per-Rep Metrics) ─────────
export const coachingSnapshots = sqliteTable('coaching_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repSlackId: text('rep_slack_id').notNull(),
  repName: text('rep_name'),
  weekStart: integer('week_start'),                 // unix timestamp of Monday
  callCount: integer('call_count'),
  avgTalkRatio: integer('avg_talk_ratio'),          // percentage (0-100)
  avgQuestionCount: integer('avg_question_count'),
  avgOpenQuestionRatio: integer('avg_open_question_ratio'), // percentage
  topObjections: text('top_objections', { mode: 'json' }),
  outcomeBreakdown: text('outcome_breakdown', { mode: 'json' }), // { demo_scheduled: 2, follow_up: 1, ... }
  coachingFlags: text('coaching_flags', { mode: 'json' }),  // [{ flag, severity, context }]
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_coaching_rep').on(table.repSlackId),
  index('idx_coaching_week').on(table.weekStart),
]);
```

- [ ] **Step 2: Re-export from schema.ts**

Add to the existing re-export in `bot/src/db/schema.ts`:
```typescript
export { callAnalyses, productSignals, coachingSnapshots } from './schema-analytics';
```

- [ ] **Step 3: Add CREATE TABLE SQL in index.ts**

Add CREATE TABLE IF NOT EXISTS + indexes for all 3 tables following the existing pattern.

- [ ] **Step 4: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add bot/src/db/schema-analytics.ts bot/src/db/schema.ts bot/src/index.ts
git commit -m "feat: add analytics schema — call_analyses, product_signals, coaching_snapshots"
```

---

## Task 2: Build Call Analyzer Service + Prompts

**Files:**
- Create: `bot/src/ai/call-analysis-prompts.ts`
- Create: `bot/src/services/call-analyzer.ts`

- [ ] **Step 1: Create call analysis prompts**

Create `bot/src/ai/call-analysis-prompts.ts`:

```typescript
export const CALL_ANALYSIS_PROMPT = `You are a sales intelligence engine analyzing a business call transcript. Extract structured intelligence for a sales/CS team.

Return ONLY valid JSON:
{
  "business": {
    "name": "company name or null",
    "type": "landscaping|property_mgmt|general_contractor|other",
    "stage": "startup|growth|established|enterprise",
    "estimated_revenue": "$0-$100k|$100k-$500k|$500k-$1M|$1M-$5M|$5M+|unknown",
    "employee_count": "1-5|6-20|21-50|51-200|200+|unknown"
  },
  "objections": [
    { "objection": "what they said", "category": "pricing|timing|competition|trust|need|authority", "severity": "high|medium|low" }
  ],
  "pains": [
    { "pain": "the problem they described", "severity": "critical|high|medium|low", "verbatim_quote": "their exact words" }
  ],
  "desires": [
    { "desire": "what they want", "priority": "must_have|nice_to_have|future" }
  ],
  "awareness_level": "unaware|problem_aware|solution_aware|product_aware|most_aware",
  "call_quality": {
    "talk_listen_ratio": "estimated rep% / prospect%",
    "question_count": number,
    "open_question_count": number,
    "summary": "2-3 sentence call summary"
  },
  "next_steps": [
    { "who": "person name", "what": "action item", "deadline": "timeframe or null" }
  ],
  "outcome": "demo_scheduled|proposal_sent|closed_won|closed_lost|follow_up|no_action",
  "risk_flags": [
    { "flag": "what's concerning", "severity": "high|medium|low" }
  ],
  "product_signals": [
    { "type": "feature_request|bug|churn_reason|ux_friction|praise", "description": "what they said", "category": "pricing|onboarding|integrations|features|support|billing", "severity": "critical|high|medium|low", "verbatim_quote": "exact words or null" }
  ]
}

Rules:
- Base everything on the transcript, don't invent data
- For talk/listen ratio, estimate based on speaker turns and length
- Capture verbatim quotes for pains and product signals when possible
- Severity reflects business impact (critical = deal-breaking, low = minor preference)
- If information isn't available, use null or empty arrays
- Awareness levels: unaware (doesn't know the problem), problem_aware (knows problem not solution), solution_aware (knows solutions exist), product_aware (knows our product), most_aware (ready to buy)`;

export const COACHING_SUMMARY_PROMPT = `You are a sales coaching assistant analyzing a rep's call patterns over the past week. Given their call analyses, generate specific, actionable coaching feedback.

Return ONLY valid JSON:
{
  "coaching_flags": [
    { "flag": "specific observation", "severity": "high|medium|low", "context": "evidence from their calls", "suggestion": "what to do differently" }
  ],
  "strengths": ["what they're doing well"],
  "overall_assessment": "1-2 sentence summary"
}

Rules:
- Be specific — reference actual calls and patterns
- Focus on actionable improvements, not generic advice
- Compare against best practices: 60/40 talk ratio, majority open questions, clear next steps
- Praise genuine strengths, not just absence of weaknesses
- Max 5 coaching flags, max 3 strengths`;
```

- [ ] **Step 2: Create call-analyzer.ts**

Create `bot/src/services/call-analyzer.ts`:

```typescript
import { db } from '../db/connection';
import { callAnalyses, productSignals } from '../db/schema';
import { eq } from 'drizzle-orm';
import { anthropic } from '../ai/client';
import { CALL_ANALYSIS_PROMPT } from '../ai/call-analysis-prompts';

export interface CallAnalysisResult {
  analysisId: number;
  productSignalCount: number;
  outcome: string;
  awarenessLevel: string;
}

/**
 * Analyze a sales/CS call transcript and store structured intelligence.
 */
export async function analyzeCall(input: {
  meetingId: string;
  zoomMeetingId: string;
  title?: string;
  date?: number;
  duration?: number;
  transcriptText: string;
  repSlackId?: string;
  repName?: string;
}): Promise<CallAnalysisResult | null> {
  // Dedup: skip if already analyzed
  const existing = db.select().from(callAnalyses)
    .where(eq(callAnalyses.zoomMeetingId, input.zoomMeetingId))
    .get();
  if (existing) {
    console.log(`[call-analyzer] Already analyzed: ${input.zoomMeetingId}`);
    return null;
  }

  console.log(`[call-analyzer] Analyzing call: ${input.title || input.zoomMeetingId}`);

  // Truncate long transcripts
  const transcript = input.transcriptText.length > 25000
    ? input.transcriptText.substring(0, 25000) + '\n[...truncated]'
    : input.transcriptText;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: CALL_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    // Parse JSON
    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/) || content.text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.error('[call-analyzer] Failed to parse response');
      return null;
    }
    const analysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // Store call analysis
    const result = db.insert(callAnalyses).values({
      meetingId: input.meetingId,
      zoomMeetingId: input.zoomMeetingId,
      title: input.title,
      date: input.date,
      duration: input.duration,
      repSlackId: input.repSlackId,
      repName: input.repName,
      businessName: analysis.business?.name,
      businessType: analysis.business?.type,
      businessStage: analysis.business?.stage,
      estimatedRevenue: analysis.business?.estimated_revenue,
      employeeCount: analysis.business?.employee_count,
      objections: analysis.objections || [],
      pains: analysis.pains || [],
      desires: analysis.desires || [],
      awarenessLevel: analysis.awareness_level,
      talkListenRatio: analysis.call_quality?.talk_listen_ratio,
      questionCount: analysis.call_quality?.question_count,
      openQuestionCount: analysis.call_quality?.open_question_count,
      nextSteps: analysis.next_steps || [],
      outcome: analysis.outcome,
      riskFlags: analysis.risk_flags || [],
      summary: analysis.call_quality?.summary,
      rawAnalysis: analysis,
    }).run();

    const analysisId = Number(result.lastInsertRowid);

    // Store product signals
    let signalCount = 0;
    for (const signal of (analysis.product_signals || [])) {
      db.insert(productSignals).values({
        type: signal.type,
        description: signal.description,
        category: signal.category,
        severity: signal.severity,
        verbatimQuote: signal.verbatim_quote,
        businessName: analysis.business?.name,
        businessRevenue: analysis.business?.estimated_revenue,
        callAnalysisId: analysisId,
        meetingId: input.meetingId,
        reportedBy: input.repSlackId,
      }).run();
      signalCount++;
    }

    console.log(`[call-analyzer] Analysis complete: ${analysis.outcome}, ${signalCount} product signals, awareness: ${analysis.awareness_level}`);

    return {
      analysisId,
      productSignalCount: signalCount,
      outcome: analysis.outcome || 'unknown',
      awarenessLevel: analysis.awareness_level || 'unknown',
    };
  } catch (err) {
    console.error('[call-analyzer] Failed:', err);
    return null;
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add bot/src/ai/call-analysis-prompts.ts bot/src/services/call-analyzer.ts
git commit -m "feat: add call analyzer — Claude extracts sales intelligence, objections, pains, product signals from transcripts"
```

---

## Task 3: Build Sales Digest Service

**Files:**
- Create: `bot/src/services/sales-digest.ts`

- [ ] **Step 1: Create sales-digest.ts**

This aggregates the week's call analyses into a Friday team digest.

```typescript
import { db } from '../db/connection';
import { callAnalyses, productSignals } from '../db/schema';
import { gt, desc } from 'drizzle-orm';

interface WeeklyDigest {
  callCount: number;
  outcomeBreakdown: Record<string, number>;
  topObjections: Array<{ objection: string; category: string; count: number }>;
  topPains: Array<{ pain: string; count: number }>;
  topDesires: Array<{ desire: string; count: number }>;
  awarenessBreakdown: Record<string, number>;
  riskFlags: Array<{ flag: string; businessName: string; severity: string }>;
  productSignals: Array<{ type: string; description: string; count: number; severity: string }>;
  repSummaries: Array<{ repName: string; callCount: number; outcomes: Record<string, number> }>;
}

/**
 * Generate a weekly sales intelligence digest from call analyses.
 */
export function generateWeeklyDigest(): WeeklyDigest {
  const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

  const calls = db.select().from(callAnalyses)
    .where(gt(callAnalyses.date, weekAgo))
    .orderBy(desc(callAnalyses.date))
    .all();

  if (calls.length === 0) {
    return {
      callCount: 0, outcomeBreakdown: {}, topObjections: [], topPains: [],
      topDesires: [], awarenessBreakdown: {}, riskFlags: [], productSignals: [], repSummaries: [],
    };
  }

  // Outcome breakdown
  const outcomeBreakdown: Record<string, number> = {};
  for (const call of calls) {
    const o = call.outcome || 'unknown';
    outcomeBreakdown[o] = (outcomeBreakdown[o] || 0) + 1;
  }

  // Aggregate objections
  const objectionMap = new Map<string, { category: string; count: number }>();
  for (const call of calls) {
    for (const obj of (call.objections as any[] || [])) {
      const key = obj.objection?.toLowerCase();
      if (!key) continue;
      const existing = objectionMap.get(key);
      if (existing) existing.count++;
      else objectionMap.set(key, { category: obj.category, count: 1 });
    }
  }
  const topObjections = Array.from(objectionMap.entries())
    .map(([objection, data]) => ({ objection, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Aggregate pains
  const painMap = new Map<string, number>();
  for (const call of calls) {
    for (const p of (call.pains as any[] || [])) {
      const key = p.pain?.toLowerCase();
      if (!key) continue;
      painMap.set(key, (painMap.get(key) || 0) + 1);
    }
  }
  const topPains = Array.from(painMap.entries())
    .map(([pain, count]) => ({ pain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Aggregate desires
  const desireMap = new Map<string, number>();
  for (const call of calls) {
    for (const d of (call.desires as any[] || [])) {
      const key = d.desire?.toLowerCase();
      if (!key) continue;
      desireMap.set(key, (desireMap.get(key) || 0) + 1);
    }
  }
  const topDesires = Array.from(desireMap.entries())
    .map(([desire, count]) => ({ desire, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Awareness breakdown
  const awarenessBreakdown: Record<string, number> = {};
  for (const call of calls) {
    const a = call.awarenessLevel || 'unknown';
    awarenessBreakdown[a] = (awarenessBreakdown[a] || 0) + 1;
  }

  // High-severity risk flags
  const riskFlags = calls
    .flatMap(c => ((c.riskFlags as any[]) || []).map(f => ({
      flag: f.flag,
      businessName: c.businessName || 'Unknown',
      severity: f.severity,
    })))
    .filter(f => f.severity === 'high');

  // Product signals this week
  const signals = db.select().from(productSignals)
    .where(gt(productSignals.createdAt, weekAgo))
    .all();
  const signalMap = new Map<string, { type: string; description: string; count: number; severity: string }>();
  for (const s of signals) {
    const key = s.description.toLowerCase();
    const existing = signalMap.get(key);
    if (existing) existing.count++;
    else signalMap.set(key, { type: s.type, description: s.description, count: 1, severity: s.severity || 'medium' });
  }
  const topSignals = Array.from(signalMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Per-rep summaries
  const repMap = new Map<string, { repName: string; callCount: number; outcomes: Record<string, number> }>();
  for (const call of calls) {
    const repId = call.repSlackId || 'unknown';
    const existing = repMap.get(repId);
    if (existing) {
      existing.callCount++;
      const o = call.outcome || 'unknown';
      existing.outcomes[o] = (existing.outcomes[o] || 0) + 1;
    } else {
      repMap.set(repId, {
        repName: call.repName || repId,
        callCount: 1,
        outcomes: { [call.outcome || 'unknown']: 1 },
      });
    }
  }

  return {
    callCount: calls.length,
    outcomeBreakdown,
    topObjections,
    topPains,
    topDesires,
    awarenessBreakdown,
    riskFlags,
    productSignals: topSignals,
    repSummaries: Array.from(repMap.values()),
  };
}

/**
 * Format the weekly digest as a Slack message.
 */
export function formatDigestForSlack(digest: ReturnType<typeof generateWeeklyDigest>): string {
  if (digest.callCount === 0) return '📊 *Weekly Sales Intelligence*\n\nNo calls analyzed this week.';

  let msg = `📊 *Weekly Sales Intelligence Digest*\n_${digest.callCount} calls analyzed this week_\n\n`;

  // Outcomes
  msg += '*Call Outcomes:*\n';
  for (const [outcome, count] of Object.entries(digest.outcomeBreakdown)) {
    msg += `• ${outcome.replace(/_/g, ' ')}: ${count}\n`;
  }

  // Top Objections
  if (digest.topObjections.length > 0) {
    msg += '\n*Top Objections:*\n';
    for (const obj of digest.topObjections.slice(0, 5)) {
      msg += `• "${obj.objection}" (${obj.category}) — ${obj.count}x\n`;
    }
  }

  // Top Pains
  if (digest.topPains.length > 0) {
    msg += '\n*Customer Pains:*\n';
    for (const p of digest.topPains.slice(0, 5)) {
      msg += `• "${p.pain}" — ${p.count}x\n`;
    }
  }

  // Top Desires
  if (digest.topDesires.length > 0) {
    msg += '\n*Customer Desires:*\n';
    for (const d of digest.topDesires.slice(0, 5)) {
      msg += `• "${d.desire}" — ${d.count}x\n`;
    }
  }

  // Risk Flags
  if (digest.riskFlags.length > 0) {
    msg += '\n🔴 *Risk Flags:*\n';
    for (const f of digest.riskFlags.slice(0, 5)) {
      msg += `• ${f.businessName}: ${f.flag}\n`;
    }
  }

  // Product Signals
  if (digest.productSignals.length > 0) {
    msg += '\n*Product Signals:*\n';
    for (const s of digest.productSignals.slice(0, 5)) {
      const emoji = s.type === 'feature_request' ? '💡' : s.type === 'bug' ? '🐛' : s.type === 'churn_reason' ? '⚠️' : '📝';
      msg += `• ${emoji} ${s.description} (${s.type.replace(/_/g, ' ')}, ${s.count}x)\n`;
    }
  }

  // Rep summaries
  if (digest.repSummaries.length > 0) {
    msg += '\n*Per-Rep Summary:*\n';
    for (const rep of digest.repSummaries) {
      msg += `• ${rep.repName}: ${rep.callCount} calls`;
      const won = rep.outcomes['closed_won'] || 0;
      if (won > 0) msg += ` (${won} closed)`;
      msg += '\n';
    }
  }

  return msg;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/sales-digest.ts
git commit -m "feat: add sales digest — aggregates weekly call intelligence into team-wide Slack digest"
```

---

## Task 4: Build Coaching Engine + Product Intelligence

**Files:**
- Create: `bot/src/services/coaching-engine.ts`
- Create: `bot/src/services/product-intelligence.ts`

- [ ] **Step 1: Create coaching-engine.ts**

```typescript
import { db } from '../db/connection';
import { callAnalyses, coachingSnapshots } from '../db/schema';
import { eq, gt, and, desc } from 'drizzle-orm';
import { anthropic } from '../ai/client';
import { COACHING_SUMMARY_PROMPT } from '../ai/call-analysis-prompts';

/**
 * Generate coaching snapshot for a rep based on their recent calls.
 */
export async function generateCoachingSnapshot(repSlackId: string): Promise<{
  snapshot: any;
  flags: Array<{ flag: string; severity: string; suggestion: string }>;
} | null> {
  const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  const weekStart = weekAgo - (weekAgo % (7 * 24 * 60 * 60)); // Monday

  const calls = db.select().from(callAnalyses)
    .where(and(eq(callAnalyses.repSlackId, repSlackId), gt(callAnalyses.date, weekAgo)))
    .all();

  if (calls.length === 0) return null;

  // Calculate averages
  const avgTalkRatio = Math.round(calls.reduce((sum, c) => {
    const ratio = parseInt(c.talkListenRatio?.split('/')[0] || '50');
    return sum + ratio;
  }, 0) / calls.length);

  const avgQuestions = Math.round(calls.reduce((sum, c) => sum + (c.questionCount || 0), 0) / calls.length);
  const avgOpenRatio = calls.reduce((sum, c) => {
    if (!c.questionCount || c.questionCount === 0) return sum;
    return sum + Math.round(((c.openQuestionCount || 0) / c.questionCount) * 100);
  }, 0) / calls.length;

  // Top objections across their calls
  const objectionMap = new Map<string, number>();
  for (const call of calls) {
    for (const obj of (call.objections as any[] || [])) {
      const key = obj.category || 'unknown';
      objectionMap.set(key, (objectionMap.get(key) || 0) + 1);
    }
  }

  // Outcome breakdown
  const outcomes: Record<string, number> = {};
  for (const call of calls) {
    const o = call.outcome || 'unknown';
    outcomes[o] = (outcomes[o] || 0) + 1;
  }

  // Ask Claude for coaching flags
  const callSummaries = calls.map(c => `Call: ${c.title || 'Unknown'} | Outcome: ${c.outcome} | Talk ratio: ${c.talkListenRatio} | Questions: ${c.questionCount} (${c.openQuestionCount} open) | Summary: ${c.summary}`).join('\n');

  let flags: Array<{ flag: string; severity: string; suggestion: string }> = [];
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: COACHING_SUMMARY_PROMPT,
      messages: [{ role: 'user', content: `Rep: ${calls[0].repName || repSlackId}\n\nCalls this week:\n${callSummaries}` }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      flags = parsed.coaching_flags || [];
    }
  } catch (err) {
    console.error('[coaching] Claude coaching analysis failed:', err);
  }

  // Store snapshot
  const result = db.insert(coachingSnapshots).values({
    repSlackId,
    repName: calls[0].repName,
    weekStart,
    callCount: calls.length,
    avgTalkRatio,
    avgQuestionCount: avgQuestions,
    avgOpenQuestionRatio: Math.round(avgOpenRatio),
    topObjections: Array.from(objectionMap.entries()).map(([k, v]) => ({ category: k, count: v })),
    outcomeBreakdown: outcomes,
    coachingFlags: flags,
  }).run();

  return { snapshot: { id: Number(result.lastInsertRowid), callCount: calls.length, avgTalkRatio, outcomes }, flags };
}

/**
 * Format coaching flags as a Slack message for leadership.
 */
export function formatCoachingForSlack(repName: string, flags: Array<{ flag: string; severity: string; suggestion: string }>): string {
  if (flags.length === 0) return '';

  let msg = `🎯 *Coaching Notes: ${repName}*\n\n`;
  for (const f of flags) {
    const emoji = f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🟢';
    msg += `${emoji} *${f.flag}*\n${f.suggestion}\n\n`;
  }
  return msg;
}
```

- [ ] **Step 2: Create product-intelligence.ts**

```typescript
import { db } from '../db/connection';
import { productSignals } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

export interface ProductRoadmapItem {
  description: string;
  type: string;
  category: string;
  count: number;
  severity: string;
  businessNames: string[];
  verbatimQuotes: string[];
}

/**
 * Get prioritized product roadmap input — top signals ranked by frequency + severity.
 */
export function getProductRoadmap(limit = 20): ProductRoadmapItem[] {
  const allSignals = db.select().from(productSignals).all();

  // Group by normalized description
  const grouped = new Map<string, ProductRoadmapItem>();
  for (const s of allSignals) {
    const key = s.description.toLowerCase().trim();
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      if (s.businessName && !existing.businessNames.includes(s.businessName)) {
        existing.businessNames.push(s.businessName);
      }
      if (s.verbatimQuote) existing.verbatimQuotes.push(s.verbatimQuote);
      // Upgrade severity if higher
      if (s.severity === 'critical' || (s.severity === 'high' && existing.severity !== 'critical')) {
        existing.severity = s.severity;
      }
    } else {
      grouped.set(key, {
        description: s.description,
        type: s.type,
        category: s.category || 'uncategorized',
        count: 1,
        severity: s.severity || 'medium',
        businessNames: s.businessName ? [s.businessName] : [],
        verbatimQuotes: s.verbatimQuote ? [s.verbatimQuote] : [],
      });
    }
  }

  // Sort by: severity weight * count
  const severityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return Array.from(grouped.values())
    .sort((a, b) => (severityWeight[b.severity] || 1) * b.count - (severityWeight[a.severity] || 1) * a.count)
    .slice(0, limit);
}

/**
 * Get cancellation/churn intelligence.
 */
export function getChurnIntelligence() {
  const churnSignals = db.select().from(productSignals)
    .where(eq(productSignals.type, 'churn_reason'))
    .all();

  const categoryMap = new Map<string, { count: number; descriptions: string[] }>();
  for (const s of churnSignals) {
    const cat = s.category || 'unknown';
    const existing = categoryMap.get(cat);
    if (existing) {
      existing.count++;
      existing.descriptions.push(s.description);
    } else {
      categoryMap.set(cat, { count: 1, descriptions: [s.description] });
    }
  }

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get signal breakdown by type.
 */
export function getSignalBreakdown() {
  const all = db.select().from(productSignals).all();
  const breakdown: Record<string, number> = {};
  for (const s of all) {
    breakdown[s.type] = (breakdown[s.type] || 0) + 1;
  }
  return breakdown;
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add bot/src/services/coaching-engine.ts bot/src/services/product-intelligence.ts
git commit -m "feat: add coaching engine + product intelligence — per-rep coaching flags, prioritized roadmap input"
```

---

## Task 5: Wire Call Analyzer into Zoom Handler + Add Cron Jobs

**Files:**
- Modify: `bot/src/zoom/webhook-handler.ts`
- Modify: `bot/src/scheduler/cron-jobs.ts`

- [ ] **Step 1: Wire call analyzer into Zoom handler**

In `bot/src/zoom/webhook-handler.ts`, add import:
```typescript
import { analyzeCall } from '../services/call-analyzer';
```

After the existing knowledge graph ingestion (the `ingestZoomTranscript` try/catch block), add another non-fatal block:

```typescript
// ─── Sales Intelligence Analysis ──────────────────────────
try {
  await analyzeCall({
    meetingId: meetingId || zoomMeetingId,
    zoomMeetingId: meetingUUID,
    title: meetingTopic,
    date: Math.floor(new Date(meetingStartTime).getTime() / 1000),
    duration: meetingDuration,
    transcriptText,
    repSlackId: hostSlackId,
    repName: hostName,
  });
} catch (err) {
  console.error('[zoom] Call analysis failed (non-fatal):', err);
}
```

Read the file first to find exact variable names — they may differ (e.g., `meetingUUID`, `meetingTopic`, `meetingStartTime`). Adapt accordingly.

- [ ] **Step 2: Add Friday sales digest cron**

In `bot/src/scheduler/cron-jobs.ts`, add imports:
```typescript
import { generateWeeklyDigest, formatDigestForSlack } from '../services/sales-digest';
import { generateCoachingSnapshot, formatCoachingForSlack } from '../services/coaching-engine';
```

Add Friday 10 AM CT cron (after the existing Friday 9 AM digest):

```typescript
  // Friday 10 AM CT — Sales Intelligence Digest
  cron.schedule('0 10 * * 5', async () => {
    console.log('[cron] Generating sales intelligence digest...');
    try {
      const digest = generateWeeklyDigest();
      if (digest.callCount === 0) {
        console.log('[cron] No calls to digest this week.');
        return;
      }
      const message = formatDigestForSlack(digest);

      // Send to founder channel
      const channelId = config.channels?.founderHubHQ || config.channels?.teamA;
      if (channelId) {
        await client.chat.postMessage({ channel: channelId, text: message });
      }

      // Also DM to leadership
      const leadershipIds = [config.slack?.omerSlackUserId, config.slack?.markSlackUserId, config.slack?.ehsanSlackUserId].filter(Boolean);
      for (const userId of leadershipIds) {
        try { await client.chat.postMessage({ channel: userId, text: message }); } catch {}
      }

      console.log(`[cron] Sales digest sent: ${digest.callCount} calls analyzed.`);
    } catch (err) {
      console.error('[cron] Sales digest failed:', err);
    }
  }, { timezone: 'America/Chicago' });
```

Add Monday 9 AM CT cron for coaching snapshots:

```typescript
  // Monday 9 AM CT — Generate coaching snapshots for reps
  cron.schedule('0 9 * * 1', async () => {
    console.log('[cron] Generating coaching snapshots...');
    try {
      // Get unique reps from last week's analyses
      const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const { callAnalyses } = require('../db/schema');
      const { gt } = require('drizzle-orm');
      const { db } = require('../db/connection');
      const recentCalls = db.select().from(callAnalyses).where(gt(callAnalyses.date, weekAgo)).all();
      const repIds = [...new Set(recentCalls.map((c: any) => c.repSlackId).filter(Boolean))];

      for (const repId of repIds) {
        const result = await generateCoachingSnapshot(repId as string);
        if (result && result.flags.length > 0) {
          const repName = recentCalls.find((c: any) => c.repSlackId === repId)?.repName || repId;
          const coachingMsg = formatCoachingForSlack(repName as string, result.flags);

          // DM to leadership only (not to the rep — coaching is private)
          const leadershipIds = [config.slack?.omerSlackUserId, config.slack?.markSlackUserId, config.slack?.ehsanSlackUserId].filter(Boolean);
          for (const leaderId of leadershipIds) {
            try { await client.chat.postMessage({ channel: leaderId, text: coachingMsg }); } catch {}
          }
        }
      }
      console.log(`[cron] Coaching snapshots generated for ${repIds.length} reps.`);
    } catch (err) {
      console.error('[cron] Coaching snapshots failed:', err);
    }
  }, { timezone: 'America/Chicago' });
```

- [ ] **Step 3: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add bot/src/zoom/webhook-handler.ts bot/src/scheduler/cron-jobs.ts
git commit -m "feat: wire call analyzer into Zoom handler + add Friday sales digest and Monday coaching crons"
```

---

## Task 6: Add Web Dashboard Pages + API Routes

**Files:**
- Create: `web/src/server/routes/analytics.ts`
- Create: `web/src/client/pages/SalesIntel.tsx`
- Create: `web/src/client/pages/Coaching.tsx`
- Create: `web/src/client/pages/ProductIntel.tsx`
- Modify: `web/src/server/index.ts`
- Modify: `web/src/client/App.tsx`
- Modify: `web/src/client/components/Layout.tsx`
- Modify: `web/src/client/lib/api.ts`

- [ ] **Step 1: Create analytics API routes**

Create `web/src/server/routes/analytics.ts`:

```typescript
import { Router } from 'express';
import { db } from '../db';
import { callAnalyses, productSignals, coachingSnapshots } from '../../../../bot/src/db/schema';
import { desc, gt, eq } from 'drizzle-orm';

const router = Router();

// GET /api/analytics/calls — recent call analyses
router.get('/calls', (_req, res) => {
  const calls = db.select().from(callAnalyses).orderBy(desc(callAnalyses.date)).limit(50).all();
  res.json(calls);
});

// GET /api/analytics/digest — weekly digest data
router.get('/digest', (_req, res) => {
  const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  const calls = db.select().from(callAnalyses).where(gt(callAnalyses.date, weekAgo)).all();

  // Aggregate
  const outcomeBreakdown: Record<string, number> = {};
  const awarenessBreakdown: Record<string, number> = {};
  for (const c of calls) {
    outcomeBreakdown[c.outcome || 'unknown'] = (outcomeBreakdown[c.outcome || 'unknown'] || 0) + 1;
    awarenessBreakdown[c.awarenessLevel || 'unknown'] = (awarenessBreakdown[c.awarenessLevel || 'unknown'] || 0) + 1;
  }

  res.json({ callCount: calls.length, outcomeBreakdown, awarenessBreakdown, calls });
});

// GET /api/analytics/product — product signals
router.get('/product', (_req, res) => {
  const signals = db.select().from(productSignals).orderBy(desc(productSignals.createdAt)).limit(100).all();

  // Group by type
  const breakdown: Record<string, number> = {};
  for (const s of signals) breakdown[s.type] = (breakdown[s.type] || 0) + 1;

  res.json({ signals, breakdown, total: signals.length });
});

// GET /api/analytics/coaching — coaching snapshots
router.get('/coaching', (_req, res) => {
  const snapshots = db.select().from(coachingSnapshots).orderBy(desc(coachingSnapshots.weekStart)).limit(20).all();
  res.json(snapshots);
});

export { router as analyticsRouter };
```

- [ ] **Step 2: Register route in server/index.ts**

Add to `web/src/server/index.ts`:
```typescript
import { analyticsRouter } from './routes/analytics';
app.use('/api/analytics', analyticsRouter);
```

- [ ] **Step 3: Add API types and methods**

In `web/src/client/lib/api.ts`, add:

```typescript
export interface CallAnalysis {
  id: number; title: string | null; date: number | null; repName: string | null;
  businessName: string | null; businessType: string | null; awarenessLevel: string | null;
  outcome: string | null; talkListenRatio: string | null; summary: string | null;
  objections: any[]; pains: any[]; desires: any[]; riskFlags: any[];
}

export interface DigestData {
  callCount: number; outcomeBreakdown: Record<string, number>;
  awarenessBreakdown: Record<string, number>; calls: CallAnalysis[];
}

export interface ProductSignal {
  id: number; type: string; description: string; category: string | null;
  severity: string | null; verbatimQuote: string | null; businessName: string | null;
}

export interface CoachingSnapshot {
  id: number; repName: string | null; weekStart: number | null; callCount: number | null;
  avgTalkRatio: number | null; coachingFlags: any[];
}

// Add to api object:
// salesDigest: () => fetchApi<DigestData>('/analytics/digest'),
// productSignals: () => fetchApi<{ signals: ProductSignal[]; breakdown: Record<string, number>; total: number }>('/analytics/product'),
// coaching: () => fetchApi<CoachingSnapshot[]>('/analytics/coaching'),
// calls: () => fetchApi<CallAnalysis[]>('/analytics/calls'),
```

- [ ] **Step 4: Create SalesIntel page**

Create `web/src/client/pages/SalesIntel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { fetchApi, DigestData } from '../lib/api';
import { MetricCard } from '../components/MetricCard';

export function SalesIntel() {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<DigestData>('/analytics/digest').then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!data) return <div className="text-red-400">Failed to load</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sales Intelligence</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Calls This Week" value={data.callCount} color="purple" />
        <MetricCard label="Demos Scheduled" value={data.outcomeBreakdown['demo_scheduled'] || 0} color="green" />
        <MetricCard label="Closed Won" value={data.outcomeBreakdown['closed_won'] || 0} color="green" />
      </div>

      {/* Awareness Breakdown */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Prospect Awareness Levels</h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-8">
        {Object.entries(data.awarenessBreakdown).map(([level, count]) => (
          <div key={level} className="flex justify-between py-1">
            <span className="text-gray-300 capitalize">{level.replace(/_/g, ' ')}</span>
            <span className="text-gray-400">{count}</span>
          </div>
        ))}
      </div>

      {/* Recent Calls */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Recent Calls</h2>
      <div className="space-y-3">
        {data.calls.slice(0, 10).map(call => (
          <div key={call.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex justify-between mb-2">
              <span className="font-medium text-gray-200">{call.title || 'Untitled'}</span>
              <span className="text-xs text-gray-500">{call.repName}</span>
            </div>
            <div className="text-sm text-gray-400">{call.summary}</div>
            <div className="flex gap-3 mt-2 text-xs">
              {call.outcome && <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">{call.outcome.replace(/_/g, ' ')}</span>}
              {call.awarenessLevel && <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">{call.awarenessLevel.replace(/_/g, ' ')}</span>}
              {call.businessName && <span className="text-gray-500">{call.businessName}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ProductIntel page**

Create `web/src/client/pages/ProductIntel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { fetchApi, ProductSignal } from '../lib/api';
import { MetricCard } from '../components/MetricCard';

export function ProductIntel() {
  const [data, setData] = useState<{ signals: ProductSignal[]; breakdown: Record<string, number>; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<any>('/analytics/product').then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!data) return <div className="text-red-400">Failed to load</div>;

  const typeEmoji: Record<string, string> = {
    feature_request: '💡', bug: '🐛', churn_reason: '⚠️', ux_friction: '😤', praise: '🎉',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Product Intelligence</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Signals" value={data.total} color="purple" />
        <MetricCard label="Feature Requests" value={data.breakdown['feature_request'] || 0} color="blue" />
        <MetricCard label="Bugs Reported" value={data.breakdown['bug'] || 0} color="red" />
        <MetricCard label="Churn Risks" value={data.breakdown['churn_reason'] || 0} color="yellow" />
      </div>

      <h2 className="text-lg font-semibold text-gray-300 mb-3">All Product Signals</h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Description</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Severity</th>
              <th className="text-left p-3">Business</th>
            </tr>
          </thead>
          <tbody>
            {data.signals.map(s => (
              <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="p-3">{typeEmoji[s.type] || '📝'} {s.type.replace(/_/g, ' ')}</td>
                <td className="p-3 text-gray-200 max-w-sm">{s.description}</td>
                <td className="p-3 text-gray-400">{s.category || '—'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded ${s.severity === 'critical' ? 'bg-red-600/20 text-red-400' : s.severity === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {s.severity || 'medium'}
                  </span>
                </td>
                <td className="p-3 text-gray-500">{s.businessName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create Coaching page**

Create `web/src/client/pages/Coaching.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { fetchApi, CoachingSnapshot } from '../lib/api';

export function Coaching() {
  const [snapshots, setSnapshots] = useState<CoachingSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<CoachingSnapshot[]>('/analytics/coaching').then(s => { setSnapshots(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Team Coaching</h1>

      {snapshots.length === 0 ? (
        <div className="text-gray-500">No coaching data yet. Snapshots generate every Monday based on the previous week's calls.</div>
      ) : (
        <div className="space-y-6">
          {snapshots.map(s => (
            <div key={s.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex justify-between mb-3">
                <h3 className="font-semibold text-gray-200">{s.repName || 'Unknown Rep'}</h3>
                <span className="text-sm text-gray-500">{s.callCount} calls</span>
              </div>
              {s.avgTalkRatio !== null && (
                <div className="text-sm text-gray-400 mb-2">
                  Talk ratio: {s.avgTalkRatio}% (target: 60%) | Questions/call: avg
                </div>
              )}
              {(s.coachingFlags as any[] || []).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(s.coachingFlags as any[]).map((f: any, i: number) => (
                    <div key={i} className={`p-3 rounded-lg ${f.severity === 'high' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
                      <div className="font-medium text-sm text-gray-200">{f.flag}</div>
                      {f.suggestion && <div className="text-xs text-gray-400 mt-1">{f.suggestion}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Wire pages into App.tsx + Layout**

Update `web/src/client/App.tsx` — add imports and routes for SalesIntel, ProductIntel, Coaching.

Update `web/src/client/components/Layout.tsx` — add nav items:
- Sales Intel (/sales) icon: 📊
- Product Intel (/product) icon: 💡
- Coaching (/coaching) icon: 🎯

- [ ] **Step 8: Verify builds**

```bash
cd bot && npx tsc --noEmit
cd ../web && npx vite build
```

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat: add sales intelligence, product intelligence, and coaching web dashboard pages"
```

---

## Task 7: Integration Verification

- [ ] **Step 1: Verify all 3 apps compile**

```bash
cd bot && npx tsc --noEmit
cd ../desktop && npx tsc --noEmit
cd ../web && npx vite build
```

- [ ] **Step 2: Verify schema**

```bash
cd bot && node -e "
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, 'data', 'test-p5.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);
db.exec('CREATE TABLE call_analyses (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id TEXT, zoom_meeting_id TEXT, title TEXT, date INTEGER, outcome TEXT, rep_slack_id TEXT, objections TEXT, pains TEXT, desires TEXT, awareness_level TEXT, summary TEXT, created_at INTEGER)');
db.exec('CREATE TABLE product_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, description TEXT NOT NULL, category TEXT, severity TEXT, business_name TEXT, created_at INTEGER)');
db.exec('CREATE TABLE coaching_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, rep_slack_id TEXT NOT NULL, call_count INTEGER, coaching_flags TEXT, created_at INTEGER)');
db.prepare('INSERT INTO call_analyses (title, outcome, awareness_level) VALUES (?, ?, ?)').run('Test Call', 'demo_scheduled', 'product_aware');
db.prepare('INSERT INTO product_signals (type, description, severity) VALUES (?, ?, ?)').run('feature_request', 'Need automated invoicing', 'high');
console.log('call_analyses:', db.prepare('SELECT * FROM call_analyses').all());
console.log('product_signals:', db.prepare('SELECT * FROM product_signals').all());
console.log('PHASE 5 SCHEMA TESTS PASSED');
db.close();
"
```

- [ ] **Step 3: Commit final**

```bash
git add -A && git commit -m "chore: Phase 5 complete — sales intelligence, coaching, product intelligence" || echo "Nothing to commit"
```

---

## Verification Summary

| What | How to Test | Expected |
|------|-------------|----------|
| Call analysis | Process Zoom transcript | call_analyses row created with objections, pains, outcome |
| Product signals | Process transcript mentioning feature requests | product_signals rows created |
| Friday sales digest | Wait for Friday 10AM cron | Slack message with weekly intelligence |
| Monday coaching | Wait for Monday 9AM cron | Coaching flags DM'd to leadership |
| Sales Intel page | Open /sales in web app | Call outcomes, awareness levels, recent calls |
| Product Intel page | Open /product in web app | Signal breakdown, feature requests, bugs, churn |
| Coaching page | Open /coaching in web app | Per-rep snapshots with coaching flags |
| Schema | Start bot | 3 new tables auto-created |

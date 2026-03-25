import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ─── Call Analyses (per-call sales intelligence) ──────────
export const callAnalyses = sqliteTable('call_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: text('meeting_id'),
  zoomMeetingId: text('zoom_meeting_id'),
  title: text('title'),
  date: integer('date'),
  duration: integer('duration'),
  repSlackId: text('rep_slack_id'),
  repName: text('rep_name'),

  // Business metadata
  businessName: text('business_name'),
  businessType: text('business_type'),
  businessStage: text('business_stage'),
  estimatedRevenue: text('estimated_revenue'),
  employeeCount: text('employee_count'),

  // Sales intel
  objections: text('objections', { mode: 'json' }),
  pains: text('pains', { mode: 'json' }),
  desires: text('desires', { mode: 'json' }),
  awarenessLevel: text('awareness_level'),

  // Call quality
  talkListenRatio: integer('talk_listen_ratio'),
  questionCount: integer('question_count'),
  openQuestionCount: integer('open_question_count'),
  nextSteps: text('next_steps', { mode: 'json' }),
  outcome: text('outcome'),
  riskFlags: text('risk_flags', { mode: 'json' }),

  summary: text('summary'),
  rawAnalysis: text('raw_analysis', { mode: 'json' }),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_call_analyses_rep_slack_id').on(table.repSlackId),
  index('idx_call_analyses_date').on(table.date),
  index('idx_call_analyses_outcome').on(table.outcome),
]);

// ─── Product Signals (feature requests, bugs, churn reasons) ──
export const productSignals = sqliteTable('product_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  description: text('description').notNull(),
  category: text('category'),
  severity: text('severity'),
  verbatimQuote: text('verbatim_quote'),
  businessName: text('business_name'),
  businessRevenue: text('business_revenue'),
  callAnalysisId: integer('call_analysis_id'),
  meetingId: text('meeting_id'),
  reportedBy: text('reported_by'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_product_signals_type').on(table.type),
  index('idx_product_signals_category').on(table.category),
  index('idx_product_signals_severity').on(table.severity),
]);

// ─── Coaching Snapshots (weekly per-rep metrics) ──────────
export const coachingSnapshots = sqliteTable('coaching_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repSlackId: text('rep_slack_id').notNull(),
  repName: text('rep_name'),
  weekStart: integer('week_start'),
  callCount: integer('call_count'),
  avgTalkRatio: integer('avg_talk_ratio'),
  avgQuestionCount: integer('avg_question_count'),
  avgOpenQuestionRatio: integer('avg_open_question_ratio'),
  topObjections: text('top_objections', { mode: 'json' }),
  outcomeBreakdown: text('outcome_breakdown', { mode: 'json' }),
  coachingFlags: text('coaching_flags', { mode: 'json' }),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => [
  index('idx_coaching_snapshots_rep_slack_id').on(table.repSlackId),
  index('idx_coaching_snapshots_week_start').on(table.weekStart),
]);

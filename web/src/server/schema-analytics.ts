// Local copy of analytics schema for web server
// Avoids cross-module import issues with tsx
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const callAnalyses = sqliteTable('call_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: text('meeting_id'),
  zoomMeetingId: text('zoom_meeting_id'),
  title: text('title'),
  date: integer('date'),
  duration: integer('duration'),
  repSlackId: text('rep_slack_id'),
  repName: text('rep_name'),
  businessName: text('business_name'),
  businessType: text('business_type'),
  businessStage: text('business_stage'),
  estimatedRevenue: text('estimated_revenue'),
  employeeCount: text('employee_count'),
  objections: text('objections', { mode: 'json' }),
  pains: text('pains', { mode: 'json' }),
  desires: text('desires', { mode: 'json' }),
  awarenessLevel: text('awareness_level'),
  talkListenRatio: text('talk_listen_ratio'),
  questionCount: integer('question_count'),
  openQuestionCount: integer('open_question_count'),
  nextSteps: text('next_steps', { mode: 'json' }),
  outcome: text('outcome'),
  riskFlags: text('risk_flags', { mode: 'json' }),
  summary: text('summary'),
  rawAnalysis: text('raw_analysis', { mode: 'json' }),
  createdAt: integer('created_at'),
});

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
  createdAt: integer('created_at'),
});

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
  createdAt: integer('created_at'),
});

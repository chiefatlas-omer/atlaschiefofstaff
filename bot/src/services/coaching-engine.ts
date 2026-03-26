import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/connection';
import { callAnalyses, coachingSnapshots } from '../db/schema';
import { anthropic } from '../ai/client';
import { SALES_COACHING_PROMPT, CS_COACHING_PROMPT } from '../ai/call-analysis-prompts';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const SECONDS_PER_DAY = 86400;

// ─── Types ───────────────────────────────────────────────────────────

export type RepRole = 'sales' | 'cs';

export interface CoachingFlag {
  flag: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  observation: string;
  suggestion: string;
  framework?: string;
}

export interface TopStrength {
  what: string;
  example: string;
  keep_doing: string;
}

export interface CoachingResult {
  role: RepRole;
  overall_grade: string;
  grade_reasoning: string;
  top_strength: TopStrength;
  coaching_flags: CoachingFlag[];
  this_week_focus: string;
  script_suggestion: string;
}

export interface CoachingSnapshotResult {
  snapshotId: number;
  repSlackId: string;
  repName: string | null;
  callCount: number;
  avgTalkRatio: number | null;
  avgQuestionCount: number | null;
  avgOpenQuestionRatio: number | null;
  coachingFlags: CoachingFlag[];
  role: RepRole;
  overallGrade: string;
  thisWeekFocus: string;
  scriptSuggestion: string;
  topStrength: TopStrength | null;
  gradeReasoning: string;
}

// ─── Role Detection ──────────────────────────────────────────────────

const SALES_OUTCOMES = new Set(['demo_scheduled', 'closed_won', 'closed_lost', 'follow_up', 'disqualified']);
const CS_TITLE_KEYWORDS = ['onboarding', 'check-in', 'checkin', 'check in', 'kickoff', 'kick-off', 'qbr', 'review', 'renewal', 'health check', 'success'];

function detectRepRole(calls: { outcome: string | null; title: string | null }[]): RepRole {
  let salesSignals = 0;
  let csSignals = 0;

  for (const call of calls) {
    // Check outcome patterns
    if (call.outcome && SALES_OUTCOMES.has(call.outcome)) {
      salesSignals++;
    }

    // Check title patterns
    const titleLower = (call.title ?? '').toLowerCase();
    if (CS_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
      csSignals++;
    }
  }

  // CS if majority of signals point to CS
  if (csSignals > salesSignals && csSignals >= Math.ceil(calls.length * 0.4)) {
    return 'cs';
  }

  // Default to sales
  return 'sales';
}

// ─── Main Coaching Generator ─────────────────────────────────────────

export async function generateCoachingSnapshot(repSlackId: string): Promise<CoachingSnapshotResult> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * SECONDS_PER_DAY;

  // Get rep's calls from last week
  const calls = db
    .select()
    .from(callAnalyses)
    .where(and(eq(callAnalyses.repSlackId, repSlackId), gt(callAnalyses.createdAt, weekAgo)))
    .all();

  const repName = calls.length > 0 ? (calls[0].repName ?? null) : null;
  const callCount = calls.length;

  // Calculate averages
  let sumTalkRatio = 0;
  let talkRatioCount = 0;
  let sumQuestions = 0;
  let questionCount = 0;
  let sumOpenRatio = 0;
  let openRatioCount = 0;

  const outcomeBreakdown: Record<string, number> = {};
  const allObjections: string[] = [];

  for (const call of calls) {
    if (call.talkListenRatio !== null && call.talkListenRatio !== undefined) {
      sumTalkRatio += call.talkListenRatio;
      talkRatioCount++;
    }
    if (call.questionCount !== null && call.questionCount !== undefined) {
      sumQuestions += call.questionCount;
      questionCount++;
      if (call.openQuestionCount !== null && call.openQuestionCount !== undefined && call.questionCount > 0) {
        sumOpenRatio += Math.round((call.openQuestionCount / call.questionCount) * 100);
        openRatioCount++;
      }
    }
    const outcome = call.outcome ?? 'unknown';
    outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] ?? 0) + 1;

    const objections = (call.objections as string[] | null) ?? [];
    allObjections.push(...objections);
  }

  const avgTalkRatio = talkRatioCount > 0 ? Math.round(sumTalkRatio / talkRatioCount) : null;
  const avgQuestionCount = questionCount > 0 ? Math.round(sumQuestions / questionCount) : null;
  const avgOpenQuestionRatio = openRatioCount > 0 ? Math.round(sumOpenRatio / openRatioCount) : null;

  // Top objections for context
  const objFreq: Record<string, number> = {};
  for (const obj of allObjections) {
    const key = obj.trim().toLowerCase();
    objFreq[key] = (objFreq[key] ?? 0) + 1;
  }
  const topObjections = Object.entries(objFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  // Detect role from call patterns
  const role = detectRepRole(calls.map((c) => ({ outcome: c.outcome, title: c.title })));

  // Build call data summary for Claude
  const callDataSummary = {
    repName: repName ?? repSlackId,
    callCount,
    avgTalkRatio,
    avgQuestionCount,
    avgOpenQuestionRatio,
    outcomeBreakdown,
    topObjections,
    callSummaries: calls.map((c) => ({
      title: c.title,
      outcome: c.outcome,
      talkRatio: c.talkListenRatio,
      questions: c.questionCount,
      openQuestions: c.openQuestionCount,
      nextSteps: c.nextSteps,
      riskFlags: c.riskFlags,
      summary: c.summary,
    })),
  };

  // Select prompt based on role
  const promptTemplate = role === 'cs' ? CS_COACHING_PROMPT : SALES_COACHING_PROMPT;
  const prompt = promptTemplate
    .replace('{{REP_NAME}}', repName ?? repSlackId)
    .replace('{{CALL_DATA}}', JSON.stringify(callDataSummary, null, 2));

  let coachingFlags: CoachingFlag[] = [];
  let overallGrade = 'N/A';
  let gradeReasoning = '';
  let thisWeekFocus = '';
  let scriptSuggestion = '';
  let topStrength: TopStrength | null = null;

  if (callCount > 0) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      });

      const rawText = message.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('');

      const parsed = JSON.parse(rawText) as CoachingResult;
      coachingFlags = (parsed.coaching_flags ?? []).map((f) => ({
        flag: f.flag,
        severity: f.severity,
        observation: f.observation,
        suggestion: f.suggestion,
        framework: f.framework,
      }));
      overallGrade = parsed.overall_grade ?? 'N/A';
      gradeReasoning = parsed.grade_reasoning ?? '';
      thisWeekFocus = parsed.this_week_focus ?? '';
      scriptSuggestion = parsed.script_suggestion ?? '';
      topStrength = parsed.top_strength ?? null;
    } catch (err) {
      console.error('[coaching-engine] Failed to get/parse Claude coaching response:', err);
    }
  }

  // Store in coachingSnapshots — coachingFlags JSON field holds the full coaching result
  const fullCoachingResult = {
    role,
    overall_grade: overallGrade,
    grade_reasoning: gradeReasoning,
    top_strength: topStrength,
    coaching_flags: coachingFlags,
    this_week_focus: thisWeekFocus,
    script_suggestion: scriptSuggestion,
  };

  const weekStart = weekAgo;
  const inserted = db
    .insert(coachingSnapshots)
    .values({
      repSlackId,
      repName: repName ?? null,
      weekStart,
      callCount,
      avgTalkRatio: avgTalkRatio ?? null,
      avgQuestionCount: avgQuestionCount ?? null,
      avgOpenQuestionRatio: avgOpenQuestionRatio ?? null,
      topObjections,
      outcomeBreakdown,
      coachingFlags: fullCoachingResult,
      createdAt: now,
    })
    .returning({ id: coachingSnapshots.id })
    .get();

  console.log(
    `[coaching-engine] Snapshot stored for ${repSlackId}: id=${inserted.id}, role=${role}, grade=${overallGrade}, calls=${callCount}, flags=${coachingFlags.length}`,
  );

  return {
    snapshotId: inserted.id,
    repSlackId,
    repName,
    callCount,
    avgTalkRatio,
    avgQuestionCount,
    avgOpenQuestionRatio,
    coachingFlags,
    role,
    overallGrade,
    thisWeekFocus,
    scriptSuggestion,
    topStrength,
    gradeReasoning,
  };
}

// ─── Format for Leadership (detailed flags) ──────────────────────────

export function formatCoachingForSlack(repName: string, snapshot: CoachingSnapshotResult): string {
  const lines: string[] = [];
  const gradeEmoji: Record<string, string> = { A: ':star:', B: ':large_blue_circle:', C: ':large_yellow_circle:', D: ':large_orange_circle:', F: ':red_circle:' };
  const roleLabel = snapshot.role === 'cs' ? 'Customer Success' : 'Sales';

  lines.push(`*Coaching Report: ${repName}* ${gradeEmoji[snapshot.overallGrade] ?? ''} Grade: *${snapshot.overallGrade}*`);
  lines.push(`_${roleLabel} rep | ${snapshot.callCount} calls this week_`);
  lines.push(`_${snapshot.gradeReasoning}_`);
  lines.push('');

  if (snapshot.coachingFlags.length === 0) {
    lines.push('No coaching flags this week. Keep up the great work!');
    return lines.join('\n');
  }

  const bySeverity: Record<string, CoachingFlag[]> = {};
  for (const flag of snapshot.coachingFlags) {
    if (!bySeverity[flag.severity]) bySeverity[flag.severity] = [];
    bySeverity[flag.severity].push(flag);
  }

  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const severityEmoji: Record<string, string> = {
    critical: ':red_circle:',
    high: ':large_orange_circle:',
    medium: ':large_yellow_circle:',
    low: ':white_circle:',
  };

  for (const severity of severityOrder) {
    const flagsForSeverity = bySeverity[severity];
    if (!flagsForSeverity || flagsForSeverity.length === 0) continue;

    lines.push(`${severityEmoji[severity] ?? ''} *${severity.charAt(0).toUpperCase() + severity.slice(1)} Priority*`);
    for (const flag of flagsForSeverity) {
      lines.push(`  *${flag.flag}*${flag.framework ? ` _(${flag.framework})_` : ''}`);
      lines.push(`  _${flag.observation}_`);
      lines.push(`  :bulb: ${flag.suggestion}`);
      lines.push('');
    }
  }

  if (snapshot.thisWeekFocus) {
    lines.push(`:dart: *This Week's Focus:* ${snapshot.thisWeekFocus}`);
  }

  return lines.join('\n');
}

// ─── Format for Rep (motivational, short) ────────────────────────────

export function formatCoachingForRep(repName: string, snapshot: CoachingSnapshotResult): string {
  const lines: string[] = [];
  const firstName = repName.split(' ')[0] ?? repName;

  // Lead with strength
  if (snapshot.topStrength) {
    lines.push(`:fire: *Hey ${firstName}* — great week! Here's what stood out:`);
    lines.push(`*You crushed it on:* ${snapshot.topStrength.what}`);
    lines.push(`_${snapshot.topStrength.keep_doing}_`);
  } else {
    lines.push(`:wave: *Hey ${firstName}* — here's your weekly coaching recap.`);
  }

  lines.push('');

  // Grade
  const gradeEmoji: Record<string, string> = { A: ':star:', B: ':muscle:', C: ':chart_with_upwards_trend:', D: ':point_up:', F: ':point_up:' };
  lines.push(`${gradeEmoji[snapshot.overallGrade] ?? ''} *Weekly Grade: ${snapshot.overallGrade}* — ${snapshot.gradeReasoning}`);
  lines.push('');

  // This week's focus — the ONE thing
  if (snapshot.thisWeekFocus) {
    lines.push(`:dart: *This week, focus on:* ${snapshot.thisWeekFocus}`);
  }

  // Script suggestion — ready to use
  if (snapshot.scriptSuggestion) {
    lines.push('');
    lines.push(`:speech_balloon: *Try this on your next call:*`);
    lines.push(`> _"${snapshot.scriptSuggestion}"_`);
  }

  lines.push('');
  lines.push(`You had ${snapshot.callCount} call${snapshot.callCount !== 1 ? 's' : ''} this week. Keep building momentum!`);

  return lines.join('\n');
}

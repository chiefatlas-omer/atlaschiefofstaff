import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/connection';
import { callAnalyses, coachingSnapshots } from '../db/schema';
import { anthropic } from '../ai/client';
import { COACHING_SUMMARY_PROMPT } from '../ai/call-analysis-prompts';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const SECONDS_PER_DAY = 86400;

export interface CoachingFlag {
  flag: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  observation: string;
  suggestion: string;
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
}

interface CoachingResponseJson {
  coachingFlags?: CoachingFlag[];
  strengths?: string[];
  focusArea?: string;
}

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

  // Call Claude for coaching flags
  const prompt = COACHING_SUMMARY_PROMPT
    .replace('{{REP_NAME}}', repName ?? repSlackId)
    .replace('{{CALL_DATA}}', JSON.stringify(callDataSummary, null, 2));

  let coachingFlags: CoachingFlag[] = [];

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

      const parsed = JSON.parse(rawText) as CoachingResponseJson;
      coachingFlags = parsed.coachingFlags ?? [];
    } catch (err) {
      console.error('[coaching-engine] Failed to get/parse Claude coaching response:', err);
    }
  }

  // Store in coachingSnapshots
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
      coachingFlags,
      createdAt: now,
    })
    .returning({ id: coachingSnapshots.id })
    .get();

  console.log(
    `[coaching-engine] Snapshot stored for ${repSlackId}: id=${inserted.id}, calls=${callCount}, flags=${coachingFlags.length}`,
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
  };
}

export function formatCoachingForSlack(repName: string, flags: CoachingFlag[]): string {
  const lines: string[] = [];

  lines.push(`*Coaching Report for ${repName}*`);
  lines.push('');

  if (flags.length === 0) {
    lines.push('No coaching flags this week. Keep up the great work!');
    return lines.join('\n');
  }

  const bySeverity: Record<string, CoachingFlag[]> = {};
  for (const flag of flags) {
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
      lines.push(`  *${flag.flag}*`);
      lines.push(`  _${flag.observation}_`);
      lines.push(`  :bulb: ${flag.suggestion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

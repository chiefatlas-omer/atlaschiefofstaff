import { and, gt, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { callAnalyses, productSignals } from '../db/schema';

const SECONDS_PER_DAY = 86400;

export interface OutcomeBreakdown {
  [outcome: string]: number;
}

export interface ObjectionCount {
  text: string;
  count: number;
}

export interface PainCount {
  text: string;
  count: number;
}

export interface DesireCount {
  text: string;
  count: number;
}

export interface AwarenessBreakdown {
  [level: string]: number;
}

export interface RiskFlagEntry {
  flag: string;
  callTitle: string | null;
  repName: string | null;
}

export interface ProductSignalEntry {
  type: string;
  description: string;
  category: string | null;
  severity: string | null;
  businessName: string | null;
  verbatimQuote: string | null;
}

export interface RepSummary {
  repSlackId: string | null;
  repName: string | null;
  callCount: number;
  outcomes: OutcomeBreakdown;
}

export interface WeeklyDigest {
  periodStart: number;
  periodEnd: number;
  totalCalls: number;
  outcomeBreakdown: OutcomeBreakdown;
  topObjections: ObjectionCount[];
  topPains: PainCount[];
  topDesires: DesireCount[];
  awarenessBreakdown: AwarenessBreakdown;
  highSeverityRiskFlags: RiskFlagEntry[];
  productSignals: ProductSignalEntry[];
  perRepSummaries: RepSummary[];
}

function countFrequency(items: string[]): Array<{ text: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const item of items) {
    const key = item.trim().toLowerCase();
    freq[key] = (freq[key] ?? 0) + 1;
  }
  return Object.entries(freq)
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);
}

export async function generateWeeklyDigest(): Promise<WeeklyDigest> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * SECONDS_PER_DAY;

  const calls = db
    .select()
    .from(callAnalyses)
    .where(gt(callAnalyses.createdAt, weekAgo))
    .orderBy(desc(callAnalyses.createdAt))
    .all();

  const signals = db
    .select()
    .from(productSignals)
    .where(gt(productSignals.createdAt, weekAgo))
    .orderBy(desc(productSignals.createdAt))
    .all();

  // Outcome breakdown
  const outcomeBreakdown: OutcomeBreakdown = {};
  for (const call of calls) {
    const outcome = call.outcome ?? 'unknown';
    outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] ?? 0) + 1;
  }

  // Top objections, pains, desires
  const allObjections: string[] = [];
  const allPains: string[] = [];
  const allDesires: string[] = [];

  for (const call of calls) {
    const objections = (call.objections as string[] | null) ?? [];
    const pains = (call.pains as string[] | null) ?? [];
    const desires = (call.desires as string[] | null) ?? [];
    allObjections.push(...objections);
    allPains.push(...pains);
    allDesires.push(...desires);
  }

  const topObjections = countFrequency(allObjections).slice(0, 10);
  const topPains = countFrequency(allPains).slice(0, 10);
  const topDesires = countFrequency(allDesires).slice(0, 10);

  // Awareness breakdown
  const awarenessBreakdown: AwarenessBreakdown = {};
  for (const call of calls) {
    const level = call.awarenessLevel ?? 'unknown';
    awarenessBreakdown[level] = (awarenessBreakdown[level] ?? 0) + 1;
  }

  // High-severity risk flags
  const highSeverityRiskFlags: RiskFlagEntry[] = [];
  for (const call of calls) {
    const flags = (call.riskFlags as string[] | null) ?? [];
    for (const flag of flags) {
      highSeverityRiskFlags.push({
        flag,
        callTitle: call.title ?? null,
        repName: call.repName ?? null,
      });
    }
  }

  // Product signals
  const productSignalEntries: ProductSignalEntry[] = signals.map((s) => ({
    type: s.type,
    description: s.description,
    category: s.category ?? null,
    severity: s.severity ?? null,
    businessName: s.businessName ?? null,
    verbatimQuote: s.verbatimQuote ?? null,
  }));

  // Per-rep summaries
  const repMap: Record<string, RepSummary> = {};
  for (const call of calls) {
    const repKey = call.repSlackId ?? 'unknown';
    if (!repMap[repKey]) {
      repMap[repKey] = {
        repSlackId: call.repSlackId ?? null,
        repName: call.repName ?? null,
        callCount: 0,
        outcomes: {},
      };
    }
    repMap[repKey].callCount += 1;
    const outcome = call.outcome ?? 'unknown';
    repMap[repKey].outcomes[outcome] = (repMap[repKey].outcomes[outcome] ?? 0) + 1;
  }

  return {
    periodStart: weekAgo,
    periodEnd: now,
    totalCalls: calls.length,
    outcomeBreakdown,
    topObjections,
    topPains,
    topDesires,
    awarenessBreakdown,
    highSeverityRiskFlags,
    productSignals: productSignalEntries,
    perRepSummaries: Object.values(repMap),
  };
}

export function formatDigestForSlack(digest: WeeklyDigest): string {
  const lines: string[] = [];

  const startDate = new Date(digest.periodStart * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endDate = new Date(digest.periodEnd * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  lines.push(`*Weekly Sales Intelligence Digest* (${startDate} – ${endDate})`);
  lines.push(`*Total Calls Analyzed:* ${digest.totalCalls}`);
  lines.push('');

  // Outcome breakdown
  if (Object.keys(digest.outcomeBreakdown).length > 0) {
    lines.push('*Outcome Breakdown*');
    for (const [outcome, count] of Object.entries(digest.outcomeBreakdown)) {
      lines.push(`  • ${outcome.replace(/_/g, ' ')}: ${count}`);
    }
    lines.push('');
  }

  // Top objections
  if (digest.topObjections.length > 0) {
    lines.push('*Top Objections*');
    for (const obj of digest.topObjections.slice(0, 5)) {
      lines.push(`  • "${obj.text}" (${obj.count}x)`);
    }
    lines.push('');
  }

  // Top pains
  if (digest.topPains.length > 0) {
    lines.push('*Top Pain Points*');
    for (const pain of digest.topPains.slice(0, 5)) {
      lines.push(`  • "${pain.text}" (${pain.count}x)`);
    }
    lines.push('');
  }

  // Top desires
  if (digest.topDesires.length > 0) {
    lines.push('*Top Desires / Goals*');
    for (const desire of digest.topDesires.slice(0, 5)) {
      lines.push(`  • "${desire.text}" (${desire.count}x)`);
    }
    lines.push('');
  }

  // Awareness breakdown
  if (Object.keys(digest.awarenessBreakdown).length > 0) {
    lines.push('*Prospect Awareness Levels*');
    for (const [level, count] of Object.entries(digest.awarenessBreakdown)) {
      lines.push(`  • ${level.replace(/_/g, ' ')}: ${count}`);
    }
    lines.push('');
  }

  // High-severity risk flags
  if (digest.highSeverityRiskFlags.length > 0) {
    lines.push('*Risk Flags*');
    for (const rf of digest.highSeverityRiskFlags.slice(0, 10)) {
      const who = rf.repName ? ` (${rf.repName})` : '';
      lines.push(`  :warning: ${rf.flag}${who}`);
    }
    lines.push('');
  }

  // Product signals
  if (digest.productSignals.length > 0) {
    lines.push('*Product Signals*');
    const byType: Record<string, number> = {};
    for (const s of digest.productSignals) {
      byType[s.type] = (byType[s.type] ?? 0) + 1;
    }
    for (const [type, count] of Object.entries(byType)) {
      lines.push(`  • ${type.replace(/_/g, ' ')}: ${count}`);
    }
    lines.push('');
  }

  // Per-rep summaries
  if (digest.perRepSummaries.length > 0) {
    lines.push('*Per Rep Summary*');
    for (const rep of digest.perRepSummaries) {
      const name = rep.repName ?? rep.repSlackId ?? 'Unknown';
      const outcomes = Object.entries(rep.outcomes)
        .map(([o, c]) => `${o.replace(/_/g, ' ')}:${c}`)
        .join(', ');
      lines.push(`  • ${name}: ${rep.callCount} calls (${outcomes})`);
    }
  }

  return lines.join('\n');
}

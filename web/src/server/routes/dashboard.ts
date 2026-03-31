import { Router } from 'express';
import { db } from '../db';
import { tasks, teamMembers, escalationTargets } from '../../../../bot/src/db/schema';
import {
  meetings,
  documents,
  decisions,
  knowledgeEntries,
  topicCounts,
  qaInteractions,
} from '../../../../bot/src/db/schema';
import { callAnalyses, productSignals, coachingSnapshots } from '../schema-analytics';
import { eq, ne, and, lt, count, desc, gte, gt, isNotNull } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// GET /api/dashboard — aggregated metrics for all sections
router.get('/dashboard', (req: any, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    // Tasks
    const totalTasks = db.select({ count: count() }).from(tasks).get();
    const openTasks = db
      .select({ count: count() })
      .from(tasks)
      .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
      .get();
    const completedTasks = db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, 'COMPLETED'))
      .get();
    const overdueTasks = db
      .select({ count: count() })
      .from(tasks)
      .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED'), lt(tasks.deadline, now)))
      .get();

    // Meetings (last 30 days — date is Unix seconds)
    const totalMeetings = db.select({ count: count() }).from(meetings).get();
    const recentMeetings = db
      .select({ count: count() })
      .from(meetings)
      .where(gte(meetings.date, thirtyDaysAgo))
      .get();
    // Meetings prepped = meetings with a non-null summary (prep brief was generated)
    const meetingsPrepped = db
      .select({ count: count() })
      .from(meetings)
      .where(isNotNull(meetings.summary))
      .get();

    // SOPs (documents of type 'sop')
    const totalSops = db
      .select({ count: count() })
      .from(documents)
      .where(eq(documents.type, 'sop'))
      .get();
    const publishedSops = db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.type, 'sop'), eq(documents.status, 'published')))
      .get();

    // Decisions
    const totalDecisions = db.select({ count: count() }).from(decisions).get();
    const recentDecisions = db
      .select({ count: count() })
      .from(decisions)
      .where(gte(decisions.createdAt, thirtyDaysAgo))
      .get();

    // Knowledge bot
    const totalKnowledgeEntries = db.select({ count: count() }).from(knowledgeEntries).get();
    const totalQaInteractions = db.select({ count: count() }).from(qaInteractions).get();
    const correctAnswers = db
      .select({ count: count() })
      .from(qaInteractions)
      .where(eq(qaInteractions.wasCorrect, true))
      .get();

    // Topics
    const totalTopics = db.select({ count: count() }).from(topicCounts).get();
    const sopGeneratedTopics = db
      .select({ count: count() })
      .from(topicCounts)
      .where(eq(topicCounts.sopGenerated, true))
      .get();

    res.json({
      tasks: {
        total: totalTasks?.count ?? 0,
        open: openTasks?.count ?? 0,
        completed: completedTasks?.count ?? 0,
        overdue: overdueTasks?.count ?? 0,
      },
      meetings: {
        total: totalMeetings?.count ?? 0,
        recentThirtyDays: recentMeetings?.count ?? 0,
        meetingsPrepped: meetingsPrepped?.count ?? 0,
      },
      sops: {
        total: totalSops?.count ?? 0,
        published: publishedSops?.count ?? 0,
      },
      decisions: {
        total: totalDecisions?.count ?? 0,
        recentThirtyDays: recentDecisions?.count ?? 0,
      },
      knowledgeBot: {
        entries: totalKnowledgeEntries?.count ?? 0,
        interactions: totalQaInteractions?.count ?? 0,
        correctAnswers: correctAnswers?.count ?? 0,
      },
      topics: {
        total: totalTopics?.count ?? 0,
        sopGenerated: sopGeneratedTopics?.count ?? 0,
      },
    });
  } catch (err) {
    console.error('[dashboard] GET /dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// GET /api/analytics/calls — recent call analyses (limit 50, ordered by date DESC)
router.get('/analytics/calls', (req: any, res) => {
  try {
    const calls = (req.userId && !req.isAdmin)
      ? db.select().from(callAnalyses).where(eq(callAnalyses.repSlackId, req.userId)).orderBy(desc(callAnalyses.date)).limit(50).all()
      : db.select().from(callAnalyses).orderBy(desc(callAnalyses.date)).limit(50).all();
    res.json(calls);
  } catch (err) {
    console.error('[analytics] GET /calls error:', err);
    res.status(500).json({ error: 'Failed to fetch call analyses' });
  }
});

// GET /api/analytics/digest — weekly digest data (calls from last 7 days + aggregated breakdown)
router.get('/analytics/digest', (req: any, res) => {
  try {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

    const digestConditions = [gt(callAnalyses.createdAt, weekAgo)];
    // Admin can filter by specific rep via query param
    const filterRep = req.query?.repSlackId as string | undefined;
    if (filterRep && req.isAdmin) {
      digestConditions.push(eq(callAnalyses.repSlackId, filterRep));
    } else if (req.userId && !req.isAdmin) {
      digestConditions.push(eq(callAnalyses.repSlackId, req.userId));
    }
    const calls = db
      .select()
      .from(callAnalyses)
      .where(and(...digestConditions))
      .orderBy(desc(callAnalyses.createdAt))
      .all();

    // Outcome breakdown
    const outcomeBreakdown: Record<string, number> = {};
    for (const call of calls) {
      const outcome = call.outcome ?? 'unknown';
      outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] ?? 0) + 1;
    }

    // Awareness breakdown
    const awarenessBreakdown: Record<string, number> = {};
    for (const call of calls) {
      const level = call.awarenessLevel ?? 'unknown';
      awarenessBreakdown[level] = (awarenessBreakdown[level] ?? 0) + 1;
    }

    // Avg talk ratio across calls this week
    const talkRatios = calls
      .map(c => c.talkListenRatio)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgTalkRatio = talkRatios.length > 0
      ? Math.round(talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length)
      : null;

    // Avg questions per call this week
    const questionCounts = calls
      .map(c => c.questionCount)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgQuestionsPerCall = questionCounts.length > 0
      ? Math.round((questionCounts.reduce((a, b) => a + b, 0) / questionCounts.length) * 10) / 10
      : null;

    // Count coaching flags generated this week (from coaching snapshots)
    const coachingThisWeek = db
      .select()
      .from(coachingSnapshots)
      .where(gt(coachingSnapshots.weekStart, weekAgo))
      .all();
    let coachingFlagCount = 0;
    for (const snap of coachingThisWeek) {
      const flags = snap.coachingFlags as any[] | null;
      coachingFlagCount += flags?.length ?? 0;
    }

    res.json({
      periodStart: weekAgo,
      periodEnd: Math.floor(Date.now() / 1000),
      totalCalls: calls.length,
      avgTalkRatio,
      avgQuestionsPerCall,
      coachingFlagCount,
      outcomeBreakdown,
      awarenessBreakdown,
      calls,
    });
  } catch (err) {
    console.error('[analytics] GET /digest error:', err);
    res.status(500).json({ error: 'Failed to fetch digest data' });
  }
});

// GET /api/analytics/rep-summary?repSlackId=xxx — executive coaching summary for a specific rep
router.get('/analytics/rep-summary', async (req: any, res) => {
  try {
    if (!req.isAdmin) {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const repSlackId = req.query?.repSlackId as string;
    if (!repSlackId) {
      res.status(400).json({ error: 'repSlackId query param required' });
      return;
    }

    // All calls for this rep (last 30 days)
    const monthAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    const calls = db.select().from(callAnalyses)
      .where(and(eq(callAnalyses.repSlackId, repSlackId), gt(callAnalyses.createdAt, monthAgo)))
      .orderBy(desc(callAnalyses.createdAt))
      .all();

    const repName = calls[0]?.repName ?? repSlackId;

    // Aggregate metrics
    const talkRatios = calls.map(c => c.talkListenRatio).filter((v): v is number => v !== null);
    const avgTalkRatio = talkRatios.length > 0 ? Math.round(talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length) : null;
    const questionCounts = calls.map(c => c.questionCount).filter((v): v is number => v !== null);
    const avgQuestions = questionCounts.length > 0 ? Math.round(questionCounts.reduce((a, b) => a + b, 0) / questionCounts.length) : null;

    // Outcome breakdown
    const outcomes: Record<string, number> = {};
    for (const c of calls) { const o = c.outcome ?? 'unknown'; outcomes[o] = (outcomes[o] ?? 0) + 1; }

    // Top objections across all calls
    const allObjections: string[] = [];
    for (const c of calls) {
      try { const obj = JSON.parse(c.objections as string ?? '[]'); allObjections.push(...obj); } catch {}
    }
    const objFreq: Record<string, number> = {};
    for (const o of allObjections) { const k = o.trim().toLowerCase(); objFreq[k] = (objFreq[k] ?? 0) + 1; }
    const topObjections = Object.entries(objFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text, count]) => ({ text, count }));

    // Top pains across all calls
    const allPains: string[] = [];
    for (const c of calls) {
      try { const p = JSON.parse(c.pains as string ?? '[]'); allPains.push(...p); } catch {}
    }
    const painFreq: Record<string, number> = {};
    for (const p of allPains) { const k = p.trim().toLowerCase(); painFreq[k] = (painFreq[k] ?? 0) + 1; }
    const topPains = Object.entries(painFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text, count]) => ({ text, count }));

    // Latest coaching snapshots
    const snapshots = db.select().from(coachingSnapshots)
      .where(eq(coachingSnapshots.repSlackId, repSlackId))
      .orderBy(desc(coachingSnapshots.weekStart))
      .limit(4)
      .all();

    // Aggregate coaching flags across snapshots
    const flagFreq: Record<string, { count: number; severity: string }> = {};
    for (const s of snapshots) {
      const flags = (s.coachingFlags as any[]) ?? [];
      for (const f of flags) {
        if (!flagFreq[f.flag]) flagFreq[f.flag] = { count: 0, severity: f.severity };
        flagFreq[f.flag].count++;
      }
    }
    const topFlags = Object.entries(flagFreq)
      .sort((a, b) => {
        const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (sev[a[1].severity] ?? 4) - (sev[b[1].severity] ?? 4);
      })
      .slice(0, 5)
      .map(([flag, { count, severity }]) => ({ flag, count, severity }));

    // Generate AI coaching narrative
    let coachingNarrative = '';
    if (anthropicClient && calls.length > 0) {
      try {
        const summaryData = JSON.stringify({
          repName,
          totalCalls: calls.length,
          avgTalkRatio,
          avgQuestions,
          outcomes,
          topObjections: topObjections.slice(0, 3),
          topPains: topPains.slice(0, 3),
          topFlags: topFlags.slice(0, 3),
        });
        const msg = await anthropicClient.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `You are an expert sales/CS coach. Based on this rep's 30-day performance data, write a 2-3 sentence executive coaching brief for their manager. Be specific, actionable, and direct. Reference exact numbers. Suggest one concrete technique or phrase they should practice. No headers or bullets — just a confident paragraph.

Data: ${summaryData}`,
          }],
        });
        coachingNarrative = msg.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
      } catch (aiErr) {
        console.error('[analytics] AI coaching narrative failed (non-fatal):', aiErr);
      }
    }

    res.json({
      repSlackId,
      repName,
      totalCalls: calls.length,
      avgTalkRatio,
      avgQuestions,
      outcomes,
      topObjections,
      topPains,
      topFlags,
      coachingNarrative,
      recentGrades: snapshots.map(s => ({
        weekStart: s.weekStart,
        callCount: s.callCount,
      })),
    });
  } catch (err) {
    console.error('[analytics] GET /rep-summary error:', err);
    res.status(500).json({ error: 'Failed to fetch rep summary' });
  }
});

// GET /api/analytics/product — product signals with type breakdown
router.get('/analytics/product', (_req, res) => {
  try {
    const signals = db
      .select()
      .from(productSignals)
      .orderBy(desc(productSignals.createdAt))
      .all();

    // Type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const s of signals) {
      typeBreakdown[s.type] = (typeBreakdown[s.type] ?? 0) + 1;
    }

    res.json({ signals, typeBreakdown });
  } catch (err) {
    console.error('[analytics] GET /product error:', err);
    res.status(500).json({ error: 'Failed to fetch product signals' });
  }
});

// GET /api/analytics/coaching — coaching snapshots (deduplicated: latest per rep per week)
router.get('/analytics/coaching', (req: any, res) => {
  try {
    const allSnapshots = (req.userId && !req.isAdmin)
      ? db.select().from(coachingSnapshots).where(eq(coachingSnapshots.repSlackId, req.userId)).orderBy(desc(coachingSnapshots.weekStart)).limit(50).all()
      : db.select().from(coachingSnapshots).orderBy(desc(coachingSnapshots.weekStart)).limit(50).all();

    // Deduplicate: keep only the latest snapshot per rep per weekStart
    const seen = new Set<string>();
    const deduped = allSnapshots.filter((s) => {
      const key = `${s.repSlackId}_${s.weekStart}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(deduped.slice(0, 20));
  } catch (err) {
    console.error('[analytics] GET /coaching error:', err);
    res.status(500).json({ error: 'Failed to fetch coaching snapshots' });
  }
});

// GET /api/analytics/outcomes — outcome-focused metrics across all time periods
router.get('/analytics/outcomes', (_req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;
    const twoWeeksAgo = now - 14 * 86400;
    const monthAgo = now - 30 * 86400;

    // ── Tasks ────────────────────────────────────────────────
    const allTasks = db.select().from(tasks).all();
    const tasksThisWeek = allTasks.filter(t => {
      const ts = t.createdAt instanceof Date ? Math.floor(t.createdAt.getTime() / 1000) : Number(t.createdAt);
      return ts >= weekAgo;
    });
    const tasksLastWeek = allTasks.filter(t => {
      const ts = t.createdAt instanceof Date ? Math.floor(t.createdAt.getTime() / 1000) : Number(t.createdAt);
      return ts >= twoWeeksAgo && ts < weekAgo;
    });
    const completedThisMonth = allTasks.filter(t => {
      if (t.status !== 'COMPLETED') return false;
      const ts = t.completedAt instanceof Date ? Math.floor(t.completedAt.getTime() / 1000) : (t.completedAt ? Number(t.completedAt) : null);
      return ts != null && ts >= monthAgo;
    });
    const completedThisWeek = allTasks.filter(t => {
      if (t.status !== 'COMPLETED') return false;
      const ts = t.completedAt instanceof Date ? Math.floor(t.completedAt.getTime() / 1000) : (t.completedAt ? Number(t.completedAt) : null);
      return ts != null && ts >= weekAgo;
    });
    const completedLastWeek = allTasks.filter(t => {
      if (t.status !== 'COMPLETED') return false;
      const ts = t.completedAt instanceof Date ? Math.floor(t.completedAt.getTime() / 1000) : (t.completedAt ? Number(t.completedAt) : null);
      return ts != null && ts >= twoWeeksAgo && ts < weekAgo;
    });
    // Overdue prevented = tasks completed before their deadline
    const overduePreventedThisMonth = completedThisMonth.filter(t => {
      if (!t.deadline) return false;
      const dlTs = t.deadline instanceof Date ? Math.floor(t.deadline.getTime() / 1000) : Number(t.deadline);
      const compTs = t.completedAt instanceof Date ? Math.floor(t.completedAt.getTime() / 1000) : (t.completedAt ? Number(t.completedAt) : null);
      return compTs != null && compTs <= dlTs;
    });
    const totalOpen = allTasks.filter(t => ['DETECTED', 'CONFIRMED'].includes(t.status)).length;
    const totalCompleted = allTasks.filter(t => t.status === 'COMPLETED').length;
    const totalCreated = allTasks.length;

    // ── Meetings ─────────────────────────────────────────────
    const allMeetings = db.select().from(meetings).all();
    const meetingsThisWeek = allMeetings.filter(m => {
      const ts = Number(m.createdAt);
      return ts >= weekAgo;
    });
    const meetingsLastWeek = allMeetings.filter(m => {
      const ts = Number(m.createdAt);
      return ts >= twoWeeksAgo && ts < weekAgo;
    });
    // Meetings "prepped" = those with a summary (briefing delivered)
    const meetingsPreppedhisWeek = meetingsThisWeek.filter(m => m.summary).length;
    const meetingsPreppedLastWeek = meetingsLastWeek.filter(m => m.summary).length;
    const meetingsPreppedThisMonth = allMeetings.filter(m => {
      const ts = Number(m.createdAt);
      return ts >= monthAgo && Boolean(m.summary);
    }).length;

    // ── Call Analyses / Follow-ups ────────────────────────────
    const allCalls = db.select().from(callAnalyses).all();
    const callsThisWeek = allCalls.filter(c => {
      return (c.createdAt ?? 0) >= weekAgo;
    });
    const callsLastWeek = allCalls.filter(c => {
      return (c.createdAt ?? 0) >= twoWeeksAgo && (c.createdAt ?? 0) < weekAgo;
    });
    const callsThisMonth = allCalls.filter(c => (c.createdAt ?? 0) >= monthAgo);
    // Follow-ups = calls where outcome field is non-null (analysis generated follow-up email)
    const followUpsThisWeek = callsThisWeek.filter(c => c.outcome).length;
    const followUpsLastWeek = callsLastWeek.filter(c => c.outcome).length;
    const followUpsThisMonth = callsThisMonth.filter(c => c.outcome).length;

    // ── QA Interactions (Knowledge Queries) ───────────────────
    const allQA = db.select().from(qaInteractions).all();
    const qaThisWeek = allQA.filter(q => {
      const ts = q.createdAt ?? 0;
      return ts >= weekAgo;
    });
    const qaLastWeek = allQA.filter(q => {
      const ts = q.createdAt ?? 0;
      return ts >= twoWeeksAgo && ts < weekAgo;
    });
    const qaThisMonth = allQA.filter(q => (q.createdAt ?? 0) >= monthAgo);

    // ── Product Signals ───────────────────────────────────────
    const allSignals = db.select().from(productSignals).all();
    const signalsThisWeek = allSignals.filter(s => (s.createdAt ?? 0) >= weekAgo);
    const signalsLastWeek = allSignals.filter(s => (s.createdAt ?? 0) >= twoWeeksAgo && (s.createdAt ?? 0) < weekAgo);
    const signalsThisMonth = allSignals.filter(s => (s.createdAt ?? 0) >= monthAgo);
    const featureRequests = signalsThisMonth.filter(s => s.type === 'feature_request').length;
    const bugReports = signalsThisMonth.filter(s => s.type === 'bug_report').length;
    const churnReasons = signalsThisMonth.filter(s => s.type === 'churn_reason').length;

    // ── Documents / SOPs ──────────────────────────────────────
    const allDocs = db.select().from(documents).all();
    const sopsAll = allDocs.filter(d => d.type === 'sop');
    const sopsThisMonth = sopsAll.filter(d => d.createdAt >= monthAgo);
    const docsIngestedThisMonth = allDocs.filter(d => d.createdAt >= monthAgo).length;

    // ── Knowledge Entries ─────────────────────────────────────
    const allKnowledge = db.select().from(knowledgeEntries).all();
    const knowledgeThisMonth = allKnowledge.filter(k => k.createdAt >= monthAgo).length;

    // ── Coaching ──────────────────────────────────────────────
    const allCoaching = db.select().from(coachingSnapshots).all();
    const coachingThisMonth = allCoaching.filter(c => (c.weekStart ?? 0) >= monthAgo).length;

    // ── Time Saved Calculation ────────────────────────────────
    // meetings_prepped × 15min + follow_ups × 10min + tasks_managed × 5min + knowledge_queries × 3min
    const timeSavedMinutes =
      meetingsPreppedThisMonth * 15 +
      followUpsThisMonth * 10 +
      completedThisMonth.length * 5 +
      qaThisMonth.length * 3;
    const timeSavedHours = Math.round((timeSavedMinutes / 60) * 10) / 10;

    // ── WoW helpers ───────────────────────────────────────────
    function wowChange(thisWeek: number, lastWeek: number): number | null {
      if (lastWeek === 0) return null;
      return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    }

    // ── Weekly ROI Trend (past 8 weeks) ─────────────────────
    const roiTrend: Array<{ week: string; roi: number; hours: number }> = [];
    for (let w = 7; w >= 0; w--) {
      const wStart = now - (w + 1) * 7 * 86400;
      const wEnd = now - w * 7 * 86400;
      const wLabel = new Date(wEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const wCompleted = allTasks.filter(t => {
        if (t.status !== 'COMPLETED') return false;
        const ts = t.completedAt instanceof Date ? Math.floor(t.completedAt.getTime() / 1000) : (t.completedAt ? Number(t.completedAt) : 0);
        return ts >= wStart && ts < wEnd;
      }).length;
      const wCalls = allCalls.filter(c => (c.createdAt ?? 0) >= wStart && (c.createdAt ?? 0) < wEnd).length;
      const wFollowUps = allCalls.filter(c => (c.createdAt ?? 0) >= wStart && (c.createdAt ?? 0) < wEnd && c.outcome).length;
      const wQA = allQA.filter(q => (q.createdAt ?? 0) >= wStart && (q.createdAt ?? 0) < wEnd).length;
      const wMinutes = wFollowUps * 10 + wCompleted * 5 + wQA * 3;
      const wHours = Math.round((wMinutes / 60) * 10) / 10;
      roiTrend.push({ week: wLabel, roi: Math.round(wHours * 50), hours: wHours });
    }

    // ── Team Adoption Rate ─────────────────────────────────
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../..', 'bot/data/chiefofstaff.db');
    const rawDb = new Database(dbPath, { readonly: true });
    const totalMembers = (rawDb.prepare('SELECT COUNT(*) as c FROM team_members').get() as { c: number }).c +
      (rawDb.prepare('SELECT COUNT(*) as c FROM escalation_targets').get() as { c: number }).c;
    // Active = has tasks completed or calls this week
    const activeSlackIds = new Set<string>();
    for (const t of completedThisWeek) activeSlackIds.add(t.slackUserId);
    for (const c of callsThisWeek) if (c.repSlackId) activeSlackIds.add(c.repSlackId);
    const activeCount = activeSlackIds.size;
    rawDb.close();

    res.json({
      timeSaved: {
        hours: timeSavedHours,
        minutes: timeSavedMinutes,
        roiDollars: Math.round(timeSavedHours * 50),
      },
      roiTrend,
      teamAdoption: {
        activeThisWeek: activeCount,
        totalMembers,
        pct: totalMembers > 0 ? Math.round((activeCount / totalMembers) * 100) : 0,
      },
      thisWeek: {
        meetingsPrepped: meetingsPreppedhisWeek,
        followUpsDrafted: followUpsThisWeek,
        tasksCompleted: completedThisWeek.length,
        tasksCreated: tasksThisWeek.length,
        knowledgeQueries: qaThisWeek.length,
        productSignals: signalsThisWeek.length,
      },
      lastWeek: {
        meetingsPrepped: meetingsPreppedLastWeek,
        followUpsDrafted: followUpsLastWeek,
        tasksCompleted: completedLastWeek.length,
        tasksCreated: tasksLastWeek.length,
        knowledgeQueries: qaLastWeek.length,
        productSignals: signalsLastWeek.length,
      },
      wow: {
        meetingsPrepped: wowChange(meetingsPreppedhisWeek, meetingsPreppedLastWeek),
        followUpsDrafted: wowChange(followUpsThisWeek, followUpsLastWeek),
        tasksCompleted: wowChange(completedThisWeek.length, completedLastWeek.length),
        knowledgeQueries: wowChange(qaThisWeek.length, qaLastWeek.length),
        productSignals: wowChange(signalsThisWeek.length, signalsLastWeek.length),
      },
      taskManagement: {
        totalCreated,
        totalOpen,
        totalCompleted,
        completedThisMonth: completedThisMonth.length,
        overduePreventedThisMonth: overduePreventedThisMonth.length,
        completionRatePct: totalCreated > 0 ? Math.round((totalCompleted / totalCreated) * 100) : 0,
      },
      callIntelligence: {
        callsAnalyzedThisMonth: callsThisMonth.length,
        followUpsDraftedThisMonth: followUpsThisMonth,
        coachingSessionsThisMonth: coachingThisMonth,
        totalCallsAnalyzed: allCalls.length,
      },
      knowledgeBase: {
        queriesAnsweredThisMonth: qaThisMonth.length,
        docsIngestedThisMonth,
        knowledgeEntriesThisMonth: knowledgeThisMonth,
        sopsGeneratedThisMonth: sopsThisMonth.length,
        totalSops: sopsAll.length,
        totalKnowledgeEntries: allKnowledge.length,
      },
      productIntelligence: {
        signalsCapturedThisMonth: signalsThisMonth.length,
        featureRequests,
        bugReports,
        churnReasons,
        totalSignals: allSignals.length,
      },
    });
  } catch (err) {
    console.error('[analytics] GET /outcomes error:', err);
    res.status(500).json({ error: 'Failed to fetch outcome metrics' });
  }
});

// GET /api/analytics/leaderboard — weekly team leaderboard
router.get('/analytics/leaderboard', (_req, res) => {
  try {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

    // Tasks completed this week grouped by slackUserName
    const allTasksAll = db.select().from(tasks).all();
    const completedThisWeek = allTasksAll.filter((t) => {
      if (t.status !== 'COMPLETED') return false;
      const ts =
        t.completedAt instanceof Date
          ? Math.floor(t.completedAt.getTime() / 1000)
          : t.completedAt
            ? Number(t.completedAt)
            : null;
      return ts != null && ts >= weekAgo;
    });

    const tasksByName: Record<string, number> = {};
    for (const t of completedThisWeek) {
      const name = t.slackUserName ?? 'Unknown';
      tasksByName[name] = (tasksByName[name] ?? 0) + 1;
    }

    // Calls analyzed this week grouped by repName
    const allCallsAll = db.select().from(callAnalyses).all();
    const callsThisWeek = allCallsAll.filter((c) => (c.createdAt ?? 0) >= weekAgo);
    const callsByName: Record<string, number> = {};
    for (const c of callsThisWeek) {
      const name = c.repName ?? 'Unknown';
      callsByName[name] = (callsByName[name] ?? 0) + 1;
    }

    // Latest coaching grade per rep (most recent coaching snapshot)
    const allCoachingAll = db
      .select()
      .from(coachingSnapshots)
      .orderBy(desc(coachingSnapshots.weekStart))
      .all();
    const latestGradeByName: Record<string, string> = {};
    for (const snap of allCoachingAll) {
      const name = snap.repName ?? 'Unknown';
      if (!latestGradeByName[name]) {
        // Derive grade from coaching flags weighted by severity
        const flags = (snap.coachingFlags ?? []) as Array<{ severity?: string }>;
        const sevWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const score = flags.reduce((sum, f) => sum + (sevWeight[f.severity ?? 'low'] ?? 1), 0);
        const grade = score === 0 ? 'A' : score <= 2 ? 'B+' : score <= 4 ? 'B' : score <= 6 ? 'B-' : score <= 8 ? 'C+' : score <= 12 ? 'C' : 'D';
        latestGradeByName[name] = grade;
      }
    }

    // Combine into ranked list — union of all names
    const allNames = new Set([
      ...Object.keys(tasksByName),
      ...Object.keys(callsByName),
    ]);

    // Remove 'Unknown' from leaderboard
    allNames.delete('Unknown');

    // Filter to internal team only — only show names that match a team member or escalation target
    const allTeamMembers = db.select().from(teamMembers).all();
    const allEscTargets = db.select().from(escalationTargets).all();
    const internalNames = new Set([
      ...allTeamMembers.map((m) => m.displayName).filter(Boolean),
      ...allEscTargets.map((t) => t.displayName).filter(Boolean),
    ]);

    // If team members are configured, filter to only internal team
    if (internalNames.size > 0) {
      for (const name of allNames) {
        if (!internalNames.has(name)) {
          allNames.delete(name);
        }
      }
    }

    interface LeaderboardEntry {
      rank: number;
      name: string;
      tasksCompleted: number;
      callsAnalyzed: number;
      latestGrade: string | null;
    }

    // Score: tasks × 2 + calls × 1 (weighted ranking)
    const entries: LeaderboardEntry[] = Array.from(allNames).map((name) => ({
      rank: 0,
      name,
      tasksCompleted: tasksByName[name] ?? 0,
      callsAnalyzed: callsByName[name] ?? 0,
      latestGrade: latestGradeByName[name] ?? null,
    }));

    entries.sort((a, b) => {
      const scoreA = a.tasksCompleted * 2 + a.callsAnalyzed;
      const scoreB = b.tasksCompleted * 2 + b.callsAnalyzed;
      return scoreB - scoreA;
    });

    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    res.json(entries);
  } catch (err) {
    console.error('[analytics] GET /leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
});

export default router;

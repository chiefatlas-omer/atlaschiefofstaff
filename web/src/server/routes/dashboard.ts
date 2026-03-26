import { Router } from 'express';
import { db } from '../db';
import { tasks } from '../../../../bot/src/db/schema';
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

const router = Router();

// GET /api/dashboard — aggregated metrics for all sections
router.get('/dashboard', (_req, res) => {
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
router.get('/analytics/calls', (_req, res) => {
  try {
    const calls = db
      .select()
      .from(callAnalyses)
      .orderBy(desc(callAnalyses.date))
      .limit(50)
      .all();
    res.json(calls);
  } catch (err) {
    console.error('[analytics] GET /calls error:', err);
    res.status(500).json({ error: 'Failed to fetch call analyses' });
  }
});

// GET /api/analytics/digest — weekly digest data (calls from last 7 days + aggregated breakdown)
router.get('/analytics/digest', (_req, res) => {
  try {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

    const calls = db
      .select()
      .from(callAnalyses)
      .where(gt(callAnalyses.createdAt, weekAgo))
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

// GET /api/analytics/coaching — coaching snapshots (limit 20, ordered by weekStart DESC)
router.get('/analytics/coaching', (_req, res) => {
  try {
    const snapshots = db
      .select()
      .from(coachingSnapshots)
      .orderBy(desc(coachingSnapshots.weekStart))
      .limit(20)
      .all();
    res.json(snapshots);
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
    const bugReports = signalsThisMonth.filter(s => s.type === 'bug').length;
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

    res.json({
      timeSaved: {
        hours: timeSavedHours,
        minutes: timeSavedMinutes,
        roiDollars: Math.round(timeSavedHours * 50),
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

export default router;

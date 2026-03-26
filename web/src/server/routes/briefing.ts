import { Router } from 'express';
import { db } from '../db';
import {
  tasks,
  meetings,
  documents,
  qaInteractions,
  people,
  companies,
} from '../../../../bot/src/db/schema';
import { callAnalyses, coachingSnapshots } from '../schema-analytics';
// emailDrafts routes moved to email-drafts.ts
import { eq, ne, and, lt, gt, gte, desc, isNotNull, like } from 'drizzle-orm';

const router = Router();

// GET /api/briefing — daily briefing: needs attention, today's schedule, week summary, activity feed
router.get('/briefing', (_req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;

    // ── Greeting ────────────────────────────────────────────
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // ── Needs Attention ─────────────────────────────────────
    const needsAttention: Array<{
      type: 'overdue_task' | 'risk_flag' | 'unprepped_meeting';
      title: string;
      subtitle: string;
      severity: 'high' | 'medium';
      taskId?: string;
      callId?: number;
      meetingId?: string;
    }> = [];

    // Overdue tasks
    const overdueTasks = db
      .select()
      .from(tasks)
      .where(
        and(
          ne(tasks.status, 'COMPLETED'),
          ne(tasks.status, 'DISMISSED'),
          lt(tasks.deadline, new Date()),
        ),
      )
      .all();

    for (const t of overdueTasks) {
      const deadlineTs = t.deadline instanceof Date ? t.deadline.getTime() : Number(t.deadline) * 1000;
      const daysOverdue = Math.ceil((Date.now() - deadlineTs) / (1000 * 60 * 60 * 24));
      const dueLabel = daysOverdue === 1 ? 'was due yesterday' : `${daysOverdue} days overdue`;
      needsAttention.push({
        type: 'overdue_task',
        title: t.description,
        subtitle: `${t.slackUserName ? `Assigned to ${t.slackUserName}` : 'Unassigned'} · ${dueLabel}`,
        severity: 'high',
        taskId: t.id,
      });
    }

    // Risk flags from recent calls
    const recentCalls = db
      .select()
      .from(callAnalyses)
      .where(gt(callAnalyses.createdAt, weekAgo))
      .orderBy(desc(callAnalyses.createdAt))
      .all();

    for (const call of recentCalls) {
      const flags = call.riskFlags as string[] | null;
      if (flags && Array.isArray(flags) && flags.length > 0) {
        for (const flag of flags) {
          needsAttention.push({
            type: 'risk_flag',
            title: flag,
            subtitle: `From ${call.title ?? 'call'} · ${call.repName ?? 'Unknown rep'}`,
            severity: 'medium',
            callId: call.id,
          });
        }
      }
    }

    // Unprepped meetings today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);
    const todayEndUnix = Math.floor(todayEnd.getTime() / 1000);

    const allMeetingsToday = db
      .select()
      .from(meetings)
      .where(and(gte(meetings.date, todayStartUnix), lt(meetings.date, todayEndUnix)))
      .all();

    for (const m of allMeetingsToday) {
      if (!m.summary) {
        needsAttention.push({
          type: 'unprepped_meeting',
          title: m.title,
          subtitle: `No prep brief yet · ${new Date(Number(m.date) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          severity: 'medium',
          meetingId: m.id,
        });
      }
    }

    // ── Today's Meetings ─────────────────────────────────────
    const todaysMeetings = allMeetingsToday
      .sort((a, b) => (Number(a.date) || 0) - (Number(b.date) || 0))
      .map((m) => ({
        id: m.id,
        title: m.title,
        time: new Date(Number(m.date) * 1000).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }),
        hasPrep: Boolean(m.summary),
      }));

    // ── Week Summary ─────────────────────────────────────────
    const allCalls = db.select().from(callAnalyses).all();
    const callsThisWeek = allCalls.filter((c) => (c.createdAt ?? 0) >= weekAgo);
    const followUpsThisWeek = callsThisWeek.filter((c) => c.outcome).length;

    const allTasks = db.select().from(tasks).all();
    const completedThisWeek = allTasks.filter((t) => {
      if (t.status !== 'COMPLETED') return false;
      const ts =
        t.completedAt instanceof Date
          ? Math.floor(t.completedAt.getTime() / 1000)
          : t.completedAt
            ? Number(t.completedAt)
            : null;
      return ts != null && ts >= weekAgo;
    });

    const allQA = db.select().from(qaInteractions).all();
    const qaThisWeek = allQA.filter((q) => (q.createdAt ?? 0) >= weekAgo);

    const allMeetingsAll = db.select().from(meetings).all();
    const meetingsPreppedThisWeek = allMeetingsAll.filter((m) => {
      const ts = Number(m.createdAt);
      return ts >= weekAgo && Boolean(m.summary);
    }).length;

    // Time saved: meetings_prepped × 15min + follow_ups × 10min + tasks × 5min + qa × 3min
    const timeSavedMinutes =
      meetingsPreppedThisWeek * 15 +
      followUpsThisWeek * 10 +
      completedThisWeek.length * 5 +
      qaThisWeek.length * 3;
    const hoursSaved = Math.round((timeSavedMinutes / 60) * 10) / 10;

    const weekSummary = {
      callsAnalyzed: callsThisWeek.length,
      followUpsSent: followUpsThisWeek,
      tasksCompleted: completedThisWeek.length,
      hoursSaved,
      roiDollars: Math.round(hoursSaved * 50),
    };

    // ── Recent Activity ──────────────────────────────────────
    interface ActivityItem {
      type: string;
      title: string;
      subtitle?: string;
      timestamp: number;
    }

    const activity: ActivityItem[] = [];

    // Call analyses
    const recentCallsAll = db
      .select()
      .from(callAnalyses)
      .orderBy(desc(callAnalyses.createdAt))
      .limit(15)
      .all();
    for (const c of recentCallsAll) {
      activity.push({
        type: 'call_analyzed',
        title: `Call analyzed: ${c.title ?? 'Untitled call'}`,
        subtitle: c.repName ?? undefined,
        timestamp: c.createdAt ?? 0,
      });
    }

    // Tasks
    const recentTasks = db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(15)
      .all();
    for (const t of recentTasks) {
      const ts =
        t.createdAt instanceof Date
          ? Math.floor(t.createdAt.getTime() / 1000)
          : Number(t.createdAt);
      activity.push({
        type: 'task_created',
        title: `Task detected: ${t.description}`,
        subtitle: t.slackUserName ?? undefined,
        timestamp: ts,
      });
    }

    // Coaching snapshots
    const recentCoaching = db
      .select()
      .from(coachingSnapshots)
      .orderBy(desc(coachingSnapshots.createdAt))
      .limit(15)
      .all();
    for (const c of recentCoaching) {
      activity.push({
        type: 'coaching_sent',
        title: `Coaching sent to ${c.repName ?? 'rep'}`,
        timestamp: c.createdAt ?? 0,
      });
    }

    // Documents
    const recentDocs = db
      .select()
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(15)
      .all();
    for (const d of recentDocs) {
      const isSop = d.type === 'sop';
      activity.push({
        type: isSop ? 'sop_generated' : 'doc_ingested',
        title: isSop ? `SOP generated: ${d.title}` : `Document ingested: ${d.title}`,
        timestamp: d.createdAt ?? 0,
      });
    }

    // QA interactions
    const recentQA = db
      .select()
      .from(qaInteractions)
      .orderBy(desc(qaInteractions.createdAt))
      .limit(15)
      .all();
    for (const q of recentQA) {
      activity.push({
        type: 'knowledge_query',
        title: 'Knowledge query answered',
        subtitle: q.question?.slice(0, 60) ?? undefined,
        timestamp: q.createdAt ?? 0,
      });
    }

    // Sort all by timestamp DESC, take top 15
    activity.sort((a, b) => b.timestamp - a.timestamp);
    const recentActivity = activity.slice(0, 15);

    res.json({
      greeting,
      date: dateStr,
      needsAttention,
      todaysMeetings,
      weekSummary,
      recentActivity,
    });
  } catch (err) {
    console.error('[briefing] GET /briefing error:', err);
    res.status(500).json({ error: 'Failed to fetch briefing data' });
  }
});

// GET /api/search?q=<query> — unified search across tasks, people, companies, meetings, calls, documents
router.get('/search', (req, res) => {
  try {
    const q = (req.query.q as string || '').trim().toLowerCase();

    interface SearchResult {
      type: string;
      id: string | number;
      title: string;
      subtitle?: string;
    }

    const results: SearchResult[] = [];

    if (q === '') {
      // Return recent items: last 5 tasks + last 5 calls
      const recentTasks = db
        .select()
        .from(tasks)
        .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
        .orderBy(desc(tasks.createdAt))
        .limit(5)
        .all();
      for (const t of recentTasks) {
        results.push({
          type: 'task',
          id: t.id,
          title: t.description,
          subtitle: t.slackUserName ?? undefined,
        });
      }

      const recentCalls = db
        .select()
        .from(callAnalyses)
        .orderBy(desc(callAnalyses.createdAt))
        .limit(5)
        .all();
      for (const c of recentCalls) {
        results.push({
          type: 'call',
          id: c.id,
          title: c.title ?? 'Untitled call',
          subtitle: c.businessName ?? c.repName ?? undefined,
        });
      }
    } else {
      const pattern = `%${q}%`;

      // Tasks
      const matchedTasks = db
        .select()
        .from(tasks)
        .where(like(tasks.description, pattern))
        .limit(3)
        .all();
      for (const t of matchedTasks) {
        results.push({
          type: 'task',
          id: t.id,
          title: t.description,
          subtitle: t.slackUserName ?? undefined,
        });
      }

      // People
      const matchedPeople = db
        .select()
        .from(people)
        .where(like(people.name, pattern))
        .limit(3)
        .all();
      for (const p of matchedPeople) {
        results.push({
          type: 'person',
          id: p.id,
          title: p.name,
          subtitle: p.role ?? p.company ?? undefined,
        });
      }

      // Companies
      const matchedCompanies = db
        .select()
        .from(companies)
        .where(like(companies.name, pattern))
        .limit(3)
        .all();
      for (const c of matchedCompanies) {
        results.push({
          type: 'company',
          id: c.id,
          title: c.name,
          subtitle: c.industry ?? undefined,
        });
      }

      // Meetings
      const matchedMeetings = db
        .select()
        .from(meetings)
        .where(like(meetings.title, pattern))
        .limit(3)
        .all();
      for (const m of matchedMeetings) {
        results.push({
          type: 'meeting',
          id: m.id,
          title: m.title,
        });
      }

      // Call analyses
      const matchedCalls = db
        .select()
        .from(callAnalyses)
        .where(like(callAnalyses.title, pattern))
        .limit(3)
        .all();
      for (const c of matchedCalls) {
        results.push({
          type: 'call',
          id: c.id,
          title: c.title ?? 'Untitled call',
          subtitle: c.businessName ?? c.repName ?? undefined,
        });
      }

      // Documents
      const matchedDocs = db
        .select()
        .from(documents)
        .where(like(documents.title, pattern))
        .limit(3)
        .all();
      for (const d of matchedDocs) {
        results.push({
          type: 'document',
          id: d.id,
          title: d.title,
          subtitle: d.type ?? undefined,
        });
      }
    }

    // Limit total to 10
    res.json(results.slice(0, 10));
  } catch (err) {
    console.error('[search] GET /search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Email draft routes moved to routes/email-drafts.ts (Express 5 routing limit workaround)

export default router;

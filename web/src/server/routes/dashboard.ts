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
import { eq, ne, and, lt, count, desc, gte } from 'drizzle-orm';

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

export default router;

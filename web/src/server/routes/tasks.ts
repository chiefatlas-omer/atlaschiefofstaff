import { Router } from 'express';
import { db } from '../db';
import { tasks } from '../../../../bot/src/db/schema';
import { eq, ne, and, lt, count, sql } from 'drizzle-orm';

const router = Router();

// GET /api/tasks — all open tasks (not COMPLETED or DISMISSED)
router.get('/tasks', (_req, res) => {
  try {
    const openTasks = db
      .select()
      .from(tasks)
      .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
      .orderBy(tasks.createdAt)
      .all();
    res.json(openTasks);
  } catch (err) {
    console.error('[tasks] GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/stats — task metrics
router.get('/tasks/stats', (_req, res) => {
  try {
    const now = new Date();

    const total = db.select({ count: count() }).from(tasks).get();
    const open = db
      .select({ count: count() })
      .from(tasks)
      .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
      .get();
    const completed = db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, 'COMPLETED'))
      .get();
    const overdue = db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          ne(tasks.status, 'COMPLETED'),
          ne(tasks.status, 'DISMISSED'),
          lt(tasks.deadline, now)
        )
      )
      .get();
    const escalated = db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, 'ESCALATED'))
      .get();

    res.json({
      total: total?.count ?? 0,
      open: open?.count ?? 0,
      completed: completed?.count ?? 0,
      overdue: overdue?.count ?? 0,
      escalated: escalated?.count ?? 0,
    });
  } catch (err) {
    console.error('[tasks] GET /tasks/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch task stats' });
  }
});

export default router;

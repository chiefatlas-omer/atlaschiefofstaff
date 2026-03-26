import { Router } from 'express';
import { db } from '../db';
import { tasks } from '../../../../bot/src/db/schema';
import { eq, ne, and, lt, count } from 'drizzle-orm';

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

// POST /api/tasks/:id/complete — mark task as completed
router.post('/tasks/:id/complete', (req, res) => {
  try {
    const id = req.params.id;
    db.update(tasks).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(tasks.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[tasks] POST /tasks/:id/complete error:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// POST /api/tasks/:id/push — push task deadline by N days
router.post('/tasks/:id/push', (req, res) => {
  try {
    const id = req.params.id;
    const { days } = req.body as { days?: number };
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    const currentDeadline = task.deadline instanceof Date ? task.deadline : new Date(Number(task.deadline) * 1000);
    const newDeadline = new Date(currentDeadline.getTime() + (days || 1) * 24 * 60 * 60 * 1000);
    db.update(tasks).set({ deadline: newDeadline }).where(eq(tasks.id, id)).run();
    res.json({ success: true, newDeadline: newDeadline.toISOString() });
  } catch (err) {
    console.error('[tasks] POST /tasks/:id/push error:', err);
    res.status(500).json({ error: 'Failed to push task' });
  }
});

// POST /api/tasks/:id/dismiss — dismiss a task
router.post('/tasks/:id/dismiss', (req, res) => {
  try {
    const id = req.params.id;
    db.update(tasks).set({ status: 'DISMISSED' }).where(eq(tasks.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[tasks] POST /tasks/:id/dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss task' });
  }
});

export default router;

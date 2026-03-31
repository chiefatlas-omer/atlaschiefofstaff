import { Router } from 'express';
import { db } from '../db';
import { tasks, teamMembers, escalationTargets } from '../../../../bot/src/db/schema';
import { eq, ne, and, lt, count, desc } from 'drizzle-orm';

const router = Router();

function getInternalSlackIds(): Set<string> {
  const members = db.select({ id: teamMembers.slackUserId }).from(teamMembers).all();
  const targets = db.select({ id: escalationTargets.slackUserId }).from(escalationTargets).all();
  const ids = new Set<string>();
  for (const m of members) ids.add(m.id);
  for (const t of targets) ids.add(t.id);
  return ids;
}

// GET /api/tasks — open tasks filtered by user (admins see all)
router.get('/tasks', (req: any, res) => {
  try {
    const conditions = [ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')];

    // Non-admins only see their own tasks
    if (req.userId && !req.isAdmin) {
      conditions.push(eq(tasks.slackUserId, req.userId));
    }

    let openTasks = db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .all();

    // Admin: filter to internal team only (must be in team_members or escalation_targets)
    if (req.isAdmin) {
      const internalIds = getInternalSlackIds();
      openTasks = openTasks.filter((t) => internalIds.has(t.slackUserId));
    }
    res.json(openTasks);
  } catch (err) {
    console.error('[tasks] GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/stats — task metrics filtered by user
router.get('/tasks/stats', (req: any, res) => {
  try {
    const now = new Date();
    const userFilter = (req.userId && !req.isAdmin) ? eq(tasks.slackUserId, req.userId) : undefined;

    const total = db.select({ count: count() }).from(tasks).where(userFilter).get();
    const open = db
      .select({ count: count() })
      .from(tasks)
      .where(userFilter ? and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED'), userFilter) : and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
      .get();
    const completed = db
      .select({ count: count() })
      .from(tasks)
      .where(userFilter ? and(eq(tasks.status, 'COMPLETED'), userFilter) : eq(tasks.status, 'COMPLETED'))
      .get();
    const overdue = db
      .select({ count: count() })
      .from(tasks)
      .where(
        userFilter
          ? and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED'), lt(tasks.deadline, now), userFilter)
          : and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED'), lt(tasks.deadline, now))
      )
      .get();
    const escalated = db
      .select({ count: count() })
      .from(tasks)
      .where(userFilter ? and(eq(tasks.status, 'ESCALATED'), userFilter) : eq(tasks.status, 'ESCALATED'))
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

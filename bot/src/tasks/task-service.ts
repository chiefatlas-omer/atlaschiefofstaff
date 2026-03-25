import { db } from '../db/connection';
import { tasks, teamMembers } from '../db/schema';
import { eq, and, lte, inArray, gte, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as chrono from 'chrono-node';

export interface CreateTaskInput {
  slackUserId: string;
  slackUserName?: string;
  description: string;
  rawMessageText?: string;
  sourceChannelId?: string;
  sourceMessageTs?: string;
  sourceThreadTs?: string;
  botReplyTs?: string;
  confidence: 'high' | 'medium';
  deadlineText?: string | null;
  source?: 'slack' | 'zoom' | 'manual' | 'desktop';
  zoomMeetingId?: string;
}

export function createTask(input: CreateTaskInput): { id: string; status: string; deadline: Date } | null {
  const id = `tsk_${nanoid(8)}`;
  const now = new Date();

  let deadline: Date | null = null;
  if (input.deadlineText) {
    const parsed = chrono.parseDate(input.deadlineText, now, { forwardDate: true });
    deadline = parsed || null;
  }

  // Default deadline: 7 days from now if none specified
  if (!deadline) {
    deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Look up team membership
  const member = db.select().from(teamMembers)
    .where(eq(teamMembers.slackUserId, input.slackUserId))
    .get();

  const status = input.confidence === 'high' ? 'CONFIRMED' : 'DETECTED';

  // Dedup check for Zoom-sourced tasks
  if (input.source === 'zoom' && input.zoomMeetingId) {
    const existing = db.select().from(tasks)
      .where(and(
        eq(tasks.zoomMeetingId, input.zoomMeetingId),
        eq(tasks.slackUserId, input.slackUserId),
        inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']),
      ))
      .get();
    if (existing) {
      console.log('Skipping duplicate Zoom task for', input.slackUserId, 'meeting', input.zoomMeetingId, '- existing task', existing.id);
      return null;
    }
  }

  db.insert(tasks).values({
    id,
    slackUserId: input.slackUserId,
    slackUserName: input.slackUserName || null,
    description: input.description,
    rawMessageText: input.rawMessageText || null,
    sourceChannelId: input.sourceChannelId || null,
    sourceMessageTs: input.sourceMessageTs || null,
    sourceThreadTs: input.sourceThreadTs || null,
    botReplyTs: input.botReplyTs || null,
    status,
    confidence: input.confidence,
    team: member?.team || null,
    deadlineText: input.deadlineText || null,
    deadline,
    source: input.source || 'slack',
    zoomMeetingId: input.zoomMeetingId || null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return { id, status, deadline };
}

export function completeTask(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ status: 'COMPLETED', completedAt: now, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function reopenTask(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({
      status: 'CONFIRMED',
      completedAt: null,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();
}

export function dismissTask(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ status: 'DISMISSED', updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function confirmTask(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ status: 'CONFIRMED', updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function reassignTask(taskId: string, newSlackUserId: string, newSlackUserName?: string) {
  const now = new Date();
  db.update(tasks)
    .set({ slackUserId: newSlackUserId, slackUserName: newSlackUserName || null, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function updateDeadline(taskId: string, newDeadlineText: string) {
  const now = new Date();
  const parsed = chrono.parseDate(newDeadlineText, now, { forwardDate: true });
  if (parsed) {
    db.update(tasks)
      .set({ deadline: parsed, deadlineText: newDeadlineText, status: 'CONFIRMED', updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();
  }
}

export function getTaskById(taskId: string) {
  return db.select().from(tasks).where(eq(tasks.id, taskId)).get();
}

export function getTasksByUser(slackUserId: string) {
  return db.select().from(tasks)
    .where(and(
      eq(tasks.slackUserId, slackUserId),
      inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']),
    ))
    .all();
}

export function getTasksApproachingDeadline(withinHours: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  return db.select().from(tasks)
    .where(and(
      inArray(tasks.status, ['CONFIRMED', 'OVERDUE']),
      lte(tasks.deadline, cutoff),
      gte(tasks.deadline, now),
    ))
    .all();
}

export function getOverdueTasks() {
  const now = new Date();
  return db.select().from(tasks)
    .where(and(
      inArray(tasks.status, ['CONFIRMED', 'OVERDUE']),
      lte(tasks.deadline, now),
    ))
    .all();
}

export function markOverdue(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ status: 'OVERDUE', updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function markEscalated(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ status: 'ESCALATED', escalatedAt: now, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function updateLastReminder(taskId: string) {
  const now = new Date();
  db.update(tasks)
    .set({ lastReminderAt: now, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
}

export function updateBotReplyTs(taskId: string, botReplyTs: string) {
  db.update(tasks)
    .set({ botReplyTs, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run();
}

export function getCompletedThisWeek() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return db.select().from(tasks)
    .where(and(
      eq(tasks.status, 'COMPLETED'),
      gte(tasks.completedAt, weekAgo),
    ))
    .all();
}

export function getAllOpenTasks() {
  return db.select().from(tasks)
    .where(inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']))
    .all();
}

export function getOpenTasksByTeam(team: 'team_a' | 'team_b') {
  return db.select().from(tasks)
    .where(and(
      eq(tasks.team, team),
      inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']),
    ))
    .all();
}

export function getOverdueTasksByUser(slackUserId: string) {
  const now = new Date();
  return db.select().from(tasks)
    .where(and(
      eq(tasks.slackUserId, slackUserId),
      inArray(tasks.status, ['CONFIRMED', 'OVERDUE']),
      lte(tasks.deadline, now),
    ))
    .all();
}

export function deduplicateTasks(): number {
  const openTasks = db.select().from(tasks)
    .where(inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']))
    .all();

  // Group by user
  const byUser: Record<string, typeof openTasks> = {};
  for (const t of openTasks) {
    if (!byUser[t.slackUserId]) byUser[t.slackUserId] = [];
    byUser[t.slackUserId].push(t);
  }

  let dismissedCount = 0;
  const now = new Date();

  for (const [userId, userTasks] of Object.entries(byUser)) {
    // Group by normalized description
    const byDesc: Record<string, typeof openTasks> = {};
    for (const t of userTasks) {
      const normalized = t.description.toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/sergey/g, 'serge'); // Handle name variations
      if (!byDesc[normalized]) byDesc[normalized] = [];
      byDesc[normalized].push(t);
    }

    for (const [desc, group] of Object.entries(byDesc)) {
      if (group.length <= 1) continue;

      // Sort by createdAt ascending, keep the oldest
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const [keep, ...duplicates] = group;

      for (const dup of duplicates) {
        db.update(tasks)
          .set({ status: 'DISMISSED', updatedAt: now })
          .where(eq(tasks.id, dup.id))
          .run();
        dismissedCount++;
        console.log('Dedup: dismissed', dup.id, '(duplicate of', keep.id + ')', '-', dup.description);
      }
    }
  }

  return dismissedCount;
}

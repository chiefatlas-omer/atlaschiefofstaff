import { db } from './connection';
import { tasks } from './schema';
import { eq, and, lte, inArray } from 'drizzle-orm';
import { config } from '../config';

export function getMyTasks() {
  return db.select().from(tasks)
    .where(and(
      eq(tasks.slackUserId, config.slackUserId),
      inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']),
    ))
    .all();
}

export function getAllOpenTasks() {
  return db.select().from(tasks)
    .where(inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']))
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

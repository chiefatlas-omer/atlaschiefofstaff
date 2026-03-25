import {
  getTasksApproachingDeadline,
  getOverdueTasks,
  getTaskById,
  markOverdue,
  markEscalated,
  updateLastReminder,
} from './task-service';
import { reminderBlocks, escalationBlocks } from '../slack/blocks';
import { config } from '../config';

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

const TERMINAL_STATUSES = ['COMPLETED', 'DISMISSED'];

export async function processReminders(client: any) {
  // Send reminders for tasks approaching deadline (within 24 hours)
  const approaching = getTasksApproachingDeadline(24);

  for (const task of approaching) {
    // Re-fetch from DB to catch completions that happened after initial query
    const freshTask = getTaskById(task.id);
    if (!freshTask || TERMINAL_STATUSES.includes(freshTask.status)) {
      console.log('Skipping reminder for task', task.id, '- status is now', freshTask?.status || 'deleted');
      continue;
    }

    if (freshTask.lastReminderAt && isToday(new Date(freshTask.lastReminderAt))) {
      continue; // Already reminded today
    }

    try {
      const blocks = reminderBlocks(freshTask.id, freshTask.description, freshTask.deadline);

      await client.chat.postMessage({
        channel: freshTask.slackUserId, // DM the user
        blocks,
        text: 'Reminder: ' + freshTask.description + ' is due soon.',
      });

      updateLastReminder(freshTask.id);
      console.log('Sent reminder for task', freshTask.id, 'to', freshTask.slackUserId);
    } catch (error) {
      console.error('Error sending reminder for task', freshTask.id, error);
    }
  }
}

export async function processEscalations(client: any) {
  const overdue = getOverdueTasks();
  const now = new Date();

  for (const task of overdue) {
    // Re-fetch from DB to catch completions that happened after initial query
    const freshTask = getTaskById(task.id);
    if (!freshTask || TERMINAL_STATUSES.includes(freshTask.status)) {
      console.log('Skipping escalation for task', task.id, '- status is now', freshTask?.status || 'deleted');
      continue;
    }

    if (!freshTask.deadline) continue;

    const daysOverdue = daysBetween(new Date(freshTask.deadline), now);

    // Mark as overdue if not already
    if (freshTask.status === 'CONFIRMED') {
      markOverdue(freshTask.id);
    }

    // Escalate if 2+ days overdue and not yet escalated
    if (daysOverdue >= 2 && freshTask.status !== 'ESCALATED') {
      const escalationTargets = [
        config.escalation.omerSlackUserId,
        config.escalation.markSlackUserId,
        config.escalation.ehsanSlackUserId,
      ].filter(Boolean);

      // Get permalink to original thread
      let permalink: string | undefined;
      if (freshTask.sourceChannelId && freshTask.sourceMessageTs) {
        try {
          const linkRes = await client.chat.getPermalink({
            channel: freshTask.sourceChannelId,
            message_ts: freshTask.sourceMessageTs,
          });
          permalink = linkRes.permalink;
        } catch {
          // Ignore - button just won't show
        }
      }

      for (const targetUserId of escalationTargets) {
        try {
          const blocks = escalationBlocks(
            freshTask.id,
            freshTask.slackUserId,
            freshTask.description,
            daysOverdue,
            permalink,
          );

          await client.chat.postMessage({
            channel: targetUserId,
            blocks,
            text: 'Escalation: ' + freshTask.description + ' is ' + daysOverdue + ' days overdue.',
          });
        } catch (error) {
          console.error('Error sending escalation for task', freshTask.id, 'to', targetUserId, error);
        }
      }

      markEscalated(freshTask.id);
      console.log('Escalated task', freshTask.id, '-', daysOverdue, 'days overdue');
    }
  }
}

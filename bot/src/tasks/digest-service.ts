import {
  getOverdueTasks,
  getCompletedThisWeek,
  getAllOpenTasks,
  getOpenTasksByTeam,
  getTasksByUser,
} from './task-service';
import { digestBlocks } from '../slack/blocks';
import { config } from '../config';
import { db } from '../db/connection';
import { digestLogs } from '../db/schema';

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function getSignOff(): string {
  const ctNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day = ctNow.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = ctNow.getHours();

  if (day === 5 && hour < 17) {
    return 'Have a strong finish to the week, team';
  } else if (day === 5 || day === 6 || day === 0) {
    return 'Have a great weekend team';
  }
  return 'Have a productive week, team';
}

function buildDigestData(taskList: any[], completedList: any[]) {
  const now = new Date();
  const overdueTasks = taskList.filter((t) => t.deadline && new Date(t.deadline) < now);

  return {
    completedCount: completedList.length,
    openCount: taskList.length,
    overdueCount: overdueTasks.length,
    overdueTasks: overdueTasks.map((t) => ({
      description: t.description,
      slackUserName: t.slackUserName,
      slackUserId: t.slackUserId,
      daysOverdue: t.deadline ? daysBetween(new Date(t.deadline), now) : 0,
    })),
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    signOff: getSignOff(),
  };
}

/**
 * Personal digest — called by /digest command.
 * Only shows the requesting user their own digest via DM. No broadcasting.
 */
export async function generatePersonalDigest(client: any, userId: string) {
  const completedThisWeek = getCompletedThisWeek();
  const allOpen = getAllOpenTasks();

  const fullData = buildDigestData(allOpen, completedThisWeek);
  const fullBlocks = digestBlocks(fullData);

  try {
    await client.chat.postMessage({
      channel: userId,
      blocks: fullBlocks,
      text: 'Atlas Weekly Digest -- ' + fullData.date,
    });
  } catch (error) {
    console.error('Error sending personal digest to', userId, error);
  }

  console.log('Personal digest sent to', userId, '- Open:', allOpen.length, 'Completed:', completedThisWeek.length);
}

/**
 * Full weekly digest — called by Friday cron job.
 * Broadcasts to all team channels, #founderhubhq, and leadership DMs.
 */
export async function generateWeeklyDigest(client: any) {
  const completedThisWeek = getCompletedThisWeek();
  const allOpen = getAllOpenTasks();

  console.log(`[digest] Open tasks: ${allOpen.length}, Completed this week: ${completedThisWeek.length}`);
  if (allOpen.length === 0 && completedThisWeek.length === 0) {
    console.warn('[digest] WARNING: 0 tasks found — possible DB/volume issue. Sending digest anyway.');
  }

  // Full digest data
  const fullData = buildDigestData(allOpen, completedThisWeek);
  const fullBlocks = digestBlocks(fullData);

  // Send to escalation targets (Omer + Mark + Ehsan)
  const targets = [
    config.escalation.omerSlackUserId,
    config.escalation.markSlackUserId,
    config.escalation.ehsanSlackUserId,
  ].filter(Boolean);

  for (const targetId of targets) {
    try {
      await client.chat.postMessage({
        channel: targetId,
        blocks: fullBlocks,
        text: 'Atlas Weekly Digest -- ' + fullData.date,
      });
    } catch (error) {
      console.error('Error sending digest to', targetId, error);
    }
  }

  // Send Team A digest
  if (config.channels.teamA) {
    const teamATasks = getOpenTasksByTeam('team_a');
    const teamACompleted = completedThisWeek.filter((t) => t.team === 'team_a');
    const teamAData = buildDigestData(teamATasks, teamACompleted);
    const teamABlocks = digestBlocks(teamAData);

    try {
      await client.chat.postMessage({
        channel: config.channels.teamA,
        blocks: teamABlocks,
        text: 'Atlas Weekly Digest (Team A) -- ' + teamAData.date,
      });
    } catch (error) {
      console.error('Error sending Team A digest:', error);
    }
  }

  // Send Team B digest
  if (config.channels.teamB) {
    const teamBTasks = getOpenTasksByTeam('team_b');
    const teamBCompleted = completedThisWeek.filter((t) => t.team === 'team_b');
    const teamBData = buildDigestData(teamBTasks, teamBCompleted);
    const teamBBlocks = digestBlocks(teamBData);

    try {
      await client.chat.postMessage({
        channel: config.channels.teamB,
        blocks: teamBBlocks,
        text: 'Atlas Weekly Digest (Team B) -- ' + teamBData.date,
      });
    } catch (error) {
      console.error('Error sending Team B digest:', error);
    }
  }

  // Send to #founderhubhq (combined)
  if (config.channels.founderHubHQ) {
    try {
      await client.chat.postMessage({
        channel: config.channels.founderHubHQ,
        blocks: fullBlocks,
        text: 'Atlas Weekly Digest -- ' + fullData.date,
      });
    } catch (error) {
      console.error('Error sending digest to #founderhubhq:', error);
    }
  }

  // Log the digest
  db.insert(digestLogs).values({
    sentAt: new Date(),
    recipientSlackId: targets.join(','),
    taskCount: allOpen.length,
    overdueCount: fullData.overdueCount,
    completedCount: completedThisWeek.length,
  }).run();

  console.log('Weekly digest sent. Open:', allOpen.length, 'Completed:', completedThisWeek.length, 'Overdue:', fullData.overdueCount);
}

// Keep backward compat alias - the cron job and old code may reference this
export const generateDigest = generateWeeklyDigest;

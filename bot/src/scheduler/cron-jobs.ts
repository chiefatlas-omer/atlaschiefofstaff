import cron from 'node-cron';
import { processReminders, processEscalations } from '../tasks/reminder-service';
import { generateDigest } from '../tasks/digest-service';
import { getSOPCandidates } from '../services/topic-tracker';
import { createSOPForTopic } from '../services/sop-service';
import { config } from '../config';
import { generateProactiveAlerts, formatAlertsForSlack } from '../services/proactive-alerts';
import { generateWeeklyDigest, formatDigestForSlack } from '../services/sales-digest';
import { generateCoachingSnapshot, formatCoachingForSlack, formatCoachingForRep } from '../services/coaching-engine';
import { db } from '../db/connection';
import { tasks, callAnalyses } from '../db/schema';
import { gt, gte, ne, eq, and } from 'drizzle-orm';

export function startCronJobs(client: any) {
  // Reminders: 8:00 AM and 4:00 PM CT, Mon-Fri (DM'd to each person)
  cron.schedule('0 8 * * 1-5', async () => {
    console.log('Running morning reminder check (8 AM CT)...');
    try {
      await processReminders(client);
    } catch (error) {
      console.error('Reminder cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  cron.schedule('0 16 * * 1-5', async () => {
    console.log('Running afternoon reminder check (4 PM CT)...');
    try {
      await processReminders(client);
    } catch (error) {
      console.error('Reminder cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Overdue escalation: 9:00 AM and 5:00 PM CT, Mon-Fri (DM'd to Omer, Mark, Ehsan)
  cron.schedule('0 9 * * 1-5', async () => {
    console.log('Running morning escalation check (9 AM CT)...');
    try {
      await processEscalations(client);
    } catch (error) {
      console.error('Escalation cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  cron.schedule('0 17 * * 1-5', async () => {
    console.log('Running evening escalation check (5 PM CT)...');
    try {
      await processEscalations(client);
    } catch (error) {
      console.error('Escalation cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Friday digest: Friday at 9:00 AM CT
  cron.schedule('0 9 * * 5', async () => {
    console.log('Generating Friday digest...');
    try {
      await generateDigest(client);
    } catch (error) {
      console.error('Digest cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Weekly SOP review: Wednesday at 10:00 AM CT
  cron.schedule('0 10 * * 3', async () => {
    console.log('Running weekly SOP review (Wednesday 10 AM CT)...');
    try {
      const candidates = getSOPCandidates();
      if (candidates.length === 0) {
        console.log('[sop-cron] No SOP candidates this week.');
        return;
      }

      const reviewChannel = config.channels.founderHubHQ;
      const generated: string[] = [];

      for (const candidate of candidates) {
        try {
          const result = await createSOPForTopic(candidate.topic, { topicId: candidate.id, createdBy: 'system' });
          if (result) {
            generated.push(result.title);
            console.log(`[sop-cron] Generated SOP: "${result.title}" (${result.docId})`);

            if (reviewChannel) {
              await client.chat.postMessage({
                channel: reviewChannel,
                text: `New SOP draft generated: ${result.title}`,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `:page_facing_up: *New SOP Draft:* ${result.title}\n\n${result.summary}\n\nFormat: *${result.format}* | Doc ID: \`${result.docId}\``,
                    },
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Publish' },
                        style: 'primary',
                        action_id: 'sop_publish',
                        value: result.docId,
                      },
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Dismiss' },
                        style: 'danger',
                        action_id: 'sop_dismiss',
                        value: result.docId,
                      },
                    ],
                  },
                ],
              });
            }
          }
        } catch (err) {
          console.error(`[sop-cron] Error generating SOP for topic "${candidate.topic}":`, err);
        }
      }

      console.log(`[sop-cron] Weekly review complete. Generated ${generated.length} SOP(s).`);
    } catch (error) {
      console.error('SOP review cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Daily proactive alerts: 8:30 AM CT, Mon-Fri (DM to Omer, Mark, Ehsan)
  cron.schedule('30 8 * * 1-5', async () => {
    console.log('Running daily proactive alerts (8:30 AM CT)...');
    try {
      const alerts = generateProactiveAlerts();
      const message = formatAlertsForSlack(alerts);

      const leadershipIds = [
        config.escalation.omerSlackUserId,
        config.escalation.markSlackUserId,
        config.escalation.ehsanSlackUserId,
      ].filter(Boolean);

      for (const userId of leadershipIds) {
        try {
          await client.chat.postMessage({
            channel: userId,
            text: message,
          });
        } catch (err) {
          console.error(`[proactive-alerts] Failed to DM ${userId}:`, err);
        }
      }

      console.log(`[proactive-alerts] Sent ${alerts.length} alert(s) to ${leadershipIds.length} leader(s).`);
    } catch (error) {
      console.error('Proactive alerts cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Friday 10 AM CT: Sales Intelligence Digest — sent to leadership channel + DMs to Omer/Mark/Ehsan
  cron.schedule('0 10 * * 5', async () => {
    console.log('Generating weekly sales intelligence digest (Friday 10 AM CT)...');
    try {
      const digest = await generateWeeklyDigest();
      const message = formatDigestForSlack(digest);

      const leadershipIds = [
        config.escalation.omerSlackUserId,
        config.escalation.markSlackUserId,
        config.escalation.ehsanSlackUserId,
      ].filter(Boolean);

      // Post to leadership channel
      const leadershipChannel = config.channels.founderHubHQ;
      if (leadershipChannel) {
        try {
          await client.chat.postMessage({
            channel: leadershipChannel,
            text: message,
          });
        } catch (err) {
          console.error('[sales-digest] Failed to post to leadership channel:', err);
        }
      }

      // DM each leader
      for (const userId of leadershipIds) {
        try {
          await client.chat.postMessage({
            channel: userId,
            text: message,
          });
        } catch (err) {
          console.error(`[sales-digest] Failed to DM ${userId}:`, err);
        }
      }

      console.log(`[sales-digest] Sent digest (${digest.totalCalls} calls) to ${leadershipIds.length} leader(s).`);
    } catch (error) {
      console.error('Sales digest cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Monday 9 AM CT: Weekly coaching summary — DM to reps (motivational) + leadership (detailed)
  // Note: Individual post-call coaching is sent immediately after each call in webhook-handler.ts
  cron.schedule('0 9 * * 1', async () => {
    console.log('Generating weekly coaching summary (Monday 9 AM CT)...');
    try {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

      // Find reps who had calls last week
      const recentCalls = db
        .select({ repSlackId: callAnalyses.repSlackId })
        .from(callAnalyses)
        .where(gt(callAnalyses.createdAt, weekAgo))
        .all();

      const repIds = [...new Set(
        recentCalls
          .map((c) => c.repSlackId)
          .filter((id): id is string => !!id),
      )];

      if (repIds.length === 0) {
        console.log('[coaching] No reps with calls last week, skipping weekly summary.');
        return;
      }

      const leadershipIds = [
        config.escalation.omerSlackUserId,
        config.escalation.markSlackUserId,
        config.escalation.ehsanSlackUserId,
      ].filter(Boolean);

      for (const repId of repIds) {
        try {
          const snapshot = await generateCoachingSnapshot(repId);

          // 1. DM the rep themselves with weekly summary coaching
          try {
            const repMessage = formatCoachingForRep(snapshot.repName ?? repId, snapshot);
            await client.chat.postMessage({
              channel: repId,
              text: `Weekly summary\n\n${repMessage}`,
            });
            console.log(`[coaching] Sent weekly coaching summary to rep ${repId} (${snapshot.role}, grade=${snapshot.overallGrade})`);
          } catch (err) {
            console.error(`[coaching] Failed to DM rep ${repId}:`, err);
          }

          // 2. DM leadership with detailed coaching flags
          if (snapshot.coachingFlags.length > 0) {
            const leaderMessage = formatCoachingForSlack(snapshot.repName ?? repId, snapshot);

            for (const leaderId of leadershipIds) {
              try {
                await client.chat.postMessage({
                  channel: leaderId,
                  text: `Weekly summary\n\n${leaderMessage}`,
                });
              } catch (err) {
                console.error(`[coaching] Failed to DM leader ${leaderId}:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`[coaching] Failed to generate snapshot for rep ${repId}:`, err);
        }
      }

      console.log(`[coaching] Processed weekly summaries for ${repIds.length} rep(s).`);
    } catch (error) {
      console.error('Coaching cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  // Daily 8:00 AM CT — Personalized morning briefing DM to each team member with open tasks
  cron.schedule('0 8 * * 1-5', async () => {
    console.log('[cron] Sending personalized morning briefings...');
    try {
      const allOpenTasks = db
        .select()
        .from(tasks)
        .where(and(ne(tasks.status, 'COMPLETED'), ne(tasks.status, 'DISMISSED')))
        .all();

      const userIds = [...new Set(allOpenTasks.map((t) => t.slackUserId))];

      for (const userId of userIds) {
        try {
          const userTasks = allOpenTasks.filter((t) => t.slackUserId === userId);
          const overdue = userTasks.filter((t) => {
            if (!t.deadline) return false;
            const dl = t.deadline instanceof Date ? t.deadline : new Date(Number(t.deadline) * 1000);
            return dl < new Date();
          });
          const dueToday = userTasks.filter((t) => {
            if (!t.deadline) return false;
            const dl = t.deadline instanceof Date ? t.deadline : new Date(Number(t.deadline) * 1000);
            const today = new Date();
            return dl.toDateString() === today.toDateString();
          });
          const upcoming = userTasks.filter((t) => t.status !== 'DISMISSED').slice(0, 5);

          // Get their recent call analyses
          const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
          const recentCalls = db
            .select()
            .from(callAnalyses)
            .where(and(eq(callAnalyses.repSlackId, userId), gt(callAnalyses.createdAt, weekAgo)))
            .all();

          // Build message
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : 'Good afternoon';

          let msg = `${greeting}! Here's your daily briefing from Atlas Chief:\n\n`;

          if (overdue.length > 0) {
            msg += `\uD83D\uDD34 *${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}:*\n`;
            for (const t of overdue) msg += `\u2022 ${t.description}\n`;
            msg += '\n';
          }

          if (dueToday.length > 0) {
            msg += `\uD83D\uDCC5 *Due today:*\n`;
            for (const t of dueToday) msg += `\u2022 ${t.description}\n`;
            msg += '\n';
          }

          if (upcoming.length > 0 && overdue.length === 0 && dueToday.length === 0) {
            msg += `\uD83D\uDCCB *Your open tasks (${upcoming.length}):*\n`;
            for (const t of upcoming) msg += `\u2022 ${t.description}\n`;
            msg += '\n';
          }

          if (recentCalls.length > 0) {
            msg += `\uD83D\uDCDE *${recentCalls.length} call${recentCalls.length > 1 ? 's' : ''} analyzed this week*\n`;
          }

          msg += `\n_Open your Command Center for the full briefing._`;

          await client.chat.postMessage({ channel: userId, text: msg });
        } catch (err) {
          console.error(`[cron] Morning briefing failed for ${userId}:`, err);
        }
      }

      console.log(`[cron] Morning briefings sent to ${userIds.length} team member(s).`);
    } catch (error) {
      console.error('Morning briefing cron error:', error);
    }
  }, { timezone: 'America/Chicago' });

  console.log('Cron jobs started (timezone: America/Chicago)');
  console.log('  - Reminders: 8:00 AM + 4:00 PM CT, Mon-Fri (DM to each person)');
  console.log('  - Escalation: 9:00 AM + 5:00 PM CT, Mon-Fri (DM to Omer, Mark, Ehsan)');
  console.log('  - Friday digest: Fridays at 9:00 AM CT');
  console.log('  - SOP review: Wednesdays at 10:00 AM CT');
  console.log('  - Proactive alerts: 8:30 AM CT, Mon-Fri (DM to Omer, Mark, Ehsan)');
  console.log('  - Sales digest: Fridays at 10:00 AM CT (leadership channel + DMs)');
  console.log('  - Coaching weekly summary: Mondays at 9:00 AM CT (DM to reps + leadership)');
  console.log('  - Morning briefing: 8:00 AM CT, Mon-Fri (personalized DM to each member)');
}

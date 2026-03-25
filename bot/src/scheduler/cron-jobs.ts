import cron from 'node-cron';
import { processReminders, processEscalations } from '../tasks/reminder-service';
import { generateDigest } from '../tasks/digest-service';
import { getSOPCandidates } from '../services/topic-tracker';
import { createSOPForTopic } from '../services/sop-service';
import { config } from '../config';

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

  console.log('Cron jobs started (timezone: America/Chicago)');
  console.log('  - Reminders: 8:00 AM + 4:00 PM CT, Mon-Fri (DM to each person)');
  console.log('  - Escalation: 9:00 AM + 5:00 PM CT, Mon-Fri (DM to Omer, Mark, Ehsan)');
  console.log('  - Friday digest: Fridays at 9:00 AM CT');
  console.log('  - SOP review: Wednesdays at 10:00 AM CT');
}

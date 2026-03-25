import cron from 'node-cron';
import { processReminders, processEscalations } from '../tasks/reminder-service';
import { generateDigest } from '../tasks/digest-service';

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

  console.log('Cron jobs started (timezone: America/Chicago)');
  console.log('  - Reminders: 8:00 AM + 4:00 PM CT, Mon-Fri (DM to each person)');
  console.log('  - Escalation: 9:00 AM + 5:00 PM CT, Mon-Fri (DM to Omer, Mark, Ehsan)');
  console.log('  - Friday digest: Fridays at 9:00 AM CT');
}

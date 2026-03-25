import { BrowserWindow } from 'electron';
import { CalendarClient, CalendarMeeting } from '../calendar/google-calendar';
import { generateFollowUp } from './follow-up-generator';
import { IPC } from '../../shared/types';
import { getMyTasks } from '../db/task-bridge';

export class CompletionDetector {
  private detectedMeetings: Set<string> = new Set();

  async checkForEndedMeetings(
    mainWindow: BrowserWindow,
    calendar: CalendarClient,
  ): Promise<void> {
    try {
      const ended = await calendar.getRecentlyEndedMeetings(5);

      for (const meeting of ended) {
        if (this.detectedMeetings.has(meeting.id)) continue;
        if (meeting.attendees.length <= 1) continue;

        this.detectedMeetings.add(meeting.id);

        // Check if bot already processed this meeting (look for recent zoom-sourced tasks)
        const allTasks = getMyTasks();
        const recentZoomTasks = (allTasks as any[]).filter((t: any) => {
          if (t.source !== 'zoom') return false;
          const created = new Date(t.createdAt);
          const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
          return created > fifteenMinAgo;
        });

        const actionItems = recentZoomTasks.map((t: any) => ({
          description: t.description,
          owner: t.slackUserName || undefined,
        }));

        try {
          const draft = await generateFollowUp(meeting, actionItems.length > 0 ? actionItems : undefined);
          mainWindow.webContents.send(IPC.FOLLOWUP_SHOW, draft);
          console.log(`Follow-up draft generated for: ${meeting.title}`);
        } catch (err) {
          console.error(`Failed to generate follow-up for ${meeting.title}:`, err);
        }
      }

      // Cleanup
      if (this.detectedMeetings.size > 100) {
        this.detectedMeetings.clear();
      }
    } catch (err) {
      console.error('Completion detector check failed:', err);
    }
  }
}

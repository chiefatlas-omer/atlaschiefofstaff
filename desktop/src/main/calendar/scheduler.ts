import { BrowserWindow } from 'electron';
import { CalendarClient, CalendarMeeting } from './google-calendar';
import { generateMeetingBrief } from './meeting-prep';
import { CompletionDetector } from '../meeting/completion-detector';
import { IPC } from '../../shared/types';
import { config } from '../config';

export class MeetingScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private briefedMeetings: Set<string> = new Set();
  private detector: CompletionDetector = new CompletionDetector();

  start(mainWindow: BrowserWindow, calendar: CalendarClient): void {
    const pollMs = config.meetingPrep.pollIntervalMs;
    const minutesBefore = config.meetingPrep.minutesBefore;

    console.log(`Meeting scheduler started: checking every ${pollMs / 1000}s, briefing ${minutesBefore}min before`);

    // Initial check
    this.poll(mainWindow, calendar, minutesBefore);

    // Periodic polling
    this.intervalId = setInterval(() => {
      this.poll(mainWindow, calendar, minutesBefore);
    }, pollMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(mainWindow: BrowserWindow, calendar: CalendarClient, minutesBefore: number): Promise<void> {
    try {
      // Check upcoming meetings for prep
      const upcoming = await calendar.getUpcomingMeetings(minutesBefore);

      for (const meeting of upcoming) {
        if (this.briefedMeetings.has(meeting.id)) continue;
        if (meeting.attendees.length <= 1) continue; // Skip solo events

        this.briefedMeetings.add(meeting.id);

        try {
          const brief = await generateMeetingBrief(meeting);
          mainWindow.webContents.send(IPC.BRIEFING_SHOW, brief);
          console.log(`Meeting brief generated for: ${meeting.title}`);
        } catch (err) {
          console.error(`Failed to generate brief for ${meeting.title}:`, err);
        }
      }

      // Check recently ended meetings for follow-ups
      await this.detector.checkForEndedMeetings(mainWindow, calendar);

      // Clean up old entries
      this.cleanupOldEntries();
    } catch (err) {
      console.error('Meeting scheduler poll failed:', err);
    }
  }

  private cleanupOldEntries(): void {
    // Simple cleanup: if sets get too large, clear them
    if (this.briefedMeetings.size > 100) {
      this.briefedMeetings.clear();
    }
  }
}

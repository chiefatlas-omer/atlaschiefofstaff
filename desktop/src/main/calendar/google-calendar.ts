import { google } from 'googleapis';
import { GoogleAuth } from '../auth/google-auth';

export interface CalendarMeeting {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: Array<{ email: string; name?: string; self?: boolean }>;
  meetingLink?: string;
  description?: string;
}

export class CalendarClient {
  constructor(private auth: GoogleAuth) {}

  async getUpcomingMeetings(withinMinutes: number): Promise<CalendarMeeting[]> {
    const client = await this.auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const now = new Date();
    const later = new Date(now.getTime() + withinMinutes * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: later.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    const events = response.data.items || [];

    return events
      .filter((event) => event.start?.dateTime) // Skip all-day events
      .map((event) => ({
        id: event.id || '',
        title: event.summary || 'Untitled Meeting',
        startTime: new Date(event.start!.dateTime!),
        endTime: new Date(event.end?.dateTime || event.start!.dateTime!),
        attendees: (event.attendees || []).map((a) => ({
          email: a.email || '',
          name: a.displayName || undefined,
          self: a.self || false,
        })),
        meetingLink: event.hangoutLink || extractMeetingLink(event.description || '', event.location || ''),
        description: event.description || undefined,
      }));
  }

  async getRecentlyEndedMeetings(withinMinutes: number): Promise<CalendarMeeting[]> {
    const client = await this.auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const now = new Date();
    const earlier = new Date(now.getTime() - withinMinutes * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: earlier.toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    const events = response.data.items || [];

    return events
      .filter((event) => {
        if (!event.end?.dateTime) return false;
        const endTime = new Date(event.end.dateTime);
        return endTime <= now && endTime >= earlier;
      })
      .map((event) => ({
        id: event.id || '',
        title: event.summary || 'Untitled Meeting',
        startTime: new Date(event.start!.dateTime!),
        endTime: new Date(event.end!.dateTime!),
        attendees: (event.attendees || []).map((a) => ({
          email: a.email || '',
          name: a.displayName || undefined,
          self: a.self || false,
        })),
        meetingLink: event.hangoutLink || extractMeetingLink(event.description || '', event.location || ''),
        description: event.description || undefined,
      }));
  }
}

function extractMeetingLink(description: string, location: string): string | undefined {
  const zoomPattern = /https:\/\/[\w.-]*zoom\.us\/[^\s<")]+/i;
  const meetPattern = /https:\/\/meet\.google\.com\/[^\s<")]+/i;
  const teamsPattern = /https:\/\/teams\.microsoft\.com\/[^\s<")]+/i;

  for (const text of [location, description]) {
    const zoom = text.match(zoomPattern);
    if (zoom) return zoom[0];
    const meet = text.match(meetPattern);
    if (meet) return meet[0];
    const teams = text.match(teamsPattern);
    if (teams) return teams[0];
  }
  return undefined;
}

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { CalendarMeeting } from './google-calendar';
import { getMyTasks } from '../db/task-bridge';
import { MeetingBrief, Task } from '../../shared/types';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function generateMeetingBrief(meeting: CalendarMeeting): Promise<MeetingBrief> {
  // Get open tasks (we'll check if any involve attendees by name)
  const allTasks = getMyTasks();

  // Try to find tasks mentioning attendee names
  const attendeeNames = meeting.attendees
    .filter(a => !a.self)
    .map(a => a.name || a.email.split('@')[0]);

  const relevantTasks = allTasks.filter((task: any) => {
    const desc = task.description.toLowerCase();
    return attendeeNames.some(name => desc.toLowerCase().includes(name.toLowerCase()));
  });

  // Generate talking points via Claude
  let suggestedTalkingPoints: string[] = [];

  try {
    const context = [
      `Meeting: ${meeting.title}`,
      `Time: ${meeting.startTime.toLocaleTimeString()}`,
      `Attendees: ${meeting.attendees.filter(a => !a.self).map(a => a.name || a.email).join(', ')}`,
      meeting.description ? `Description: ${meeting.description}` : '',
      relevantTasks.length > 0
        ? `Related open tasks:\n${relevantTasks.map((t: any) => `- ${t.description} (${t.status})`).join('\n')}`
        : 'No directly related tasks found.',
    ].filter(Boolean).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 500,
      system: 'Generate 3-5 concise talking points for an upcoming meeting based on the context. Return as a JSON array of strings. Only output the JSON array, nothing else.',
      messages: [{ role: 'user', content: context }],
    });

    const text = (response.content[0] as any).text || '[]';
    suggestedTalkingPoints = JSON.parse(text);
  } catch (err) {
    console.error('Failed to generate talking points:', err);
    suggestedTalkingPoints = ['Review open action items', 'Discuss next steps'];
  }

  return {
    meetingTitle: meeting.title,
    startTime: meeting.startTime.toISOString(),
    attendees: meeting.attendees
      .filter(a => !a.self)
      .map(a => ({
        name: a.name || a.email.split('@')[0],
        email: a.email,
      })),
    openTasks: relevantTasks as Task[],
    suggestedTalkingPoints,
  };
}

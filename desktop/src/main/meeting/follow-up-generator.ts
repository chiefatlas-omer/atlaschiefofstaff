import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { CalendarMeeting } from '../calendar/google-calendar';
import { FollowUpDraft } from '../../shared/types';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function generateFollowUp(
  meeting: CalendarMeeting,
  actionItems?: Array<{ description: string; owner?: string }>,
): Promise<FollowUpDraft> {
  const attendeeEmails = meeting.attendees
    .filter(a => !a.self)
    .map(a => a.email);

  const attendeeNames = meeting.attendees
    .filter(a => !a.self)
    .map(a => a.name || a.email.split('@')[0]);

  const meetingDate = meeting.startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const context = [
    `Meeting: ${meeting.title}`,
    `Date: ${meetingDate}`,
    `Attendees: ${attendeeNames.join(', ')}`,
    meeting.description ? `Agenda/Description: ${meeting.description}` : '',
    actionItems && actionItems.length > 0
      ? `Action items from the meeting:\n${actionItems.map(a => `- ${a.description}${a.owner ? ` (Owner: ${a.owner})` : ''}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 1000,
      system: `Generate a professional follow-up email for a meeting that just ended.
Return a JSON object with exactly these fields:
- "subject": email subject line (format: "Follow-up: {topic} — {date}")
- "body": HTML email body with <p> tags, <ul> for action items, professional but concise

Tone guidelines:
- If attendees seem internal (same company domain): concise and action-oriented
- If attendees seem external: more formal, recap key points

Only output the JSON object, nothing else.`,
      messages: [{ role: 'user', content: context }],
    });

    const text = (response.content[0] as any).text || '{}';
    const parsed = JSON.parse(text);

    return {
      to: attendeeEmails,
      subject: parsed.subject || `Follow-up: ${meeting.title} — ${meetingDate}`,
      body: parsed.body || '<p>Thank you for the meeting. Please find the action items below.</p>',
      meetingTitle: meeting.title,
    };
  } catch (err) {
    console.error('Failed to generate follow-up:', err);
    // Fallback draft
    return {
      to: attendeeEmails,
      subject: `Follow-up: ${meeting.title} — ${meetingDate}`,
      body: `<p>Hi ${attendeeNames.join(', ')},</p><p>Thank you for the meeting today. Here are the key takeaways and next steps:</p><ul><li>[Add items here]</li></ul><p>Best regards</p>`,
      meetingTitle: meeting.title,
    };
  }
}

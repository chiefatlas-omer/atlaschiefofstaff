import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export type Intent = 'TASK_QUERY' | 'COMPUTER_USE' | 'MEETING_PREP' | 'GENERAL';

export async function classifyIntent(transcript: string): Promise<{
  intent: Intent;
  command?: string;
}> {
  const lower = transcript.toLowerCase();

  // Fast regex first-pass for obvious patterns
  // Check computer use FIRST (e.g., "show me the LinkedIn page" should route here, not tasks)
  const computerUsePatterns = /\b(open|click|go to|navigate|type|scroll|move .* to|drag|search for|fill in|submit|close the|switch to|log into)\b/i;
  if (computerUsePatterns.test(lower)) {
    return { intent: 'COMPUTER_USE', command: transcript };
  }

  const taskPatterns = /\b(task|to.?do|overdue|what do i need|my plate|pending|open items|my tasks)\b/i;
  if (taskPatterns.test(lower)) {
    return { intent: 'TASK_QUERY' };
  }

  const meetingPatterns = /\b(brief me|next meeting|who am i meeting|meeting prep|upcoming call|prepare for)\b/i;
  if (meetingPatterns.test(lower)) {
    return { intent: 'MEETING_PREP' };
  }

  // Claude Haiku fallback for ambiguous cases
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: `Classify the user's voice command into exactly one category. Respond with ONLY the category name, nothing else.

Categories:
- TASK_QUERY: asking about tasks, to-dos, deadlines, what they need to do
- COMPUTER_USE: requesting an action on the computer (open apps, click things, navigate websites, fill forms, move items in software)
- MEETING_PREP: asking about upcoming meetings, wanting a briefing, who they're meeting with
- GENERAL: everything else (questions, conversation, research requests)`,
      messages: [{ role: 'user', content: transcript }],
    });

    const text = (response.content[0] as any).text?.trim().toUpperCase() || 'GENERAL';
    const validIntents: Intent[] = ['TASK_QUERY', 'COMPUTER_USE', 'MEETING_PREP', 'GENERAL'];
    const intent = validIntents.includes(text as Intent) ? (text as Intent) : 'GENERAL';

    return {
      intent,
      command: intent === 'COMPUTER_USE' ? transcript : undefined,
    };
  } catch (err) {
    console.error('Intent classification failed, defaulting to GENERAL:', err);
    return { intent: 'GENERAL' };
  }
}

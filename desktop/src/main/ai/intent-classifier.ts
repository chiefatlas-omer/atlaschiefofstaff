import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export type Intent = 'TASK_QUERY' | 'MEETING_PREP' | 'KNOWLEDGE_QUERY' | 'GENERAL';

export async function classifyIntent(transcript: string): Promise<{
  intent: Intent;
  command?: string;
}> {
  const lower = transcript.toLowerCase();

  // Fast regex first-pass for obvious patterns
  const taskPatterns = /\b(task|to.?do|overdue|what do i need|my plate|pending|open items|my tasks)\b/i;
  if (taskPatterns.test(lower)) {
    return { intent: 'TASK_QUERY' };
  }

  const meetingPatterns = /\b(brief me|next meeting|who am i meeting|meeting prep|upcoming call|prepare for)\b/i;
  if (meetingPatterns.test(lower)) {
    return { intent: 'MEETING_PREP' };
  }

  const knowledgePatterns = /\b(what is|how do|who handles|what's our|tell me about|explain|where can i find|process for|pricing|policy)\b/i;
  if (knowledgePatterns.test(lower)) {
    return { intent: 'KNOWLEDGE_QUERY' };
  }

  // Claude Haiku fallback for ambiguous cases
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: `Classify the user's voice command into exactly one category. Respond with ONLY the category name, nothing else.

Categories:
- TASK_QUERY: asking about tasks, to-dos, deadlines, what they need to do
- MEETING_PREP: asking about upcoming meetings, wanting a briefing, who they're meeting with
- KNOWLEDGE_QUERY: asking about company policies, processes, pricing, SOPs, how things work, or any factual question about the business
- GENERAL: everything else (questions, conversation, research requests)`,
      messages: [{ role: 'user', content: transcript }],
    });

    const text = (response.content[0] as any).text?.trim().toUpperCase() || 'GENERAL';
    const validIntents: Intent[] = ['TASK_QUERY', 'MEETING_PREP', 'KNOWLEDGE_QUERY', 'GENERAL'];
    const intent = validIntents.includes(text as Intent) ? (text as Intent) : 'GENERAL';

    return { intent };
  } catch (err) {
    console.error('Intent classification failed, defaulting to GENERAL:', err);
    return { intent: 'GENERAL' };
  }
}

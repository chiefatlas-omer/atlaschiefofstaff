import { anthropic } from './client';
import { TRANSCRIPT_PROCESSING_PROMPT } from './prompts';

export interface TranscriptActionItem {
  owner_name: string;
  action: string;
  deadline_text: string | null;
  context: string;
}

export interface TranscriptResult {
  summary: string[];
  action_items: TranscriptActionItem[];
  decisions: string[];
  open_questions: string[];
}

export async function processTranscript(
  transcriptText: string,
  participantMapping?: Record<string, string>,
  hostContext?: { hostName: string },
  externalNames?: string[],
): Promise<TranscriptResult> {
  const internalNames = participantMapping ? Object.keys(participantMapping) : [];
  const mappingInfo = internalNames.length > 0
    ? '\n\nINTERNAL team members (only assign tasks to these people):\n' + internalNames.join(', ')
    + (externalNames && externalNames.length > 0
      ? '\n\nEXTERNAL participants (do NOT assign tasks to these people):\n' + externalNames.join(', ')
      : '')
    : '';

  const hostInfo = hostContext
    ? '\n\nThe meeting host is: ' + hostContext.hostName + '. Any first-person statements like "I will..." or "I need to..." should be attributed to ' + hostContext.hostName + '.'
    : '';

  const truncated = transcriptText.length > 30000
    ? transcriptText.substring(0, 30000) + '\n[...transcript truncated for processing]'
    : transcriptText;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: TRANSCRIPT_PROCESSING_PROMPT + mappingInfo + hostInfo + '\n\nTranscript:\n' + truncated,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { summary: [], action_items: [], decisions: [], open_questions: [] };
    }

    // Strip markdown code fences if Claude wrapped the response
    let text = content.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    return JSON.parse(text);
  } catch (error) {
    console.error('Error processing transcript:', error);
    return { summary: [], action_items: [], decisions: [], open_questions: [] };
  }
}

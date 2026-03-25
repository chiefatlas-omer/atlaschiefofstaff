import { anthropic } from './client';
import { COMMITMENT_EXTRACTION_PROMPT } from './prompts';

interface SlackMessageInput {
  user: string;
  text: string;
  ts: string;
  channel: string;
}

export interface ExtractedCommitment {
  who: string;
  what: string;
  deadline_text: string | null;
  confidence: 'high' | 'medium';
  message_ts: string;
  channel: string;
}

interface ExtractionResult {
  commitments: ExtractedCommitment[];
}

export async function extractCommitments(messages: SlackMessageInput[]): Promise<ExtractedCommitment[]> {
  if (messages.length === 0) return [];

  const messagesJson = JSON.stringify(
    messages.map((m) => ({
      user: m.user,
      text: m.text,
      ts: m.ts,
      channel: m.channel,
    }))
  );

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${COMMITMENT_EXTRACTION_PROMPT}\n\nMessages:\n${messagesJson}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') return [];

    const parsed: ExtractionResult = JSON.parse(content.text);
    return parsed.commitments || [];
  } catch (error) {
    console.error('Error extracting commitments:', error);
    return [];
  }
}

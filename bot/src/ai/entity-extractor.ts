import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './client';
import { ENTITY_EXTRACTION_PROMPT } from './prompts';

export interface ExtractedEntities {
  people: Array<{ name: string; role: string }>;
  companies: Array<{ name: string; industry: string }>;
  decisions: Array<{ what: string; decided_by: string; context: string }>;
  topics: string[];
  followups: Array<{ who: string; what: string; deadline_text: string }>;
}

const EMPTY_RESULT: ExtractedEntities = {
  people: [],
  companies: [],
  decisions: [],
  topics: [],
  followups: [],
};

export async function extractEntities(text: string): Promise<ExtractedEntities> {
  const truncated = text.length > 15000 ? text.slice(0, 15000) : text;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `${ENTITY_EXTRACTION_PROMPT}\n\nText to analyze:\n${truncated}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') return { ...EMPTY_RESULT };

    // Strip markdown code fences if present
    let raw = content.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed: ExtractedEntities = JSON.parse(raw);

    return {
      people: parsed.people ?? [],
      companies: parsed.companies ?? [],
      decisions: parsed.decisions ?? [],
      topics: parsed.topics ?? [],
      followups: parsed.followups ?? [],
    };
  } catch (error) {
    console.error('Error extracting entities:', error);
    return { ...EMPTY_RESULT };
  }
}

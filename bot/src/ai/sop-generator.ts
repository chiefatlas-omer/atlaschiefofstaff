import { anthropic } from './client';
import { SOP_GENERATION_PROMPT, SOP_UPDATE_PROMPT } from './prompts';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_INPUT_CHARS = 20000;

// --- Types ---

export interface GeneratedSOP {
  format: 'CHECKLIST' | 'DECISION_TREE' | 'WIKI';
  title: string;
  content: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SOPUpdateResult {
  needsUpdate: boolean;
  reason: string;
  updatedContent: string | null;
  changesSummary: string | null;
}

// --- Helpers ---

function truncateToLimit(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return text.slice(0, MAX_INPUT_CHARS) + '\n\n[...truncated for length...]';
}

function parseJSON<T>(text: string): T | null {
  try {
    // Strip markdown code fences if present
    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

// --- SOP Generation ---

export async function generateSOP(
  topic: string,
  excerpts: string[],
): Promise<GeneratedSOP | null> {
  const excerptBlock = truncateToLimit(
    excerpts.map((e, i) => `--- Excerpt ${i + 1} ---\n${e}`).join('\n\n'),
  );

  const userMessage = `Topic: ${topic}\n\nRelevant excerpts:\n\n${excerptBlock}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SOP_GENERATION_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const parsed = parseJSON<{
      format: string;
      title: string;
      content: string;
      summary: string;
      confidence: string;
    }>(text);

    if (!parsed || !parsed.format || !parsed.title || !parsed.content) {
      console.error('[sop-generator] Failed to parse SOP JSON response');
      return null;
    }

    return {
      format: parsed.format as GeneratedSOP['format'],
      title: parsed.title,
      content: parsed.content,
      summary: parsed.summary ?? '',
      confidence: (parsed.confidence as GeneratedSOP['confidence']) ?? 'medium',
    };
  } catch (err) {
    console.error('[sop-generator] Error generating SOP:', err);
    return null;
  }
}

// --- SOP Update Check ---

export async function checkSOPUpdate(
  currentContent: string,
  newExcerpts: string[],
): Promise<SOPUpdateResult | null> {
  const excerptBlock = truncateToLimit(
    newExcerpts.map((e, i) => `--- New Excerpt ${i + 1} ---\n${e}`).join('\n\n'),
  );

  const currentTruncated = truncateToLimit(currentContent);

  const userMessage = `Current SOP:\n\n${currentTruncated}\n\nNew excerpts to consider:\n\n${excerptBlock}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SOP_UPDATE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const parsed = parseJSON<{
      needs_update: boolean;
      reason: string;
      updated_content: string | null;
      changes_summary: string | null;
    }>(text);

    if (!parsed || typeof parsed.needs_update !== 'boolean') {
      console.error('[sop-generator] Failed to parse SOP update JSON response');
      return null;
    }

    return {
      needsUpdate: parsed.needs_update,
      reason: parsed.reason ?? '',
      updatedContent: parsed.updated_content ?? null,
      changesSummary: parsed.changes_summary ?? null,
    };
  } catch (err) {
    console.error('[sop-generator] Error checking SOP update:', err);
    return null;
  }
}

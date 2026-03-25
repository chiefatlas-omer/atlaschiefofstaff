import { eq } from 'drizzle-orm';
import { db } from '../db/connection';
import { qaInteractions } from '../db/schema';
import { storeKnowledgeEntry } from './embedding-service';

// --- Types ---

export interface RecordQAInput {
  question: string;
  answer: string;
  confidence?: string;
  sourceEntryIds?: number[];
  askedBy?: string;
  askedVia?: string;
}

export interface KnowledgeGap {
  question: string;
  occurrences: number;
}

export interface AccuracyStats {
  total: number;
  correct: number;
  incorrect: number;
  unrated: number;
  accuracyRate: number;
}

// --- Record a Q&A Interaction ---

export function recordQA(input: RecordQAInput): number {
  const now = Math.floor(Date.now() / 1000);

  db.insert(qaInteractions)
    .values({
      question: input.question,
      answer: input.answer,
      wasCorrect: null,
      correction: null,
      confidence: input.confidence ?? null,
      sourceEntryIds: input.sourceEntryIds ?? null,
      askedBy: input.askedBy ?? null,
      askedVia: input.askedVia ?? null,
      createdAt: now,
    })
    .run();

  // Retrieve the inserted row to get its auto-incremented ID
  const inserted = db
    .select()
    .from(qaInteractions)
    .where(eq(qaInteractions.createdAt, now))
    .all()
    .pop();

  return inserted?.id ?? 0;
}

// --- Record a Correction ---

export async function recordCorrection(
  qaId: number,
  correction: string,
): Promise<void> {
  // Mark the interaction as incorrect with the correction stored
  db.update(qaInteractions)
    .set({
      wasCorrect: false,
      correction,
    })
    .where(eq(qaInteractions.id, qaId))
    .run();

  // Retrieve the original Q&A for context
  const interaction = db
    .select()
    .from(qaInteractions)
    .where(eq(qaInteractions.id, qaId))
    .get();

  if (!interaction) {
    console.warn(`[feedback-service] Q&A interaction not found: ${qaId}`);
    return;
  }

  // Store the correction as a high-weight knowledge entry
  const knowledgeContent = `Q: ${interaction.question}\nCorrect answer: ${correction}\n(Previous answer was incorrect: ${interaction.answer})`;

  try {
    await storeKnowledgeEntry({
      sourceType: 'correction',
      sourceId: String(qaId),
      content: knowledgeContent,
      metadata: {
        qaId,
        originalAnswer: interaction.answer,
        correction,
        weight: 'high',
      },
    });
    console.log(`[feedback-service] Stored correction as knowledge entry for Q&A ${qaId}`);
  } catch (err) {
    console.error('[feedback-service] Error storing correction as knowledge entry:', err);
  }
}

// --- Mark Correct ---

export function markCorrect(qaId: number): void {
  db.update(qaInteractions)
    .set({ wasCorrect: true })
    .where(eq(qaInteractions.id, qaId))
    .run();
}

// --- Get Knowledge Gaps ---

export function getKnowledgeGaps(limit = 10): KnowledgeGap[] {
  // Find Q&A interactions with low confidence and group by similar questions
  const lowConfidenceRows = db
    .select()
    .from(qaInteractions)
    .where(eq(qaInteractions.confidence, 'low'))
    .all();

  // Group by normalized question text
  const grouped = new Map<string, number>();

  for (const row of lowConfidenceRows) {
    const key = row.question.toLowerCase().trim().replace(/\s+/g, ' ');
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  // Sort by occurrence count descending, take top N
  return Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([question, occurrences]) => ({ question, occurrences }));
}

// --- Get Accuracy Stats ---

export function getAccuracyStats(): AccuracyStats {
  const all = db.select().from(qaInteractions).all();

  const total = all.length;
  const correct = all.filter((r) => r.wasCorrect === true).length;
  const incorrect = all.filter((r) => r.wasCorrect === false).length;
  const unrated = all.filter((r) => r.wasCorrect === null).length;
  const rated = correct + incorrect;
  const accuracyRate = rated > 0 ? correct / rated : 0;

  return { total, correct, incorrect, unrated, accuracyRate };
}

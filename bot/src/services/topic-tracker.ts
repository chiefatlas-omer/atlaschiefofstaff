import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { topicCounts } from '../db/schema';

const SOP_THRESHOLD = 5;

// --- Normalization ---

export function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim().replace(/\s+/g, ' ');
}

// --- Core Operations ---

export interface SOPCandidate {
  id: number;
  topic: string;
  normalizedTopic: string;
  occurrences: number;
}

export async function recordTopics(
  topics: string[],
  sourceType: string,
  sourceId: string,
): Promise<SOPCandidate[]> {
  const sopCandidates: SOPCandidate[] = [];

  for (const rawTopic of topics) {
    const normalized = normalizeTopic(rawTopic);
    if (!normalized) continue;

    const existing = db
      .select()
      .from(topicCounts)
      .where(eq(topicCounts.normalizedTopic, normalized))
      .get();

    if (existing) {
      // Update occurrence count and source tracking
      const existingSourceTypes = (existing.sourceTypes as string[] | null) ?? [];
      const existingSourceIds = (existing.sourceIds as string[] | null) ?? [];

      const updatedSourceTypes = existingSourceTypes.includes(sourceType)
        ? existingSourceTypes
        : [...existingSourceTypes, sourceType];

      const updatedSourceIds = existingSourceIds.includes(sourceId)
        ? existingSourceIds
        : [...existingSourceIds, sourceId];

      const newOccurrences = existing.occurrences + 1;

      db.update(topicCounts)
        .set({
          occurrences: newOccurrences,
          sourceTypes: updatedSourceTypes,
          sourceIds: updatedSourceIds,
          lastSeenAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(topicCounts.id, existing.id))
        .run();

      // Check if this update crosses the SOP threshold
      if (newOccurrences >= SOP_THRESHOLD && !existing.sopGenerated) {
        sopCandidates.push({
          id: existing.id,
          topic: existing.topic,
          normalizedTopic: normalized,
          occurrences: newOccurrences,
        });
      }
    } else {
      // Insert new topic
      const now = Math.floor(Date.now() / 1000);
      db.insert(topicCounts)
        .values({
          topic: rawTopic,
          normalizedTopic: normalized,
          occurrences: 1,
          sourceTypes: [sourceType],
          sourceIds: [sourceId],
          lastSeenAt: now,
          sopGenerated: false,
          sopId: null,
          createdAt: now,
        })
        .run();
    }
  }

  return sopCandidates;
}

export function getSOPCandidates(): SOPCandidate[] {
  const rows = db
    .select()
    .from(topicCounts)
    .where(eq(topicCounts.sopGenerated, false))
    .all();

  return rows
    .filter((r) => r.occurrences >= SOP_THRESHOLD)
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      normalizedTopic: r.normalizedTopic,
      occurrences: r.occurrences,
    }));
}

export function markSOPGenerated(topicId: number, sopDocId: string): void {
  db.update(topicCounts)
    .set({
      sopGenerated: true,
      sopId: sopDocId,
    })
    .where(eq(topicCounts.id, topicId))
    .run();
}

export function getTopTopics(limit = 20): Array<{
  id: number;
  topic: string;
  normalizedTopic: string;
  occurrences: number;
  sopGenerated: boolean | null;
  sopId: string | null;
}> {
  return db
    .select()
    .from(topicCounts)
    .orderBy(desc(topicCounts.occurrences))
    .limit(limit)
    .all()
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      normalizedTopic: r.normalizedTopic,
      occurrences: r.occurrences,
      sopGenerated: r.sopGenerated ?? false,
      sopId: r.sopId ?? null,
    }));
}

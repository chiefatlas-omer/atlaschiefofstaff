import OpenAI from 'openai';
import { db } from '../db/connection';
import { knowledgeEntries } from '../db/schema';
import { isNotNull } from 'drizzle-orm';

const openai = new OpenAI();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_SIZE = 50;

// --- Chunking ---

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // Try to break at sentence boundary if not at the end
    if (end < text.length) {
      const slice = text.slice(start, end);
      // Find last period or newline in the chunk
      const lastPeriod = slice.lastIndexOf('.');
      const lastNewline = slice.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > CHUNK_SIZE / 2) {
        // Only use the break point if it's in the second half of the chunk
        end = start + breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_SIZE) {
      chunks.push(chunk);
    }

    // Move start forward with overlap
    start = end - CHUNK_OVERLAP;
    if (start >= end) start = end; // Safety: avoid infinite loop
  }

  return chunks;
}

// --- Embedding Generation ---

export async function generateEmbedding(text: string): Promise<Float32Array> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return new Float32Array(response.data[0].embedding);
}

// --- Cosine Similarity Helper ---

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// --- Storage ---

export interface StoreKnowledgeEntryInput {
  sourceType: string;
  sourceId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export async function storeKnowledgeEntry(input: StoreKnowledgeEntryInput): Promise<void> {
  const embedding = await generateEmbedding(input.content);
  const embeddingBuffer = Buffer.from(embedding.buffer);

  db.insert(knowledgeEntries).values({
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? '',
    content: input.content,
    embedding: embeddingBuffer,
    embeddingModel: EMBEDDING_MODEL,
    metadata: input.metadata ?? null,
  }).run();
}

// --- Bulk Ingest ---

export interface IngestTextInput {
  sourceType: string;
  sourceId?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export async function ingestText(input: IngestTextInput): Promise<number> {
  const chunks = chunkText(input.text);

  for (const chunk of chunks) {
    await storeKnowledgeEntry({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      content: chunk,
      metadata: input.metadata,
    });
  }

  return chunks.length;
}

// --- Semantic Search ---

export interface KnowledgeSearchResult {
  id: number;
  content: string;
  sourceType: string;
  sourceId: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

export async function semanticSearch(
  query: string,
  limit = 10,
): Promise<KnowledgeSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);

  // NOTE: O(n) brute-force search — loads all embedded entries into memory.
  // Acceptable for Phase 1 with small-medium datasets (< 5000 entries).
  // Phase 2+ should migrate to sqlite-vec or Postgres pgvector for scale.
  const entries = db.select().from(knowledgeEntries)
    .where(isNotNull(knowledgeEntries.embedding))
    .all();

  if (entries.length > 5000) {
    console.warn(`[embedding] Semantic search scanning ${entries.length} entries — consider migrating to vector index`);
  }

  const scored: Array<KnowledgeSearchResult & { _sim: number }> = [];

  for (const entry of entries) {
    const entryEmbedding = new Float32Array(
      (entry.embedding as Buffer).buffer,
      (entry.embedding as Buffer).byteOffset,
      (entry.embedding as Buffer).byteLength / Float32Array.BYTES_PER_ELEMENT,
    );

    const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

    scored.push({
      id: entry.id,
      content: entry.content,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      similarity,
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
      _sim: similarity,
    });
  }

  // Sort descending by similarity, take top N
  scored.sort((a, b) => b._sim - a._sim);
  const top = scored.slice(0, limit);

  return top.map(({ _sim: _unused, ...rest }) => rest);
}

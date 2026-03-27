import { Router } from 'express';
import { db } from '../db';
import { documents, knowledgeEntries, qaInteractions } from '../../../../bot/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ingestDocument } from '../../../../bot/src/services/ingestion-service';

const router = Router();

// GET /api/sops — all SOP documents
router.get('/sops', (_req, res) => {
  try {
    const rows = db
      .select()
      .from(documents)
      .where(eq(documents.type, 'sop'))
      .orderBy(desc(documents.updatedAt))
      .all();
    // Extract summary and format from the metadata JSON column
    const enriched = rows.map((d) => ({
      ...d,
      summary: (d.metadata as any)?.summary || null,
      format: (d.metadata as any)?.format || null,
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[knowledge] GET /sops error:', err);
    res.status(500).json({ error: 'Failed to fetch SOPs' });
  }
});

// POST /api/knowledge/upload — ingest a document into the knowledge graph
router.post('/upload', async (req, res) => {
  const { title, type, content } = req.body;
  const validTypes = ['sop', 'playbook', 'pricing_guide', 'process_doc', 'customer_info', 'general'];
  if (!title || !type || !content) {
    res.status(400).json({ error: 'title, type, and content are required' });
    return;
  }
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Valid: ${validTypes.join(', ')}` });
    return;
  }
  try {
    const result = await ingestDocument({ title, content, type });
    res.json({
      success: true,
      docId: result.docId,
      chunkCount: result.chunkCount,
      entities: {
        people: result.entities.people.length,
        companies: result.entities.companies.length,
      },
    });
  } catch (err) {
    console.error('[knowledge] POST /upload error:', err);
    res.status(500).json({ error: 'Ingestion failed' });
  }
});

// POST /api/ask — placeholder for knowledge bot Q&A
router.post('/ask', (req, res) => {
  const { question } = req.body as { question?: string };
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }
  // Placeholder — full semantic search will be wired up in a later phase
  res.json({
    answer: 'Knowledge bot Q&A is not yet implemented in this phase.',
    question: question.trim(),
    placeholder: true,
  });
});

export default router;

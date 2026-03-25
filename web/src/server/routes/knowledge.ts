import { Router } from 'express';
import { db } from '../db';
import { documents, knowledgeEntries, qaInteractions } from '../../../../bot/src/db/schema';
import { eq, desc } from 'drizzle-orm';

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
    res.json(rows);
  } catch (err) {
    console.error('[knowledge] GET /sops error:', err);
    res.status(500).json({ error: 'Failed to fetch SOPs' });
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

import { Router } from 'express';
import { db } from '../db';
import { emailDrafts } from '../schema-email-drafts';
import { desc, eq } from 'drizzle-orm';

const router = Router();

// GET /api/email-drafts — recent email drafts
router.get('/email-drafts', (_req, res) => {
  try {
    const drafts = db
      .select()
      .from(emailDrafts)
      .orderBy(desc(emailDrafts.createdAt))
      .limit(20)
      .all();
    res.json(drafts);
  } catch (err) {
    console.error('[email-drafts] GET /email-drafts error:', err);
    res.status(500).json({ error: 'Failed to fetch email drafts' });
  }
});

// POST /api/email-drafts/:id/status — update draft status (sent/dismissed)
router.post('/email-drafts/:id/status', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body as { status: string };
    if (!status || !['sent', 'dismissed', 'draft'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be: draft, sent, or dismissed.' });
      return;
    }
    db.update(emailDrafts).set({ status }).where(eq(emailDrafts.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[email-drafts] POST status error:', err);
    res.status(500).json({ error: 'Failed to update draft status' });
  }
});

export default router;

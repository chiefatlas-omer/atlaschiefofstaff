import { Router } from 'express';
import { db } from '../db';
import {
  people,
  companies,
  deals,
  meetings,
  decisions,
} from '../../../../bot/src/db/schema';
import { desc } from 'drizzle-orm';

const router = Router();

// GET /api/people
router.get('/people', (_req, res) => {
  try {
    const rows = db.select().from(people).orderBy(people.name).all();
    res.json(rows);
  } catch (err) {
    console.error('[graph] GET /people error:', err);
    res.status(500).json({ error: 'Failed to fetch people' });
  }
});

// GET /api/companies
router.get('/companies', (_req, res) => {
  try {
    const rows = db.select().from(companies).orderBy(companies.name).all();
    res.json(rows);
  } catch (err) {
    console.error('[graph] GET /companies error:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/deals
router.get('/deals', (_req, res) => {
  try {
    const rows = db.select().from(deals).orderBy(desc(deals.createdAt)).all();
    res.json(rows);
  } catch (err) {
    console.error('[graph] GET /deals error:', err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/meetings
router.get('/meetings', (_req, res) => {
  try {
    const rows = db.select().from(meetings).orderBy(desc(meetings.date)).all();
    res.json(rows);
  } catch (err) {
    console.error('[graph] GET /meetings error:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// GET /api/decisions
router.get('/decisions', (_req, res) => {
  try {
    const rows = db.select().from(decisions).orderBy(desc(decisions.createdAt)).all();
    res.json(rows);
  } catch (err) {
    console.error('[graph] GET /decisions error:', err);
    res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

export default router;

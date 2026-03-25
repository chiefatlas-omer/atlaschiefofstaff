import { Router } from 'express';
import { db } from '../db';
import { callAnalyses, productSignals, coachingSnapshots } from '../../../../bot/src/db/schema';
import { desc, gt } from 'drizzle-orm';

const router = Router();

// GET /api/analytics/calls — recent call analyses (limit 50, ordered by date DESC)
router.get('/calls', (_req, res) => {
  try {
    const calls = db
      .select()
      .from(callAnalyses)
      .orderBy(desc(callAnalyses.date))
      .limit(50)
      .all();
    res.json(calls);
  } catch (err) {
    console.error('[analytics] GET /calls error:', err);
    res.status(500).json({ error: 'Failed to fetch call analyses' });
  }
});

// GET /api/analytics/digest — weekly digest data (calls from last 7 days + aggregated breakdown)
router.get('/digest', (_req, res) => {
  try {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

    const calls = db
      .select()
      .from(callAnalyses)
      .where(gt(callAnalyses.createdAt, weekAgo))
      .orderBy(desc(callAnalyses.createdAt))
      .all();

    // Outcome breakdown
    const outcomeBreakdown: Record<string, number> = {};
    for (const call of calls) {
      const outcome = call.outcome ?? 'unknown';
      outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] ?? 0) + 1;
    }

    // Awareness breakdown
    const awarenessBreakdown: Record<string, number> = {};
    for (const call of calls) {
      const level = call.awarenessLevel ?? 'unknown';
      awarenessBreakdown[level] = (awarenessBreakdown[level] ?? 0) + 1;
    }

    res.json({
      periodStart: weekAgo,
      periodEnd: Math.floor(Date.now() / 1000),
      totalCalls: calls.length,
      outcomeBreakdown,
      awarenessBreakdown,
      calls,
    });
  } catch (err) {
    console.error('[analytics] GET /digest error:', err);
    res.status(500).json({ error: 'Failed to fetch digest data' });
  }
});

// GET /api/analytics/product — product signals with type breakdown
router.get('/product', (_req, res) => {
  try {
    const signals = db
      .select()
      .from(productSignals)
      .orderBy(desc(productSignals.createdAt))
      .all();

    // Type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const s of signals) {
      typeBreakdown[s.type] = (typeBreakdown[s.type] ?? 0) + 1;
    }

    res.json({ signals, typeBreakdown });
  } catch (err) {
    console.error('[analytics] GET /product error:', err);
    res.status(500).json({ error: 'Failed to fetch product signals' });
  }
});

// GET /api/analytics/coaching — coaching snapshots (limit 20, ordered by weekStart DESC)
router.get('/coaching', (_req, res) => {
  try {
    const snapshots = db
      .select()
      .from(coachingSnapshots)
      .orderBy(desc(coachingSnapshots.weekStart))
      .limit(20)
      .all();
    res.json(snapshots);
  } catch (err) {
    console.error('[analytics] GET /coaching error:', err);
    res.status(500).json({ error: 'Failed to fetch coaching snapshots' });
  }
});

export default router;

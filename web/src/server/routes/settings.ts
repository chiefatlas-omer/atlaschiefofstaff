import { Router } from 'express';
import { db } from '../db';
import { teamMembers, escalationTargets } from '../../../../bot/src/db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/team — list all team members with their coaching role
router.get('/team', (_req, res) => {
  try {
    const rows = db.select().from(teamMembers).all();
    res.json(rows);
  } catch (err) {
    console.error('[settings] GET /team error:', err);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/team — add a new team member
router.post('/team', (req, res) => {
  try {
    const { slackUserId, displayName, team, coachingRole } = req.body as {
      slackUserId: string;
      displayName: string;
      team: 'team_a' | 'team_b';
      coachingRole?: 'sales' | 'cs' | 'na' | null;
    };

    if (!slackUserId || !displayName || !team) {
      res.status(400).json({ error: 'slackUserId, displayName, and team are required' });
      return;
    }

    const result = db
      .insert(teamMembers)
      .values({
        slackUserId,
        displayName,
        team,
        coachingRole: coachingRole ?? null,
        createdAt: new Date(),
      })
      .returning()
      .get();

    res.json(result);
  } catch (err) {
    console.error('[settings] POST /team error:', err);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// PATCH /api/team/:id — update a team member's role or team
router.patch('/team/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { coachingRole, team, displayName } = req.body as {
      coachingRole?: 'sales' | 'cs' | 'na' | null;
      team?: 'team_a' | 'team_b';
      displayName?: string;
    };

    const updates: Record<string, any> = {};
    if (coachingRole !== undefined) updates.coachingRole = coachingRole;
    if (team !== undefined) updates.team = team;
    if (displayName !== undefined) updates.displayName = displayName;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    db.update(teamMembers).set(updates).where(eq(teamMembers.id, id)).run();
    const updated = db.select().from(teamMembers).where(eq(teamMembers.id, id)).get();
    res.json(updated);
  } catch (err) {
    console.error('[settings] PATCH /team/:id error:', err);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// DELETE /api/team/:id — remove a team member
router.delete('/team/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.delete(teamMembers).where(eq(teamMembers.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[settings] DELETE /team/:id error:', err);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// ─── Escalation Targets ──────────────────────────────────────────────

// GET /api/escalation-targets
router.get('/escalation-targets', (_req, res) => {
  try {
    const rows = db.select().from(escalationTargets).all();
    res.json(rows);
  } catch (err) {
    console.error('[settings] GET /escalation-targets error:', err);
    res.status(500).json({ error: 'Failed to fetch escalation targets' });
  }
});

// POST /api/escalation-targets
router.post('/escalation-targets', (req, res) => {
  try {
    const { slackUserId, displayName, role } = req.body as {
      slackUserId: string;
      displayName: string;
      role: 'owner' | 'manager';
    };

    if (!slackUserId || !displayName || !role) {
      res.status(400).json({ error: 'slackUserId, displayName, and role are required' });
      return;
    }

    const result = db
      .insert(escalationTargets)
      .values({ slackUserId, displayName, role, createdAt: new Date() })
      .returning()
      .get();

    res.json(result);
  } catch (err) {
    console.error('[settings] POST /escalation-targets error:', err);
    res.status(500).json({ error: 'Failed to add escalation target' });
  }
});

// DELETE /api/escalation-targets/:id
router.delete('/escalation-targets/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.delete(escalationTargets).where(eq(escalationTargets.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[settings] DELETE /escalation-targets/:id error:', err);
    res.status(500).json({ error: 'Failed to delete escalation target' });
  }
});

export default router;

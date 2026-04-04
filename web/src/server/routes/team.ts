import { Router } from 'express';
import { db } from '../db';
import { aiEmployees, aiActivity, aiRoutines, aiJournals, aiTasks, aiMetricsSnapshots } from '../schema-team';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as paperclip from '../services/paperclip-bridge';
import { getSoulTemplate } from '../services/soul-templates';
import { executeTask, isExecutionAvailable, calculateHoursConsumed } from '../services/agent-executor';
import * as slackNotify from '../services/slack-notifier';

const router = Router();

// ---------------------------------------------------------------------------
// Paperclip middleware — check once per request whether the sidecar is up.
// Sets req.paperclipCompanyId if available; routes can use it to decide
// whether to call the bridge or fall back to local SQLite.
// ---------------------------------------------------------------------------

let _cachedCompanyId: string | null = null;

router.use(async (req: any, _res, next) => {
  if (await paperclip.isPaperclipAlive()) {
    if (!_cachedCompanyId) {
      const companies = await paperclip.listCompanies();
      if (companies && companies.length > 0) _cachedCompanyId = companies[0].id;
    }
    req.paperclipCompanyId = _cachedCompanyId;
  } else {
    req.paperclipCompanyId = null;
  }
  next();
});

// ---------------------------------------------------------------------------
// DTO helpers — Drizzle returns camelCase matching the schema definitions
// ---------------------------------------------------------------------------

function toEmployeeDTO(row: any) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    departmentLabel: row.departmentLabel,
    status: row.status,
    trustLevel: row.trustLevel,
    reportsTo: row.reportsTo,
    icon: row.icon,
    skills: typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills ?? [],
    trainingMaterials: typeof row.trainingMaterials === 'string' ? JSON.parse(row.trainingMaterials) : row.trainingMaterials ?? [],
    standingInstructions: row.standingInstructions ?? '',
    hoursUsed: row.hoursUsed ?? 0,
    hoursAllocated: row.hoursAllocated ?? 0,
    approvalsCount: row.approvalsCount ?? 0,
    deliverablesCount: row.deliverablesCount ?? 0,
    hireDate: row.hireDate,
    isChiefOfStaff: row.isChiefOfStaff === 1 || row.isChiefOfStaff === true,
    soul: typeof row.soul === 'string' ? JSON.parse(row.soul) : row.soul ?? undefined,
    model: row.model ?? 'sonnet',
  };
}

function toActivityDTO(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeIcon: row.employeeIcon,
    action: row.action,
    detail: row.detail,
    timestamp: row.timestamp,
    needsApproval: row.needsApproval === 1 || row.needsApproval === true,
    approved: row.approved === null ? null : row.approved === 1 || row.approved === true,
    deliverablePreview: row.deliverablePreview ?? undefined,
    status: row.status ?? 'success',
    failureReason: row.failureReason ?? undefined,
    failureStep: row.failureStep ?? undefined,
    retryCount: row.retryCount ?? 0,
    resolution: row.resolution ?? undefined,
  };
}

function toJournalDTO(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    type: row.type,
    title: row.title,
    content: row.content ?? '',
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags ?? [],
  };
}

function toRoutineDTO(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    description: row.description,
    days: typeof row.days === 'string' ? JSON.parse(row.days) : row.days ?? [],
    time: row.time,
    enabled: row.enabled === 1 || row.enabled === true,
  };
}

// ---------------------------------------------------------------------------
// Static data — Role catalog & Blueprints
// ---------------------------------------------------------------------------

const ROLES = [
  { id: 'role-smm', name: 'Social Media Manager', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', icon: '📱', description: 'Creates and schedules social media posts, monitors engagement, and grows your online audience across platforms.', skills: ['Content Creation', 'Scheduling', 'Analytics'], estimatedHours: 20, responsibilities: ['Draft and schedule posts across Instagram, Facebook, LinkedIn, and X', 'Monitor comments, DMs, and mentions and respond on your behalf', 'Track follower growth, engagement rates, and top-performing content', 'Maintain a content calendar aligned with your marketing goals', 'Report weekly analytics with insights and recommendations'], sampleTasks: ['Create a week of Instagram posts promoting our new product launch', 'Write a LinkedIn thought-leadership post about industry trends', 'Compile this month\'s social media performance report', 'Draft responses to the 12 unanswered comments from this week'] },
  { id: 'role-em', name: 'Email Marketer', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', icon: '✉️', description: 'Writes and sends email campaigns, manages subscriber lists, and runs A/B tests to improve open rates and conversions.', skills: ['Copywriting', 'Campaigns', 'A/B Testing'], estimatedHours: 15, responsibilities: ['Write and send email campaigns to your subscriber list', 'Run A/B tests on subject lines and content', 'Manage subscriber segments and list hygiene', 'Track open rates, click rates, and conversions', 'Create automated welcome and nurture sequences'], sampleTasks: ['Write a welcome email sequence for new customers', 'Draft a promotional email for our spring sale', 'Create a re-engagement campaign for inactive subscribers', 'A/B test subject lines for this month\'s newsletter'] },
  { id: 'role-lq', name: 'Lead Qualifier', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', icon: '🎯', description: 'Scores inbound leads against your ideal customer profile, researches prospects, and routes qualified opportunities to sales.', skills: ['Lead Scoring', 'Research', 'Routing'], estimatedHours: 25, responsibilities: ['Score all new inbound leads against your ideal customer profile', 'Research top prospects and add enrichment data to the CRM', 'Route qualified leads to the appropriate sales pipeline stage', 'Flag high-priority opportunities for immediate follow-up', 'Generate weekly pipeline reports with conversion metrics'], sampleTasks: ['Score and prioritize the 20 leads that came in overnight', 'Research Greenfield Corp and prepare a prospect brief', 'Update CRM records with enrichment data for this week\'s hot leads', 'Generate a pipeline health report for the Monday sales meeting'] },
  { id: 'role-cw', name: 'Content Writer', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', icon: '✍️', description: 'Produces blog posts, landing page copy, and marketing collateral aligned with your brand voice and SEO strategy.', skills: ['SEO Writing', 'Blog Posts', 'Brand Voice'], estimatedHours: 20, responsibilities: ['Write SEO-optimized blog posts on topics relevant to your audience', 'Create landing page copy for campaigns and product launches', 'Develop marketing collateral like case studies and one-pagers', 'Maintain a consistent brand voice across all written content', 'Research keywords and trending topics in your industry'], sampleTasks: ['Write a 1,200-word blog post on "5 Ways to Reduce Customer Churn"', 'Draft landing page copy for our new service tier', 'Create a customer success case study for Acme Corp', 'Research and outline 4 blog post ideas for next month'] },
  { id: 'role-fus', name: 'Follow-Up Specialist', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', icon: '🔄', description: 'Sends timely follow-up messages to prospects and customers, ensuring no opportunity falls through the cracks.', skills: ['Follow-Ups', 'CRM Updates', 'Sequences'], estimatedHours: 15, responsibilities: ['Send follow-up emails to prospects who haven\'t responded', 'Create and manage multi-step follow-up sequences', 'Update CRM deal stages and next-action dates after each touchpoint', 'Flag stale deals that need attention or a different approach', 'Track follow-up response rates and optimize messaging'], sampleTasks: ['Send a follow-up to all prospects who received a proposal last week', 'Create a 3-step sequence for post-demo follow-ups', 'Update CRM records for the 15 deals with no activity in 7 days', 'Draft a "checking in" email for warm leads that went cold'] },
  { id: 'role-bk', name: 'Bookkeeper', department: 'operations', departmentLabel: 'Operations', icon: '📒', description: 'Reconciles bank transactions, categorizes expenses, and generates weekly financial summaries to keep your books clean.', skills: ['Bookkeeping', 'Reports', 'Reconciliation'], estimatedHours: 10, responsibilities: ['Reconcile bank transactions against invoices and receipts', 'Categorize expenses into the correct chart-of-accounts categories', 'Flag discrepancies or unusual charges for your review', 'Generate weekly revenue, expense, and cash-flow summaries', 'Prepare month-end financial reports'], sampleTasks: ['Reconcile all transactions from the past week', 'Categorize the 30 uncategorized expenses in the ledger', 'Generate a profit-and-loss summary for March', 'Flag any transactions over $500 that don\'t match an invoice'] },
  { id: 'role-as', name: 'Appointment Scheduler', department: 'operations', departmentLabel: 'Operations', icon: '📅', description: 'Manages your calendar, books appointments with clients, and sends automated reminders to reduce no-shows.', skills: ['Scheduling', 'Reminders', 'Calendar'], estimatedHours: 15, responsibilities: ['Confirm and schedule new appointment requests within business hours', 'Send 24-hour reminder messages to reduce no-shows', 'Reschedule cancellations and fill open calendar slots', 'Coordinate availability across team members for group meetings', 'Track appointment volume and no-show rates weekly'], sampleTasks: ['Confirm the 8 appointment requests that came in today', 'Send reminders for all appointments scheduled tomorrow', 'Reschedule the 3 cancelled appointments from this week', 'Find an open 30-minute slot for a client meeting next Tuesday'] },
  { id: 'role-it', name: 'Inventory Tracker', department: 'operations', departmentLabel: 'Operations', icon: '📦', description: 'Monitors stock levels, flags low-inventory items, and generates reorder recommendations so you never run out.', skills: ['Inventory Counts', 'Reorder Alerts', 'Reporting'], estimatedHours: 10, responsibilities: ['Monitor current stock levels and flag items below reorder thresholds', 'Generate reorder recommendations with suggested quantities', 'Track inventory turnover rates and identify slow-moving items', 'Reconcile physical counts against system records', 'Produce weekly inventory status reports'], sampleTasks: ['Check which items are below their reorder point and create a reorder list', 'Generate an inventory turnover report for the past 30 days', 'Identify the top 5 slow-moving SKUs and recommend action', 'Reconcile this week\'s shipment receipts against purchase orders'] },
  { id: 'role-csr', name: 'Customer Service Rep', department: 'customer_service', departmentLabel: 'Customer Service', icon: '💬', description: 'Responds to customer inquiries, resolves common issues, and escalates complex cases to the appropriate team member.', skills: ['Ticket Resolution', 'FAQ Handling', 'Escalation'], estimatedHours: 25, responsibilities: ['Respond to incoming support tickets and customer messages', 'Resolve common issues using your knowledge base and FAQ', 'Escalate complex or sensitive cases to the right team member', 'Track ticket volume, resolution time, and satisfaction scores', 'Update the FAQ and knowledge base with new solutions'], sampleTasks: ['Respond to the 15 open support tickets in the queue', 'Draft a reply for the billing dispute from customer #4821', 'Update the FAQ with answers for the 3 most common questions this week', 'Compile a customer support summary for this week\'s team meeting'] },
  { id: 'role-rm', name: 'Review Manager', department: 'customer_service', departmentLabel: 'Customer Service', icon: '⭐', description: 'Monitors online reviews, drafts professional responses, and identifies trends in customer feedback.', skills: ['Review Responses', 'Sentiment Analysis', 'Reputation'], estimatedHours: 10, responsibilities: ['Monitor new reviews across Google, Yelp, and industry platforms', 'Draft professional, on-brand responses to both positive and negative reviews', 'Identify recurring themes and sentiment trends in customer feedback', 'Flag urgent negative reviews that need immediate attention', 'Report weekly on review volume, average rating, and sentiment shifts'], sampleTasks: ['Respond to the 6 new Google reviews from this week', 'Draft a thoughtful reply to the 1-star review about shipping delays', 'Compile a sentiment analysis of all reviews from the past month', 'Identify the top 3 complaints mentioned in recent negative reviews'] },
  { id: 'role-cfu', name: 'Client Follow-Up', department: 'customer_service', departmentLabel: 'Customer Service', icon: '🤝', description: 'Reaches out to past clients for feedback, upsell opportunities, and relationship nurturing to boost retention.', skills: ['Check-Ins', 'Satisfaction Surveys', 'Upselling'], estimatedHours: 15, responsibilities: ['Send check-in messages to clients after service delivery', 'Distribute satisfaction surveys and compile the results', 'Identify upsell and cross-sell opportunities based on client history', 'Nurture relationships with personalized touchpoints on milestones', 'Track client retention metrics and flag at-risk accounts'], sampleTasks: ['Send a 30-day check-in email to clients who completed onboarding last month', 'Distribute a satisfaction survey to all Q1 clients', 'Identify 5 existing clients who might benefit from our new premium tier', 'Draft a personalized anniversary message for our top 10 clients'] },
];

const BLUEPRINTS = [
  { id: 'bp-dental', name: 'Dental Office', icon: '🦷', industry: 'Healthcare / Dental', teamSize: 5, roles: ['Appointment Scheduler', 'Customer Service Rep', 'Review Manager', 'Follow-Up Specialist', 'Bookkeeper'], description: 'A ready-made team for dental practices. Handles appointment booking, patient follow-ups, online review management, and bookkeeping so you can focus on patient care.' },
  { id: 'bp-agency', name: 'Marketing Agency', icon: '📣', industry: 'Marketing & Advertising', teamSize: 5, roles: ['Content Writer', 'Social Media Manager', 'Email Marketer', 'Lead Qualifier', 'Bookkeeper'], description: 'An AI team for marketing agencies. Produces client content, manages social accounts, runs email campaigns, qualifies new business leads, and keeps finances organized.' },
  { id: 'bp-realestate', name: 'Real Estate Agency', icon: '🏠', industry: 'Real Estate', teamSize: 4, roles: ['Lead Qualifier', 'Follow-Up Specialist', 'Social Media Manager', 'Appointment Scheduler'], description: 'Built for real estate agents and brokerages. Qualifies inbound leads, nurtures prospects with timely follow-ups, and keeps your social presence active between showings.' },
  { id: 'bp-roofing', name: 'Roofing Company', icon: '🏗️', industry: 'Home Services / Roofing', teamSize: 3, roles: ['Lead Qualifier', 'Appointment Scheduler', 'Client Follow-Up'], description: 'Designed for roofing and home service contractors. Scores storm-damage leads, books estimates, and follows up after jobs to earn reviews and referrals.' },
  { id: 'bp-landscaping', name: 'Landscaping Company', icon: '🌿', industry: 'Home Services / Landscaping', teamSize: 4, roles: ['Lead Qualifier', 'Appointment Scheduler', 'Client Follow-Up', 'Social Media Manager'], description: 'Built for landscaping and lawn care businesses. Qualifies new property leads, schedules estimates and seasonal services, follows up for repeat business, and showcases your work on social media.' },
  { id: 'bp-lawoffice', name: 'Law Office', icon: '⚖️', industry: 'Legal Services', teamSize: 5, roles: ['Lead Qualifier', 'Appointment Scheduler', 'Follow-Up Specialist', 'Content Writer', 'Bookkeeper'], description: 'Designed for law firms and solo practitioners. Qualifies potential clients, manages consultation scheduling, follows up on cases, creates educational content, and keeps billing organized.' },
];

function findRole(name: string) {
  return ROLES.find((r) => r.name === name);
}

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------

// GET /team/employees
router.get('/team/employees', async (req: any, res) => {
  try {
    // Try Paperclip first
    // Always use local SQLite as source of truth (richer data: soul, journal, etc.)
    // Paperclip is synced via dual-write on hire/update operations
    const rows = db
      .select()
      .from(aiEmployees)
      .where(eq(aiEmployees.ownerSlackId, req.userId))
      .orderBy(aiEmployees.createdAt)
      .all();
    res.json(rows.map(toEmployeeDTO));
  } catch (err) {
    console.error('[team] GET /team/employees error:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// POST /team/employees
router.post('/team/employees', async (req: any, res) => {
  try {
    const { name, role, department, departmentLabel, icon, skills, estimatedHours, standingInstructions, trustLevel, model } = req.body;

    // Auto-populate personality profile from role templates
    const soul = getSoulTemplate(role);

    // Always write to local SQLite (our rich data store)
    const id = `emp-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
    const ts = Math.floor(Date.now() / 1000);
    db.insert(aiEmployees)
      .values({
        id,
        ownerSlackId: req.userId,
        name,
        role,
        department,
        departmentLabel,
        icon,
        skills: skills ?? [],
        trainingMaterials: [],
        standingInstructions: standingInstructions ?? '',
        hoursAllocated: estimatedHours ?? 0,
        hoursUsed: 0,
        approvalsCount: 0,
        deliverablesCount: 0,
        trustLevel: trustLevel ?? 'supervised',
        status: 'idle',
        reportsTo: 'cos',
        hireDate: now,
        isChiefOfStaff: 0,
        soul,
        model: model ?? 'sonnet',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Notify owner via Slack (fire-and-forget)
    slackNotify.notifyNewHire({
      ownerSlackId: req.userId,
      employeeName: name,
      employeeIcon: icon || '🤖',
      role,
    }).catch(() => {});

    // Also push to Paperclip if connected (dual-write)
    if (req.paperclipCompanyId) {
      const hired = await paperclip.hireEmployee(req.paperclipCompanyId, {
        name,
        role,
        capabilities: (skills || []).join(', '),
        hoursAllocated: estimatedHours,
      });
      if (hired) {
        // Store the Paperclip agent ID alongside our local ID for future syncs
        console.log(`[team] Synced employee "${name}" to Paperclip as agent ${hired.id}`);
      }
    }

    const row = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get();
    res.json(toEmployeeDTO(row));
  } catch (err) {
    console.error('[team] POST /team/employees error:', err);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PATCH /team/employees/:id
router.patch('/team/employees/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Record<string, any> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.trustLevel !== undefined) updates.trustLevel = body.trustLevel;
    if (body.hoursAllocated !== undefined) updates.hoursAllocated = body.hoursAllocated;
    if (body.hoursUsed !== undefined) updates.hoursUsed = body.hoursUsed;
    if (body.standingInstructions !== undefined) updates.standingInstructions = body.standingInstructions;
    if (body.name !== undefined) updates.name = body.name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.reportsTo !== undefined) updates.reportsTo = body.reportsTo;
    if (body.skills !== undefined) updates.skills = body.skills;
    if (body.trainingMaterials !== undefined) updates.trainingMaterials = body.trainingMaterials;
    if (body.approvalsCount !== undefined) updates.approvalsCount = body.approvalsCount;
    if (body.deliverablesCount !== undefined) updates.deliverablesCount = body.deliverablesCount;
    if (body.soul !== undefined) updates.soul = body.soul;
    if (body.model !== undefined) updates.model = body.model;

    // Handle add/remove training material as array operations
    if (body.addTrainingMaterial) {
      const existing = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get() as any;
      if (existing) {
        const current = typeof existing.trainingMaterials === 'string'
          ? JSON.parse(existing.trainingMaterials) : existing.trainingMaterials ?? [];
        if (!current.includes(body.addTrainingMaterial)) {
          updates.trainingMaterials = [...current, body.addTrainingMaterial];
        }
      }
    }
    if (body.removeTrainingMaterial) {
      const existing = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get() as any;
      if (existing) {
        const current = typeof existing.trainingMaterials === 'string'
          ? JSON.parse(existing.trainingMaterials) : existing.trainingMaterials ?? [];
        updates.trainingMaterials = current.filter((f: string) => f !== body.removeTrainingMaterial);
      }
    }

    updates.updatedAt = Math.floor(Date.now() / 1000);

    // Update local SQLite
    db.update(aiEmployees).set(updates).where(eq(aiEmployees.id, id)).run();
    const row = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get();
    if (!row) { res.status(404).json({ error: 'Employee not found' }); return; }

    // Push relevant updates to Paperclip (fire-and-forget)
    if (req.paperclipCompanyId) {
      const pcUpdates: Record<string, any> = {};
      if (body.status !== undefined) pcUpdates.status = body.status;
      if (body.hoursAllocated !== undefined) pcUpdates.hoursAllocated = body.hoursAllocated;
      if (body.standingInstructions !== undefined) pcUpdates.standingInstructions = body.standingInstructions;
      if (body.soul !== undefined) pcUpdates.soul = body.soul;
      if (body.skills !== undefined) pcUpdates.skills = body.skills;

      if (Object.keys(pcUpdates).length > 0) {
        paperclip.updateEmployee(id, pcUpdates).then((ok) => {
          if (ok) console.log(`[team] Synced employee "${id}" updates to Paperclip`);
        }).catch(() => { /* Paperclip sync is best-effort */ });
      }
    }

    res.json(toEmployeeDTO(row));
  } catch (err) {
    console.error('[team] PATCH /team/employees/:id error:', err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// DELETE /team/employees/:id
router.delete('/team/employees/:id', (req: any, res) => {
  try {
    const { id } = req.params;
    db.delete(aiTasks).where(eq(aiTasks.employeeId, id)).run();
    db.delete(aiRoutines).where(eq(aiRoutines.employeeId, id)).run();
    db.delete(aiActivity).where(eq(aiActivity.employeeId, id)).run();
    db.delete(aiEmployees).where(eq(aiEmployees.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[team] DELETE /team/employees/:id error:', err);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// POST /team/employees/:id/promote
router.post('/team/employees/:id/promote', (req: any, res) => {
  try {
    const { id } = req.params;
    const row = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get() as any;
    if (!row) { res.status(404).json({ error: 'Employee not found' }); return; }

    const cycle: Record<string, string> = { supervised: 'trusted', trusted: 'autonomous', autonomous: 'autonomous' };
    const nextLevel = cycle[row.trustLevel] ?? 'supervised';
    db.update(aiEmployees).set({ trustLevel: nextLevel }).where(eq(aiEmployees.id, id)).run();

    const updated = db.select().from(aiEmployees).where(eq(aiEmployees.id, id)).get();
    res.json(toEmployeeDTO(updated));
  } catch (err) {
    console.error('[team] POST /team/employees/:id/promote error:', err);
    res.status(500).json({ error: 'Failed to promote employee' });
  }
});

// ---------------------------------------------------------------------------
// ACTIVITY
// ---------------------------------------------------------------------------

// GET /team/activity
router.get('/team/activity', async (req: any, res) => {
  try {
    // Try Paperclip first
    if (req.paperclipCompanyId) {
      const activity = await paperclip.listActivity(req.paperclipCompanyId);
      if (activity) { res.json(activity); return; }
    }
    // Fall back to local SQLite
    const conditions: any[] = [eq(aiActivity.ownerSlackId, req.userId)];
    if (req.query.employeeId) {
      conditions.push(eq(aiActivity.employeeId, req.query.employeeId as string));
    }
    const rows = db
      .select()
      .from(aiActivity)
      .where(and(...conditions))
      .orderBy(desc(aiActivity.timestamp))
      .all();
    res.json(rows.map(toActivityDTO));
  } catch (err) {
    console.error('[team] GET /team/activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// POST /team/activity
router.post('/team/activity', (req: any, res) => {
  try {
    const { employeeId, employeeName, employeeIcon, action, detail, needsApproval, deliverablePreview } = req.body;
    const id = `act-${Date.now()}`;
    const ts = Math.floor(Date.now() / 1000);
    db.insert(aiActivity)
      .values({
        id,
        ownerSlackId: req.userId,
        employeeId,
        employeeName,
        employeeIcon,
        action,
        detail,
        timestamp: new Date().toISOString(),
        needsApproval: needsApproval ? 1 : 0,
        approved: null,
        deliverablePreview: deliverablePreview ?? null,
        createdAt: ts,
      })
      .run();
    const row = db.select().from(aiActivity).where(eq(aiActivity.id, id)).get();
    res.json(toActivityDTO(row));
  } catch (err) {
    console.error('[team] POST /team/activity error:', err);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// PATCH /team/activity/:id/approve
router.patch('/team/activity/:id/approve', (req: any, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    db.update(aiActivity).set({ approved: approved ? 1 : 0 }).where(eq(aiActivity.id, id)).run();

    if (approved) {
      const actRow = db.select().from(aiActivity).where(eq(aiActivity.id, id)).get() as any;
      if (actRow) {
        const emp = db.select().from(aiEmployees).where(eq(aiEmployees.id, actRow.employeeId)).get() as any;
        if (emp) {
          db.update(aiEmployees)
            .set({ approvalsCount: (emp.approvalsCount ?? 0) + 1 })
            .where(eq(aiEmployees.id, actRow.employeeId))
            .run();
        }
      }
    }

    const row = db.select().from(aiActivity).where(eq(aiActivity.id, id)).get();
    if (!row) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json(toActivityDTO(row));
  } catch (err) {
    console.error('[team] PATCH /team/activity/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve activity' });
  }
});

// ---------------------------------------------------------------------------
// ROUTINES
// ---------------------------------------------------------------------------

// GET /team/routines
router.get('/team/routines', (req: any, res) => {
  try {
    const conditions: any[] = [eq(aiRoutines.ownerSlackId, req.userId)];
    if (req.query.employeeId) {
      conditions.push(eq(aiRoutines.employeeId, req.query.employeeId as string));
    }
    const rows = db
      .select()
      .from(aiRoutines)
      .where(and(...conditions))
      .all();
    res.json(rows.map(toRoutineDTO));
  } catch (err) {
    console.error('[team] GET /team/routines error:', err);
    res.status(500).json({ error: 'Failed to fetch routines' });
  }
});

// POST /team/routines
router.post('/team/routines', (req: any, res) => {
  try {
    const { employeeId, name, description, days, time } = req.body;
    const id = `rt-${Date.now()}`;
    const ts = Math.floor(Date.now() / 1000);
    db.insert(aiRoutines)
      .values({
        id,
        ownerSlackId: req.userId,
        employeeId,
        name,
        description,
        days: days ?? [],
        time,
        enabled: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const row = db.select().from(aiRoutines).where(eq(aiRoutines.id, id)).get();
    res.json(toRoutineDTO(row));
  } catch (err) {
    console.error('[team] POST /team/routines error:', err);
    res.status(500).json({ error: 'Failed to create routine' });
  }
});

// PATCH /team/routines/:id
router.patch('/team/routines/:id', (req: any, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Record<string, any> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
    if (body.days !== undefined) updates.days = body.days;
    if (body.time !== undefined) updates.time = body.time;
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    updates.updatedAt = Math.floor(Date.now() / 1000);

    db.update(aiRoutines).set(updates).where(eq(aiRoutines.id, id)).run();
    const row = db.select().from(aiRoutines).where(eq(aiRoutines.id, id)).get();
    if (!row) { res.status(404).json({ error: 'Routine not found' }); return; }
    res.json(toRoutineDTO(row));
  } catch (err) {
    console.error('[team] PATCH /team/routines/:id error:', err);
    res.status(500).json({ error: 'Failed to update routine' });
  }
});

// DELETE /team/routines/:id
router.delete('/team/routines/:id', (req: any, res) => {
  try {
    const { id } = req.params;
    db.delete(aiRoutines).where(eq(aiRoutines.id, id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[team] DELETE /team/routines/:id error:', err);
    res.status(500).json({ error: 'Failed to delete routine' });
  }
});

// ---------------------------------------------------------------------------
// BLUEPRINTS & ROLES (static data + deploy)
// ---------------------------------------------------------------------------

router.get('/team/roles', (_req: any, res) => {
  res.json(ROLES);
});

router.get('/team/blueprints', (_req: any, res) => {
  res.json(BLUEPRINTS);
});

// POST /team/blueprints/:id/deploy
router.post('/team/blueprints/:id/deploy', (req: any, res) => {
  try {
    const blueprint = BLUEPRINTS.find((b) => b.id === req.params.id);
    if (!blueprint) { res.status(404).json({ error: 'Blueprint not found' }); return; }

    const now = new Date().toISOString().slice(0, 10);
    const ts = Math.floor(Date.now() / 1000);
    const createdEmployees: any[] = [];
    const createdRoutines: any[] = [];

    // Create owner node
    db.insert(aiEmployees)
      .values({
        id: 'owner',
        ownerSlackId: req.userId,
        name: 'You',
        role: 'Business Owner',
        department: 'operations',
        departmentLabel: 'Owner',
        icon: '👤',
        skills: [],
        trainingMaterials: [],
        standingInstructions: '',
        hoursAllocated: 0,
        hoursUsed: 0,
        approvalsCount: 0,
        deliverablesCount: 0,
        trustLevel: 'autonomous',
        status: 'working',
        reportsTo: null,
        hireDate: now,
        isChiefOfStaff: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Create Chief of Staff
    const cosId = 'cos';
    db.insert(aiEmployees)
      .values({
        id: cosId,
        ownerSlackId: req.userId,
        name: 'Atlas Chief of Staff',
        role: 'Chief of Staff',
        department: 'operations',
        departmentLabel: 'Operations',
        icon: '🧠',
        skills: ['Strategic Planning', 'Team Management', 'Goal Setting'],
        trainingMaterials: [],
        standingInstructions: 'Coordinate all AI employees each morning. Prioritize tasks based on weekly goals and flag any blockers to the owner. Summarize team output at end of day.',
        hoursAllocated: 40,
        hoursUsed: 0,
        approvalsCount: 0,
        deliverablesCount: 0,
        trustLevel: 'autonomous',
        status: 'working',
        reportsTo: 'owner',
        hireDate: now,
        isChiefOfStaff: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const cosRow = db.select().from(aiEmployees).where(eq(aiEmployees.id, cosId)).get();
    createdEmployees.push(toEmployeeDTO(cosRow));

    // Create employees for each role
    for (const roleName of blueprint.roles) {
      const roleDef = findRole(roleName);
      if (!roleDef) continue;
      const empId = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const empSoul = getSoulTemplate(roleDef.name);
      db.insert(aiEmployees)
        .values({
          id: empId,
          ownerSlackId: req.userId,
          name: roleDef.name,
          role: roleDef.name,
          department: roleDef.department,
          departmentLabel: roleDef.departmentLabel,
          icon: roleDef.icon,
          skills: roleDef.skills,
          trainingMaterials: [],
          standingInstructions: '',
          hoursAllocated: roleDef.estimatedHours,
          hoursUsed: 0,
          approvalsCount: 0,
          deliverablesCount: 0,
          trustLevel: 'supervised',
          status: 'idle',
          reportsTo: 'cos',
          hireDate: now,
          isChiefOfStaff: 0,
          soul: empSoul,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      const empRow = db.select().from(aiEmployees).where(eq(aiEmployees.id, empId)).get();
      createdEmployees.push(toEmployeeDTO(empRow));

      // Create a default routine
      const rtId = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      db.insert(aiRoutines)
        .values({
          id: rtId,
          ownerSlackId: req.userId,
          employeeId: empId,
          name: `Daily ${roleDef.name} tasks`,
          description: `Run standard ${roleDef.name.toLowerCase()} tasks each weekday morning.`,
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          time: '09:00',
          enabled: 1,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      const rtRow = db.select().from(aiRoutines).where(eq(aiRoutines.id, rtId)).get();
      createdRoutines.push(toRoutineDTO(rtRow));
    }

    res.json({ employees: createdEmployees, routines: createdRoutines });
  } catch (err) {
    console.error('[team] POST /team/blueprints/:id/deploy error:', err);
    res.status(500).json({ error: 'Failed to deploy blueprint' });
  }
});

// ---------------------------------------------------------------------------
// SEED — populate demo data
// ---------------------------------------------------------------------------

router.post('/team/seed', (req: any, res) => {
  try {
    const existing = db
      .select()
      .from(aiEmployees)
      .where(eq(aiEmployees.ownerSlackId, req.userId))
      .all();
    if (existing.length > 0) {
      res.status(400).json({ error: 'User already has employees. Seed aborted.' });
      return;
    }

    const userId = req.userId;
    const ts = Math.floor(Date.now() / 1000);

    // -- Employees --
    const seedEmployees = [
      { id: 'owner', name: 'You', role: 'Business Owner', department: 'operations', departmentLabel: 'Owner', status: 'working', trustLevel: 'autonomous', reportsTo: null, icon: '👤', skills: [], trainingMaterials: [], standingInstructions: '', hoursUsed: 0, hoursAllocated: 0, approvalsCount: 0, deliverablesCount: 0, hireDate: '2026-01-15', isChiefOfStaff: 0, soul: null },
      { id: 'cos', name: 'Atlas Chief of Staff', role: 'Chief of Staff', department: 'operations', departmentLabel: 'Operations', status: 'working', trustLevel: 'autonomous', reportsTo: 'owner', icon: '🧠', skills: ['Strategic Planning', 'Team Management', 'Goal Setting'], trainingMaterials: ['company-handbook.pdf', 'q1-goals.pdf', 'brand-guidelines.pdf'], standingInstructions: 'Coordinate all AI employees each morning. Prioritize tasks based on weekly goals and flag any blockers to the owner. Summarize team output at end of day.', hoursUsed: 30, hoursAllocated: 40, approvalsCount: 0, deliverablesCount: 0, hireDate: '2026-02-01', isChiefOfStaff: 1, soul: { personality: 'Calm, organized, and always thinking three steps ahead. Communicates with clarity and keeps the team aligned without micromanaging.', workingStyle: 'Starts each day with a team-wide check-in, prioritizes tasks by impact, and flags blockers early. Summarizes progress at end of day.', decisionFramework: 'Prioritize by business impact first, urgency second. When in doubt, ask the owner rather than guessing.', strengths: ['Strategic coordination', 'Clear communication', 'Pattern recognition across departments'], growthAreas: ['Learning industry-specific nuances', 'Calibrating urgency levels'] } },
      { id: 'smm', name: 'Social Media Manager', role: 'Social Media Manager', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', status: 'working', trustLevel: 'supervised', reportsTo: 'cos', icon: '📱', skills: ['Content Creation', 'Scheduling', 'Analytics'], trainingMaterials: ['brand-voice-guide.pdf', 'social-calendar-template.xlsx'], standingInstructions: 'Review social mentions and DMs each morning. Draft posts following the brand voice guide and queue them for approval. Report engagement metrics every Friday.', hoursUsed: 12, hoursAllocated: 20, approvalsCount: 8, deliverablesCount: 14, hireDate: '2026-02-10', isChiefOfStaff: 0, soul: { personality: 'Creative and enthusiastic with a sharp eye for trends. Writes in a warm, approachable tone that matches the brand voice.', workingStyle: 'Scans trends and mentions first thing in the morning. Batches content creation in focused blocks. Queues posts for optimal timing.', decisionFramework: 'When engagement drops below 3%, flag for review. Prioritize visual content over text-only. Never post without checking brand guidelines.', strengths: ['Trend spotting', 'Visual storytelling', 'Audience engagement'], growthAreas: ['Long-form content strategy', 'Paid social optimization'] } },
      { id: 'em', name: 'Email Marketer', role: 'Email Marketer', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', status: 'idle', trustLevel: 'trusted', reportsTo: 'cos', icon: '✉️', skills: ['Copywriting', 'Campaigns', 'A/B Testing'], trainingMaterials: ['email-templates.zip', 'audience-segments.csv', 'past-campaigns-report.pdf'], standingInstructions: 'Monitor campaign open and click rates each morning. Draft new campaigns for upcoming promotions and run A/B tests on subject lines. Escalate any deliverability issues immediately.', hoursUsed: 9, hoursAllocated: 15, approvalsCount: 22, deliverablesCount: 28, hireDate: '2026-02-14', isChiefOfStaff: 0, soul: { personality: 'Data-driven and methodical. Writes concise, compelling copy that gets to the point without being pushy.', workingStyle: 'Reviews campaign metrics every morning. Plans campaigns around the content calendar. Always runs A/B tests on subject lines before full sends.', decisionFramework: 'If open rate drops below 25%, pause and diagnose. Test subject lines with at least 500 recipients before declaring a winner.', strengths: ['Conversion copywriting', 'Segmentation strategy', 'Deliverability optimization'], growthAreas: ['Advanced automation flows', 'SMS integration'] } },
      { id: 'lq', name: 'Lead Qualifier', role: 'Lead Qualifier', department: 'sales_marketing', departmentLabel: 'Sales & Marketing', status: 'working', trustLevel: 'supervised', reportsTo: 'cos', icon: '🎯', skills: ['Lead Scoring', 'Research', 'Routing'], trainingMaterials: ['ideal-customer-profile.pdf', 'crm-guide.pdf'], standingInstructions: 'Score all new inbound leads using the ICP criteria every morning. Research the top 5 prospects and add enrichment notes. Route qualified leads to the sales pipeline by end of day.', hoursUsed: 18, hoursAllocated: 25, approvalsCount: 5, deliverablesCount: 11, hireDate: '2026-02-20', isChiefOfStaff: 0, soul: { personality: 'Thorough and detail-oriented. Approaches each lead with curiosity — always looking for the story behind the data.', workingStyle: 'Processes all new leads first thing in the morning. Scores against the ICP, then deep-dives on the top prospects. Routes qualified leads by end of day.', decisionFramework: 'Score 80+ is hot, 50-79 is warm, below 50 is cold. Always verify company size and revenue before marking as qualified.', strengths: ['Research depth', 'Pattern recognition in lead quality', 'Accurate scoring'], growthAreas: ['Faster turnaround on high-volume days', 'Industry-specific qualification criteria'] } },
      { id: 'bk', name: 'Bookkeeper', role: 'Bookkeeper', department: 'operations', departmentLabel: 'Operations', status: 'idle', trustLevel: 'autonomous', reportsTo: 'cos', icon: '📒', skills: ['Bookkeeping', 'Reports', 'Reconciliation'], trainingMaterials: ['chart-of-accounts.pdf', 'reconciliation-checklist.pdf', 'quickbooks-export.csv'], standingInstructions: 'Reconcile all new bank transactions against invoices each morning. Categorize expenses and flag any discrepancies over $500. Generate a weekly financial summary every Friday.', hoursUsed: 3, hoursAllocated: 10, approvalsCount: 45, deliverablesCount: 48, hireDate: '2026-02-05', isChiefOfStaff: 0, soul: { personality: 'Precise and reliable. Communicates financial information in plain language, not accounting jargon.', workingStyle: 'Reconciles transactions daily in the morning. Batches categorization work. Generates summaries on Fridays. Flags anomalies immediately.', decisionFramework: 'Flag any discrepancy over $500 for owner review. Categorize by the chart of accounts — never create new categories without approval.', strengths: ['Accuracy', 'Pattern detection in expenses', 'Clear financial summaries'], growthAreas: ['Tax preparation support', 'Cash flow forecasting'] } },
      { id: 'as', name: 'Appointment Scheduler', role: 'Appointment Scheduler', department: 'operations', departmentLabel: 'Operations', status: 'working', trustLevel: 'trusted', reportsTo: 'cos', icon: '📅', skills: ['Scheduling', 'Reminders', 'Calendar'], trainingMaterials: ['scheduling-policy.pdf'], standingInstructions: 'Check for new appointment requests each morning and confirm them within business hours. Send reminders 24 hours before each appointment. Reschedule cancellations and fill open slots when possible.', hoursUsed: 11, hoursAllocated: 15, approvalsCount: 30, deliverablesCount: 35, hireDate: '2026-03-01', isChiefOfStaff: 0, soul: { personality: 'Friendly and efficient. Makes booking feel effortless for clients while keeping the calendar organized.', workingStyle: 'Checks for new requests first thing. Confirms appointments within 2 hours. Sends reminders 24 hours ahead. Fills cancellation gaps proactively.', decisionFramework: 'Never double-book. Leave 15-minute buffers between appointments. Priority clients get preferred time slots.', strengths: ['Calendar optimization', 'Client communication', 'No-show reduction'], growthAreas: ['Multi-location scheduling', 'Group booking coordination'] } },
    ];

    for (const emp of seedEmployees) {
      db.insert(aiEmployees)
        .values({ ...emp, ownerSlackId: userId, createdAt: ts, updatedAt: ts })
        .run();
    }

    // -- Activity --
    const seedActivity = [
      { id: 'act-1', employeeId: 'smm', employeeName: 'Social Media Manager', employeeIcon: '📱', action: 'Drafted Instagram post', detail: 'Created carousel post highlighting spring promotions with 5 slides and captions.', timestamp: '2026-03-31T09:15:00Z', needsApproval: 1, approved: null, deliverablePreview: '🌸 Spring is here and so are our biggest deals! Swipe through to see what\'s new this season. Slide 1: "Fresh Starts, Fresh Savings" — 20% off all services…' },
      { id: 'act-2', employeeId: 'smm', employeeName: 'Social Media Manager', employeeIcon: '📱', action: 'Published engagement report', detail: 'Weekly engagement report: +12% followers, 340 interactions, top post reached 2.1k impressions.', timestamp: '2026-03-28T16:30:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-3', employeeId: 'em', employeeName: 'Email Marketer', employeeIcon: '✉️', action: 'Sent April newsletter', detail: 'Delivered "April Updates" campaign to 2,480 subscribers. Open rate: 38.2%, CTR: 5.7%.', timestamp: '2026-03-30T10:00:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-4', employeeId: 'em', employeeName: 'Email Marketer', employeeIcon: '✉️', action: 'Completed A/B test', detail: 'Subject line test finished: "Don\'t miss out" (42% open) beat "Your April perks" (31% open). Winner applied to remaining sends.', timestamp: '2026-03-29T14:20:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-5', employeeId: 'lq', employeeName: 'Lead Qualifier', employeeIcon: '🎯', action: 'Scored 14 new leads', detail: 'Processed overnight form submissions. 3 marked hot, 7 warm, 4 cold. Hot leads routed to sales pipeline.', timestamp: '2026-03-31T08:05:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-6', employeeId: 'lq', employeeName: 'Lead Qualifier', employeeIcon: '🎯', action: 'Drafted prospect research brief', detail: 'Deep-dive on Greenfield Corp — $2M revenue, 45 employees, expanding to new markets. Strong ICP fit.', timestamp: '2026-03-31T13:45:00Z', needsApproval: 1, approved: null, deliverablePreview: 'Greenfield Corp Overview: Founded 2019, HQ Austin TX. Revenue ~$2M ARR, 45 FTE. Currently expanding into Southeast region. Key contact: Dana Reeves, VP Growth. ICP score: 92/100…' },
      { id: 'act-7', employeeId: 'bk', employeeName: 'Bookkeeper', employeeIcon: '📒', action: 'Reconciled 47 transactions', detail: 'All bank transactions from Mar 24–28 matched against invoices. No discrepancies found.', timestamp: '2026-03-28T10:30:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-8', employeeId: 'bk', employeeName: 'Bookkeeper', employeeIcon: '📒', action: 'Generated weekly financial summary', detail: 'Week of Mar 24: Revenue $18,420, Expenses $7,230, Net $11,190. Cash flow positive.', timestamp: '2026-03-28T15:00:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-9', employeeId: 'as', employeeName: 'Appointment Scheduler', employeeIcon: '📅', action: 'Booked 6 appointments', detail: 'Confirmed 6 new client meetings for this week. Sent calendar invites and 24-hour reminders.', timestamp: '2026-03-30T09:00:00Z', needsApproval: 0, approved: null, deliverablePreview: null },
      { id: 'act-10', employeeId: 'smm', employeeName: 'Social Media Manager', employeeIcon: '📱', action: 'Drafted Twitter thread', detail: 'Five-tweet thread on industry trends with data points and a CTA linking to the blog.', timestamp: '2026-03-31T11:30:00Z', needsApproval: 1, approved: null, deliverablePreview: '🧵 1/5 The landscape is shifting fast — here are 3 trends every small business owner should watch this quarter. Thread 👇\n\n2/5 Trend #1: AI-powered customer service is no longer optional…' },
      // Failure entries
      { id: 'act-11', employeeId: 'smm', employeeName: 'Social Media Manager', employeeIcon: '📱', action: 'Failed to publish scheduled post', detail: 'Instagram API returned rate limit error during scheduled posting window.', timestamp: '2026-03-30T14:00:00Z', needsApproval: 0, approved: null, deliverablePreview: null, status: 'failure', failureReason: 'Instagram API rate limit exceeded (429). Too many posts in the last hour.', failureStep: 'Step 3 of 4: Publishing to Instagram', retryCount: 2, resolution: null },
      { id: 'act-12', employeeId: 'lq', employeeName: 'Lead Qualifier', employeeIcon: '🎯', action: 'CRM import partially failed', detail: 'Attempted to import 14 scored leads into the CRM. 11 succeeded, 3 failed due to duplicate records.', timestamp: '2026-03-29T17:15:00Z', needsApproval: 0, approved: null, deliverablePreview: null, status: 'partial', failureReason: '3 leads already exist in CRM with matching email addresses.', failureStep: 'Step 2 of 3: CRM record creation', retryCount: 0, resolution: 'Skipped duplicates and flagged for manual review.' },
      { id: 'act-13', employeeId: 'as', employeeName: 'Appointment Scheduler', employeeIcon: '📅', action: 'Failed to send reminder batch', detail: 'Reminder emails for tomorrow\'s appointments could not be sent.', timestamp: '2026-03-31T07:00:00Z', needsApproval: 0, approved: null, deliverablePreview: null, status: 'failure', failureReason: 'Email service returned 503 — temporary outage.', failureStep: 'Step 1 of 2: Sending reminder emails', retryCount: 3, resolution: 'Retried after 30 minutes — all reminders sent successfully.' },
    ];

    for (const act of seedActivity) {
      db.insert(aiActivity)
        .values({ ...act, ownerSlackId: userId, createdAt: ts })
        .run();
    }

    // -- Routines --
    const seedRoutines = [
      { id: 'rt-smm-1', employeeId: 'smm', name: 'Check social mentions', description: 'Review all new mentions, comments, and DMs across platforms and respond or flag as needed.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '09:00', enabled: 1 },
      { id: 'rt-smm-2', employeeId: 'smm', name: 'Create and post content', description: 'Draft, design, and queue social posts for the next 24 hours based on the content calendar.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '14:00', enabled: 1 },
      { id: 'rt-smm-3', employeeId: 'smm', name: 'Weekly analytics report', description: 'Compile follower growth, engagement rates, and top-performing posts into a weekly summary.', days: ['fri'], time: '16:00', enabled: 1 },
      { id: 'rt-em-1', employeeId: 'em', name: 'Check campaign performance', description: 'Review open rates, click rates, and unsubscribes for all active email campaigns.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '09:30', enabled: 1 },
      { id: 'rt-em-2', employeeId: 'em', name: 'Send scheduled campaigns', description: 'Finalize and send pre-approved email campaigns to their target audience segments.', days: ['tue', 'thu'], time: '10:00', enabled: 1 },
      { id: 'rt-lq-1', employeeId: 'lq', name: 'Score new leads', description: 'Evaluate all new inbound leads against the ideal customer profile and assign priority scores.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '08:00', enabled: 1 },
      { id: 'rt-lq-2', employeeId: 'lq', name: 'Research top prospects', description: 'Deep-dive on the highest-scored leads: company size, revenue, decision-makers, and recent news.', days: ['mon', 'wed', 'fri'], time: '13:00', enabled: 1 },
      { id: 'rt-bk-1', employeeId: 'bk', name: 'Reconcile transactions', description: 'Match new bank transactions against invoices and receipts, flag any discrepancies.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '10:00', enabled: 1 },
      { id: 'rt-bk-2', employeeId: 'bk', name: 'Generate weekly summary', description: 'Produce a revenue, expenses, and cash-flow summary for the past week.', days: ['fri'], time: '15:00', enabled: 1 },
      { id: 'rt-as-1', employeeId: 'as', name: 'Check appointment requests', description: 'Review and confirm new appointment requests, resolving any scheduling conflicts.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '08:30', enabled: 1 },
      { id: 'rt-as-2', employeeId: 'as', name: 'Send daily reminders', description: 'Send 24-hour reminder messages to all clients with appointments the following day.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '07:00', enabled: 1 },
    ];

    for (const rt of seedRoutines) {
      db.insert(aiRoutines)
        .values({ ...rt, ownerSlackId: userId, createdAt: ts, updatedAt: ts })
        .run();
    }

    // -- Journal entries --
    const seedJournals = [
      { id: 'jrn-1', employeeId: 'smm', date: '2026-03-31', type: 'work_log', title: 'Drafted spring promo carousel', content: 'Created 5-slide Instagram carousel for spring promotions. Used warm tones from brand guide. Queued for 2pm optimal posting window.', tags: ['instagram', 'content', 'spring-promo'] },
      { id: 'jrn-2', employeeId: 'smm', date: '2026-03-30', type: 'failure', title: 'Instagram rate limit hit', content: 'Hit API rate limit while trying to publish scheduled posts. Need to spread posts further apart — Instagram limits to ~25 actions/hour.', tags: ['instagram', 'api', 'rate-limit'] },
      { id: 'jrn-3', employeeId: 'smm', date: '2026-03-28', type: 'learning', title: 'Carousel posts outperform single images 3:1', content: 'Analyzed last 30 days of posts. Carousels average 340 interactions vs 110 for single images. Adjusting content mix to favor carousels.', tags: ['analytics', 'content-strategy'] },
      { id: 'jrn-4', employeeId: 'em', date: '2026-03-30', type: 'work_log', title: 'Sent April newsletter to 2,480 subscribers', content: 'Campaign delivered successfully. Open rate 38.2% (above 25% threshold). CTR 5.7%. No deliverability issues.', tags: ['newsletter', 'campaign'] },
      { id: 'jrn-5', employeeId: 'em', date: '2026-03-29', type: 'insight', title: 'Urgency-based subject lines consistently win A/B tests', content: '"Don\'t miss out" beat "Your April perks" by 11 percentage points. This is the 3rd test where urgency framing outperformed benefit framing. Updating the subject line playbook.', tags: ['a-b-testing', 'subject-lines', 'pattern'] },
      { id: 'jrn-6', employeeId: 'lq', date: '2026-03-31', type: 'work_log', title: 'Scored 14 overnight leads', content: '3 hot (routed to pipeline), 7 warm (queued for nurture), 4 cold (archived). Greenfield Corp is the standout — strong ICP fit at 92/100.', tags: ['lead-scoring', 'pipeline'] },
      { id: 'jrn-7', employeeId: 'lq', date: '2026-03-29', type: 'failure', title: 'CRM import failed for 3 duplicate leads', content: 'CRM rejected 3 records due to existing entries with matching emails. Need a de-duplication check before import to avoid this.', tags: ['crm', 'data-quality'] },
      { id: 'jrn-8', employeeId: 'bk', date: '2026-03-28', type: 'work_log', title: 'Reconciled 47 transactions — all clean', content: 'Bank transactions from Mar 24-28 all matched. Revenue $18,420, Expenses $7,230, Net $11,190. No discrepancies.', tags: ['reconciliation', 'weekly'] },
      { id: 'jrn-9', employeeId: 'bk', date: '2026-03-25', type: 'insight', title: 'Software subscriptions up 22% vs last quarter', content: 'Noticed a pattern in expense categories — SaaS spend has climbed significantly. Might be worth an audit to check for unused tools.', tags: ['expenses', 'pattern', 'audit'] },
      { id: 'jrn-10', employeeId: 'as', date: '2026-03-31', type: 'failure', title: 'Reminder emails delayed by service outage', content: 'Email service returned 503 at 7am. Retried 3 times over 30 minutes. All reminders eventually sent by 7:30am. No client impact.', tags: ['email', 'outage', 'reminders'] },
      { id: 'jrn-11', employeeId: 'as', date: '2026-03-30', type: 'work_log', title: 'Booked 6 appointments for the week', content: 'Confirmed 6 new client meetings. Sent calendar invites with location and agenda. 24-hour reminders scheduled.', tags: ['scheduling', 'confirmations'] },
      { id: 'jrn-12', employeeId: 'as', date: '2026-03-28', type: 'learning', title: 'Tuesday 10am is the most requested slot', content: 'Analyzed 3 months of booking data. Tuesday 10am has the highest demand. Adding a second availability block on Tuesdays.', tags: ['scheduling', 'optimization', 'pattern'] },
    ];

    for (const jrn of seedJournals) {
      db.insert(aiJournals)
        .values({ ...jrn, ownerSlackId: userId, tags: jrn.tags, createdAt: ts })
        .run();
    }

    // Return seeded data
    const employees = db.select().from(aiEmployees).where(eq(aiEmployees.ownerSlackId, userId)).all();
    const activity = db.select().from(aiActivity).where(eq(aiActivity.ownerSlackId, userId)).all();
    const routines = db.select().from(aiRoutines).where(eq(aiRoutines.ownerSlackId, userId)).all();

    res.json({
      employees: employees.map(toEmployeeDTO),
      activity: activity.map(toActivityDTO),
      routines: routines.map(toRoutineDTO),
    });
  } catch (err) {
    console.error('[team] POST /team/seed error:', err);
    res.status(500).json({ error: 'Failed to seed team data' });
  }
});

// ---------------------------------------------------------------------------
// TASKS — assign work to employees
// ---------------------------------------------------------------------------

function toTaskDTO(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    description: row.description ?? '',
    priority: row.priority ?? 'medium',
    status: row.status ?? 'todo',
    output: row.output ?? undefined,
    tokensUsed: row.tokensUsed ?? 0,
    durationMs: row.durationMs ?? 0,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /team/employees/:id/tasks
router.get('/team/employees/:id/tasks', async (req: any, res) => {
  try {
    const { id } = req.params;
    // Always use local SQLite as source of truth
    const rows = db
      .select()
      .from(aiTasks)
      .where(and(eq(aiTasks.ownerSlackId, req.userId), eq(aiTasks.employeeId, id)))
      .orderBy(desc(aiTasks.createdAt))
      .all();
    res.json(rows.map(toTaskDTO));
  } catch (err) {
    console.error('[team] GET /team/employees/:id/tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /team/employees/:id/tasks
router.post('/team/employees/:id/tasks', async (req: any, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }

    const taskId = `task-${Date.now()}`;
    const ts = Math.floor(Date.now() / 1000);

    // Always write to local SQLite
    db.insert(aiTasks)
      .values({
        id: taskId,
        ownerSlackId: req.userId,
        employeeId: id,
        title,
        description: description || '',
        priority: priority || 'medium',
        status: 'todo',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Also push to Paperclip if connected
    if (req.paperclipCompanyId) {
      paperclip.createTask(req.paperclipCompanyId, {
        title,
        assigneeAgentId: id,
        priority: priority || 'medium',
      }).catch(() => { /* best-effort sync */ });
    }

    const row = db.select().from(aiTasks).where(eq(aiTasks.id, taskId)).get();
    res.json(toTaskDTO(row));
  } catch (err) {
    console.error('[team] POST /team/employees/:id/tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ---------------------------------------------------------------------------
// JOURNAL — per-employee memory log
// ---------------------------------------------------------------------------

// GET /team/employees/:id/journal
router.get('/team/employees/:id/journal', (req: any, res) => {
  try {
    const { id } = req.params;
    const conditions: any[] = [
      eq(aiJournals.ownerSlackId, req.userId),
      eq(aiJournals.employeeId, id),
    ];
    if (req.query.type) {
      conditions.push(eq(aiJournals.type, req.query.type as string));
    }
    const rows = db
      .select()
      .from(aiJournals)
      .where(and(...conditions))
      .orderBy(desc(aiJournals.createdAt))
      .all();
    res.json(rows.map(toJournalDTO));
  } catch (err) {
    console.error('[team] GET /team/employees/:id/journal error:', err);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /team/employees/:id/journal
router.post('/team/employees/:id/journal', (req: any, res) => {
  try {
    const { id } = req.params;
    const { date, type, title, content, tags } = req.body;
    if (!title || !type) { res.status(400).json({ error: 'Title and type are required' }); return; }

    const entryId = `jrn-${Date.now()}`;
    const ts = Math.floor(Date.now() / 1000);
    db.insert(aiJournals)
      .values({
        id: entryId,
        ownerSlackId: req.userId,
        employeeId: id,
        date: date || new Date().toISOString().slice(0, 10),
        type,
        title,
        content: content || '',
        tags: tags || [],
        createdAt: ts,
      })
      .run();
    const row = db.select().from(aiJournals).where(eq(aiJournals.id, entryId)).get();
    res.json(toJournalDTO(row));
  } catch (err) {
    console.error('[team] POST /team/employees/:id/journal error:', err);
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// ---------------------------------------------------------------------------
// TASK MANAGEMENT — update status, run tasks
// ---------------------------------------------------------------------------

// PATCH /team/tasks/:id — update task status, priority, etc.
router.patch('/team/tasks/:id', (req: any, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Record<string, any> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.output !== undefined) updates.output = body.output;
    updates.updatedAt = Math.floor(Date.now() / 1000);

    db.update(aiTasks).set(updates).where(eq(aiTasks.id, id)).run();
    const row = db.select().from(aiTasks).where(eq(aiTasks.id, id)).get();
    if (!row) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(toTaskDTO(row));
  } catch (err) {
    console.error('[team] PATCH /team/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /team/tasks/:id
router.delete('/team/tasks/:id', (req: any, res) => {
  try {
    db.delete(aiTasks).where(eq(aiTasks.id, req.params.id)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[team] DELETE /team/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST /team/tasks/:id/run — execute a task using the AI agent
router.post('/team/tasks/:id/run', async (req: any, res) => {
  try {
    const { id } = req.params;
    const task = db.select().from(aiTasks).where(eq(aiTasks.id, id)).get() as any;
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const employee = db.select().from(aiEmployees).where(eq(aiEmployees.id, task.employeeId)).get() as any;
    if (!employee) { res.status(404).json({ error: 'Employee not found' }); return; }

    // Check if execution is available (API key configured)
    const available = await isExecutionAvailable();
    if (!available) {
      res.status(503).json({ error: 'AI execution not available. Please configure your Anthropic API key.' });
      return;
    }

    // Mark task as in_progress
    const ts = Math.floor(Date.now() / 1000);
    db.update(aiTasks).set({ status: 'in_progress', updatedAt: ts }).where(eq(aiTasks.id, id)).run();

    // Mark employee as working
    db.update(aiEmployees).set({ status: 'working', updatedAt: ts }).where(eq(aiEmployees.id, employee.id)).run();

    // Execute the task
    const soul = typeof employee.soul === 'string' ? JSON.parse(employee.soul) : employee.soul;
    const skills = typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills ?? [];

    const result = await executeTask({
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        department: employee.departmentLabel || employee.department,
        skills,
        standingInstructions: employee.standingInstructions || '',
        model: employee.model || 'sonnet',
        soul: soul || undefined,
      },
      task: {
        title: task.title,
        description: task.description || '',
        priority: task.priority,
      },
      ownerContext: req.body.context,
    });

    // Update task with result
    db.update(aiTasks).set({
      status: result.success ? 'done' : 'failed',
      output: result.output,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      failureReason: result.error || null,
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(aiTasks.id, id)).run();

    // Set employee back to idle
    db.update(aiEmployees).set({ status: 'idle', updatedAt: Math.floor(Date.now() / 1000) }).where(eq(aiEmployees.id, employee.id)).run();

    // Determine if this needs approval based on trust level
    const needsApproval = employee.trustLevel === 'supervised' ||
      (employee.trustLevel === 'trusted' && (task.priority === 'high' || task.priority === 'urgent'));

    // Auto-create activity entry
    const actId = `act-${Date.now()}`;
    db.insert(aiActivity).values({
      id: actId,
      ownerSlackId: req.userId,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeIcon: employee.icon,
      action: result.success ? `Completed: ${task.title}` : `Failed: ${task.title}`,
      detail: result.success
        ? `Task completed in ${(result.durationMs / 1000).toFixed(1)}s using ${result.tokensUsed} tokens.`
        : `Task failed: ${result.error}`,
      timestamp: new Date().toISOString(),
      needsApproval: needsApproval && result.success ? 1 : 0,
      approved: null,
      deliverablePreview: result.success ? result.output.slice(0, 500) : null,
      status: result.success ? 'success' : 'failure',
      failureReason: result.error || null,
      createdAt: Math.floor(Date.now() / 1000),
    }).run();

    // Auto-create journal entry
    const jrnId = `jrn-${Date.now()}`;
    db.insert(aiJournals).values({
      id: jrnId,
      ownerSlackId: req.userId,
      employeeId: employee.id,
      date: new Date().toISOString().slice(0, 10),
      type: result.success ? 'work_log' : 'failure',
      title: task.title,
      content: result.success
        ? `Completed task "${task.title}" (${task.priority} priority). Output: ${result.output.slice(0, 1000)}`
        : `Failed to complete "${task.title}": ${result.error}`,
      tags: [task.priority, result.success ? 'completed' : 'failed'],
      createdAt: Math.floor(Date.now() / 1000),
    }).run();

    // Send Slack notification (fire-and-forget)
    if (result.success) {
      slackNotify.notifyTaskCompleted({
        ownerSlackId: req.userId,
        employeeName: employee.name,
        employeeIcon: employee.icon || '🤖',
        taskTitle: task.title,
        needsApproval,
        outputPreview: result.output.slice(0, 300),
      }).catch(() => {});
    } else {
      slackNotify.notifyTaskFailed({
        ownerSlackId: req.userId,
        employeeName: employee.name,
        employeeIcon: employee.icon || '🤖',
        taskTitle: task.title,
        error: result.error || 'Unknown error',
      }).catch(() => {});
    }

    // Update employee deliverables count
    if (result.success) {
      db.update(aiEmployees).set({
        deliverablesCount: (employee.deliverablesCount ?? 0) + 1,
        hoursUsed: (employee.hoursUsed ?? 0) + calculateHoursConsumed(task.priority, employee.model || 'sonnet'),
      }).where(eq(aiEmployees.id, employee.id)).run();
    }

    // Return the completed task
    const updatedTask = db.select().from(aiTasks).where(eq(aiTasks.id, id)).get();
    res.json({
      task: toTaskDTO(updatedTask),
      activity: toActivityDTO(db.select().from(aiActivity).where(eq(aiActivity.id, actId)).get()),
      needsApproval,
    });
  } catch (err) {
    console.error('[team] POST /team/tasks/:id/run error:', err);
    res.status(500).json({ error: 'Failed to run task' });
  }
});

// ---------------------------------------------------------------------------
// BULK OPERATIONS
// ---------------------------------------------------------------------------

// POST /team/bulk/pause-all — pause all AI employees
router.post('/team/bulk/pause-all', (req: any, res) => {
  try {
    const ts = Math.floor(Date.now() / 1000);
    db.update(aiEmployees)
      .set({ status: 'paused', updatedAt: ts })
      .where(and(
        eq(aiEmployees.ownerSlackId, req.userId),
        sql`${aiEmployees.id} != 'owner'`,
        sql`${aiEmployees.isChiefOfStaff} != 1`,
      ))
      .run();
    const rows = db.select().from(aiEmployees).where(eq(aiEmployees.ownerSlackId, req.userId)).all();
    res.json(rows.map(toEmployeeDTO));
  } catch (err) {
    console.error('[team] POST /team/bulk/pause-all error:', err);
    res.status(500).json({ error: 'Failed to pause all employees' });
  }
});

// POST /team/bulk/resume-all — resume all paused AI employees
router.post('/team/bulk/resume-all', (req: any, res) => {
  try {
    const ts = Math.floor(Date.now() / 1000);
    db.update(aiEmployees)
      .set({ status: 'idle', updatedAt: ts })
      .where(and(
        eq(aiEmployees.ownerSlackId, req.userId),
        eq(aiEmployees.status, 'paused'),
      ))
      .run();
    const rows = db.select().from(aiEmployees).where(eq(aiEmployees.ownerSlackId, req.userId)).all();
    res.json(rows.map(toEmployeeDTO));
  } catch (err) {
    console.error('[team] POST /team/bulk/resume-all error:', err);
    res.status(500).json({ error: 'Failed to resume all employees' });
  }
});

// DELETE /team/bulk/reset — clear all AI team data for this user
router.delete('/team/bulk/reset', (req: any, res) => {
  try {
    db.delete(aiTasks).where(eq(aiTasks.ownerSlackId, req.userId)).run();
    db.delete(aiJournals).where(eq(aiJournals.ownerSlackId, req.userId)).run();
    db.delete(aiActivity).where(eq(aiActivity.ownerSlackId, req.userId)).run();
    db.delete(aiRoutines).where(eq(aiRoutines.ownerSlackId, req.userId)).run();
    db.delete(aiMetricsSnapshots).where(eq(aiMetricsSnapshots.ownerSlackId, req.userId)).run();
    db.delete(aiEmployees).where(eq(aiEmployees.ownerSlackId, req.userId)).run();
    res.json({ success: true });
  } catch (err) {
    console.error('[team] DELETE /team/bulk/reset error:', err);
    res.status(500).json({ error: 'Failed to reset team data' });
  }
});

// ---------------------------------------------------------------------------
// PERFORMANCE METRICS
// ---------------------------------------------------------------------------

// POST /team/metrics/snapshot — capture today's metrics for all employees
router.post('/team/metrics/snapshot', (req: any, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ts = Math.floor(Date.now() / 1000);
    const employees = db.select().from(aiEmployees)
      .where(and(
        eq(aiEmployees.ownerSlackId, req.userId),
        sql`${aiEmployees.id} != 'owner'`,
      ))
      .all();

    const snapshots: any[] = [];
    for (const emp of employees) {
      // Count today's metrics from related tables
      const tasksCompleted = db.select().from(aiTasks)
        .where(and(eq(aiTasks.employeeId, emp.id), eq(aiTasks.status, 'done')))
        .all().length;
      const tasksCreated = db.select().from(aiTasks)
        .where(eq(aiTasks.employeeId, emp.id))
        .all().length;
      const journalCount = db.select().from(aiJournals)
        .where(eq(aiJournals.employeeId, emp.id))
        .all().length;
      const failureCount = db.select().from(aiActivity)
        .where(and(eq(aiActivity.employeeId, emp.id), eq(aiActivity.status, 'failure')))
        .all().length;

      const snapId = `snap-${emp.id}-${today}`;
      // Upsert: delete any existing snapshot for this employee+date, then insert
      db.delete(aiMetricsSnapshots)
        .where(and(eq(aiMetricsSnapshots.employeeId, emp.id), eq(aiMetricsSnapshots.date, today)))
        .run();
      db.insert(aiMetricsSnapshots).values({
        id: snapId,
        employeeId: emp.id,
        date: today,
        tasksCompleted,
        tasksCreated,
        approvalsReceived: (emp as any).approvalsCount ?? 0,
        rejectionsReceived: 0,
        hoursUsed: (emp as any).hoursUsed ?? 0,
        journalEntries: journalCount,
        failureCount,
        ownerSlackId: req.userId,
        createdAt: ts,
      }).run();
      snapshots.push({ employeeId: emp.id, date: today, tasksCompleted, tasksCreated, journalCount, failureCount });
    }
    res.json({ date: today, snapshots });
  } catch (err) {
    console.error('[team] POST /team/metrics/snapshot error:', err);
    res.status(500).json({ error: 'Failed to capture metrics snapshot' });
  }
});

// GET /team/metrics — get metrics history for all employees
router.get('/team/metrics', (req: any, res) => {
  try {
    const rows = db.select().from(aiMetricsSnapshots)
      .where(eq(aiMetricsSnapshots.ownerSlackId, req.userId))
      .orderBy(desc(aiMetricsSnapshots.date))
      .all();
    res.json(rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employeeId,
      date: r.date,
      tasksCompleted: r.tasksCompleted ?? 0,
      tasksCreated: r.tasksCreated ?? 0,
      approvalsReceived: r.approvalsReceived ?? 0,
      rejectionsReceived: r.rejectionsReceived ?? 0,
      hoursUsed: r.hoursUsed ?? 0,
      journalEntries: r.journalEntries ?? 0,
      failureCount: r.failureCount ?? 0,
    })));
  } catch (err) {
    console.error('[team] GET /team/metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /team/metrics/:employeeId — get metrics history for one employee
router.get('/team/metrics/:employeeId', (req: any, res) => {
  try {
    const rows = db.select().from(aiMetricsSnapshots)
      .where(and(
        eq(aiMetricsSnapshots.ownerSlackId, req.userId),
        eq(aiMetricsSnapshots.employeeId, req.params.employeeId),
      ))
      .orderBy(desc(aiMetricsSnapshots.date))
      .all();
    res.json(rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employeeId,
      date: r.date,
      tasksCompleted: r.tasksCompleted ?? 0,
      tasksCreated: r.tasksCreated ?? 0,
      approvalsReceived: r.approvalsReceived ?? 0,
      rejectionsReceived: r.rejectionsReceived ?? 0,
      hoursUsed: r.hoursUsed ?? 0,
      journalEntries: r.journalEntries ?? 0,
      failureCount: r.failureCount ?? 0,
    })));
  } catch (err) {
    console.error('[team] GET /team/metrics/:employeeId error:', err);
    res.status(500).json({ error: 'Failed to fetch employee metrics' });
  }
});

// ---------------------------------------------------------------------------
// ORCHESTRATION STATUS
// ---------------------------------------------------------------------------

router.get('/team/status', async (req: any, res) => {
  const alive = await paperclip.isPaperclipAlive();
  const executionReady = await isExecutionAvailable();

  // Get orchestration health details if available
  let orchestrationVersion: string | null = null;
  let agentCount = 0;
  if (alive) {
    try {
      const health = await fetch('http://127.0.0.1:3100/api/health', { signal: AbortSignal.timeout(2000) })
        .then((r) => r.json())
        .catch(() => null);
      if (health) orchestrationVersion = health.version || null;

      if (req.paperclipCompanyId) {
        const agents = await paperclip.listEmployees(req.paperclipCompanyId);
        if (agents) agentCount = agents.length;
      }
    } catch { /* non-critical */ }
  }

  res.json({
    paperclipConnected: alive,
    companyId: req.paperclipCompanyId || null,
    mode: alive ? 'live' : 'local',
    paperclipVersion: orchestrationVersion,
    paperclipAgents: agentCount,
    executionReady,
  });
});

export default router;

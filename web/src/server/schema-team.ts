// AI Team schema for managing AI employees, activity, and routines
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const aiEmployees = sqliteTable('ai_employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  department: text('department').notNull(),
  departmentLabel: text('department_label'),
  status: text('status').notNull().default('idle'),
  trustLevel: text('trust_level').notNull().default('supervised'),
  reportsTo: text('reports_to'),
  icon: text('icon'),
  skills: text('skills', { mode: 'json' }),
  trainingMaterials: text('training_materials', { mode: 'json' }),
  standingInstructions: text('standing_instructions'),
  hoursUsed: integer('hours_used').default(0),
  hoursAllocated: integer('hours_allocated').default(0),
  approvalsCount: integer('approvals_count').default(0),
  deliverablesCount: integer('deliverables_count').default(0),
  hireDate: text('hire_date'),
  isChiefOfStaff: integer('is_chief_of_staff').default(0),
  ownerSlackId: text('owner_slack_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const aiActivity = sqliteTable('ai_activity', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  employeeName: text('employee_name'),
  employeeIcon: text('employee_icon'),
  action: text('action').notNull(),
  detail: text('detail'),
  timestamp: text('timestamp'),
  needsApproval: integer('needs_approval').default(0),
  approved: integer('approved'),
  deliverablePreview: text('deliverable_preview'),
  ownerSlackId: text('owner_slack_id'),
  createdAt: integer('created_at').notNull(),
});

export const aiRoutines = sqliteTable('ai_routines', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  days: text('days', { mode: 'json' }),
  time: text('time'),
  enabled: integer('enabled').default(1),
  ownerSlackId: text('owner_slack_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

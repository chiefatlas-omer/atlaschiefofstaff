import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  slackUserId: text('slack_user_id').notNull(),
  slackUserName: text('slack_user_name'),
  description: text('description').notNull(),
  rawMessageText: text('raw_message_text'),
  sourceChannelId: text('source_channel_id'),
  sourceMessageTs: text('source_message_ts'),
  sourceThreadTs: text('source_thread_ts'),
  botReplyTs: text('bot_reply_ts'),
  status: text('status', {
    enum: ['DETECTED', 'CONFIRMED', 'COMPLETED', 'OVERDUE', 'ESCALATED', 'DISMISSED'],
  }).notNull().default('DETECTED'),
  confidence: text('confidence', { enum: ['high', 'medium'] }),
  team: text('team', { enum: ['team_a', 'team_b'] }),
  deadlineText: text('deadline_text'),
  deadline: integer('deadline', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  lastReminderAt: integer('last_reminder_at', { mode: 'timestamp' }),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  source: text('source', { enum: ['slack', 'zoom', 'manual', 'desktop'] }).notNull().default('slack'),
  zoomMeetingId: text('zoom_meeting_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_tasks_status_deadline').on(table.status, table.deadline),
  index('idx_tasks_user_status').on(table.slackUserId, table.status),
]);

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slackUserId: text('slack_user_id').notNull(),
  team: text('team', { enum: ['team_a', 'team_b'] }).notNull(),
  displayName: text('display_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const escalationTargets = sqliteTable('escalation_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slackUserId: text('slack_user_id').notNull(),
  role: text('role', { enum: ['owner', 'manager'] }).notNull(),
  displayName: text('display_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const zoomUserMappings = sqliteTable('zoom_user_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  zoomDisplayName: text('zoom_display_name').notNull().unique(),
  slackUserId: text('slack_user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const digestLogs = sqliteTable('digest_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sentAt: integer('sent_at', { mode: 'timestamp' }).notNull(),
  recipientSlackId: text('recipient_slack_id').notNull(),
  taskCount: integer('task_count').notNull(),
  overdueCount: integer('overdue_count').notNull(),
  completedCount: integer('completed_count').notNull(),
});

export const processedMessages = sqliteTable('processed_messages', {
  messageTs: text('message_ts').primaryKey(),
  channelId: text('channel_id').notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_processed_channel_ts').on(table.channelId, table.messageTs),
]);

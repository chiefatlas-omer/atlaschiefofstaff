import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const emailDrafts = sqliteTable('email_drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipientName: text('recipient_name'),
  recipientCompany: text('recipient_company'),
  recipientEmail: text('recipient_email'),
  archetype: text('archetype'),
  emailBody: text('email_body'),
  meetingTitle: text('meeting_title'),
  callAnalysisId: integer('call_analysis_id'),
  repSlackId: text('rep_slack_id'),
  repName: text('rep_name'),
  status: text('status').default('draft'),
  createdAt: integer('created_at'),
});

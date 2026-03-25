import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

export const config = {
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
    signingSecret: optionalEnv('SLACK_SIGNING_SECRET', 'dev'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },
  escalation: {
    omerSlackUserId: optionalEnv('OMER_SLACK_USER_ID'),
    markSlackUserId: optionalEnv('MARK_SLACK_USER_ID'),
    ehsanSlackUserId: optionalEnv('EHSAN_SLACK_USER_ID'),
  },
  channels: {
    teamA: optionalEnv('TEAM_A_CHANNEL_ID'),
    teamB: optionalEnv('TEAM_B_CHANNEL_ID'),
    founderHubHQ: optionalEnv('FOUNDERHUBHQ_CHANNEL_ID'),
  },
  zoom: {
    accountId: optionalEnv('ZOOM_ACCOUNT_ID'),
    clientId: optionalEnv('ZOOM_CLIENT_ID'),
    clientSecret: optionalEnv('ZOOM_CLIENT_SECRET'),
    webhookSecretToken: optionalEnv('ZOOM_WEBHOOK_SECRET_TOKEN'),
  },
  db: {
    path: optionalEnv('DATABASE_PATH', './data/chiefofstaff.db'),
  },
  timezone: optionalEnv('TZ', 'America/Chicago'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),
};

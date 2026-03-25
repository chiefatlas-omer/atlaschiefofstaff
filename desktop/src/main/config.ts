import dotenv from 'dotenv';
import path from 'path';

// __dirname is dist/main/ after compilation, so .env is 2 levels up at desktop/
// Try multiple paths to find .env
const envPaths = [
  path.resolve(__dirname, '..', '..', '.env'),       // dist/main/ -> desktop/.env
  path.resolve(__dirname, '..', '..', '..', '.env'),  // fallback: one more level up
  path.resolve(process.cwd(), '.env'),                 // CWD (when running from desktop/)
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: true });
  if (!result.error) {
    console.log(`Loaded .env from: ${envPath}`);
    break;
  }
}

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
  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },
  slackUserId: requireEnv('SLACK_USER_ID'),
  db: {
    path: optionalEnv('CHIEF_DB_PATH', path.resolve(__dirname, '..', '..', '..', 'bot', 'data', 'chiefofstaff.db')),
  },
  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID'),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri: optionalEnv('GOOGLE_REDIRECT_URI', 'http://localhost:8923/oauth/callback'),
  },
  meetingPrep: {
    minutesBefore: parseInt(optionalEnv('MEETING_PREP_MINUTES', '15'), 10),
    pollIntervalMs: parseInt(optionalEnv('MEETING_POLL_INTERVAL_MS', '60000'), 10),
  },
};

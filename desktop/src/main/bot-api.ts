/**
 * bot-api.ts
 *
 * Client for the Atlas Chief of Staff bot API running on Fly.dev.
 * Provides access to tasks, knowledge queries, and email generation.
 */

import { config } from './config';

const BOT_API_URL = config.botApi.url;

export interface BotTask {
  id: string;
  description: string;
  status: string;
  deadline: string | null;
  deadlineText: string | null;
  owner: string | null;
  source: string;
}

export interface KnowledgeResponse {
  answer: string;
  sources?: string[];
}

export interface EmailResponse {
  answer: string;
  email?: {
    subject: string;
    body: string;
  };
}

/**
 * Fetch all tasks from the bot API.
 */
export async function fetchTasks(): Promise<BotTask[]> {
  const res = await fetch(`${BOT_API_URL}/api/tasks`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Bot API /api/tasks failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // API may return { tasks: [...] } or an array directly
  return Array.isArray(data) ? data : (data.tasks || []);
}

/**
 * Ask the knowledge bot a question. Optionally generate an email draft.
 */
export async function askKnowledgeBot(
  question: string,
  generateEmail = false,
): Promise<KnowledgeResponse | EmailResponse> {
  const res = await fetch(`${BOT_API_URL}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ question, generateEmail }),
  });
  if (!res.ok) {
    throw new Error(`Bot API /api/ask failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Health check — useful for verifying connectivity.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BOT_API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

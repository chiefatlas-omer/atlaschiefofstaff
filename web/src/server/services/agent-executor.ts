/**
 * Agent Executor — runs AI employee tasks via the Anthropic Messages API.
 *
 * Given an employee's soul profile, skills, and standing instructions, this
 * service builds a tailored system prompt and sends the task to Claude.  The
 * result is returned as structured ExecutionResult metadata suitable for
 * storing alongside the task record.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  model: string;
  durationMs: number;
  error?: string;
}

export interface ExecutionContext {
  employee: {
    id: string;
    name: string;
    role: string;
    department: string;
    skills: string[];
    standingInstructions: string;
    model?: AgentModel; // sonnet (fast + affordable) or opus (maximum quality)
    soul?: {
      personality: string;
      workingStyle: string;
      decisionFramework: string;
      strengths: string[];
      growthAreas: string[];
    };
  };
  task: {
    title: string;
    description: string;
    priority: string;
  };
  ownerContext?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Available models — users can choose per-employee
export type AgentModel = 'sonnet' | 'opus';

const MODEL_IDS: Record<AgentModel, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
};

// Dynamic token limits based on task priority and model
// Higher priority = more room for thorough output
const TOKEN_LIMITS: Record<string, number> = {
  low: 4096,
  medium: 8192,
  high: 12288,
  urgent: 16384,
};
const DEFAULT_MAX_TOKENS = 8192;

// Hours consumed per task based on priority — used for billing/budget tracking
export const HOURS_WEIGHT: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 1.0,
  urgent: 2.0,
};

// Model cost multipliers — Opus costs more due to higher quality/compute
export const MODEL_MULTIPLIER: Record<AgentModel, number> = {
  sonnet: 1.0,
  opus: 3.0,
};

/** Calculate hours consumed by a task based on priority and model */
export function calculateHoursConsumed(priority: string, model: AgentModel = 'sonnet'): number {
  const weight = HOURS_WEIGHT[priority] || HOURS_WEIGHT.medium;
  const multiplier = MODEL_MULTIPLIER[model] || 1.0;
  return weight * multiplier;
}

/** Path to the Paperclip sidecar default instance .env */
const PAPERCLIP_ENV_PATH = join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.paperclip',
  'instances',
  'default',
  '.env',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Anthropic API key.
 *
 * 1. `process.env.ANTHROPIC_API_KEY`
 * 2. Paperclip sidecar .env file (`ANTHROPIC_API_KEY=...`)
 *
 * Returns `null` if the key cannot be found.
 */
export function getAnthropicApiKey(): string | null {
  // 1. Environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Paperclip .env file
  try {
    const raw = readFileSync(PAPERCLIP_ENV_PATH, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key.trim() === 'ANTHROPIC_API_KEY') {
        const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    }
  } catch {
    // File doesn't exist or isn't readable — that's fine.
  }

  return null;
}

/**
 * Returns `true` when we have a valid API key and can reach the Anthropic API.
 */
export async function isExecutionAvailable(): Promise<boolean> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return false;

  try {
    // Lightweight models list call to verify the key works.
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_IDS.sonnet,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: ExecutionContext): string {
  const { employee } = ctx;
  const parts: string[] = [];

  parts.push(
    `You are ${employee.name}, a ${employee.role} at a local business. You report to the Chief of Staff.`,
  );

  if (employee.soul) {
    const { soul } = employee;

    if (soul.personality) {
      parts.push(`\n## Your Personality\n${soul.personality}`);
    }
    if (soul.workingStyle) {
      parts.push(`\n## Your Working Style\n${soul.workingStyle}`);
    }
    if (soul.decisionFramework) {
      parts.push(`\n## Decision Framework\n${soul.decisionFramework}`);
    }
    if (soul.strengths?.length) {
      parts.push(
        `\n## Your Strengths\n${soul.strengths.map((s) => `- ${s}`).join('\n')}`,
      );
    }
    if (soul.growthAreas?.length) {
      parts.push(
        `\n## Growth Areas\n${soul.growthAreas.map((a) => `- ${a}`).join('\n')}`,
      );
    }
  }

  if (employee.skills?.length) {
    parts.push(`\n## Your Skills\n${employee.skills.join(', ')}`);
  }

  if (employee.standingInstructions) {
    parts.push(`\n## Standing Instructions\n${employee.standingInstructions}`);
  }

  parts.push(`
## Guidelines
- Produce clear, actionable output
- Write in a professional but approachable tone
- If this task is outside your expertise, say so clearly
- Format your output with markdown for readability
- Be concise — quality over quantity

## Writing Quality — Sound Human, Not AI
Your writing MUST sound like a real professional wrote it. Avoid these AI-generated writing patterns:

**Content:** No inflated significance claims ("groundbreaking", "game-changing"). No promotional language. No formulaic "challenges and opportunities" sections. No vague attributions ("experts say", "many believe").

**Vocabulary:** Never use these overused AI words: "testament", "pivotal", "intricate", "tapestry", "multifaceted", "comprehensive", "crucial", "landscape", "foster", "delve", "moreover", "furthermore", "in conclusion". Use plain, direct language instead.

**Structure:** Don't force everything into threes. Don't cycle through synonyms to sound varied. Avoid em dash overuse. Don't bold every other phrase. Use sentence case for headings, not Title Case.

**Tone:** No sycophantic opening ("Great question!"). No filler hedging ("It's important to note that..."). No generic positive conclusions. No signposting ("Let's explore...", "In this section we'll cover..."). Just write directly.

**Voice:** Write with actual personality. Vary sentence length — mix short punchy sentences with longer ones. Use first person when appropriate. Be specific, not generic. Acknowledge complexity instead of oversimplifying. Have opinions when the role calls for it.`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function buildUserMessage(ctx: ExecutionContext): string {
  const { task, ownerContext } = ctx;
  const lines: string[] = [];

  lines.push(`# Task: ${task.title}`);
  if (task.priority) {
    lines.push(`**Priority:** ${task.priority}`);
  }
  lines.push('');
  lines.push(task.description);

  if (ownerContext) {
    lines.push('');
    lines.push(`## Additional Context from the Owner`);
    lines.push(ownerContext);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Execute a task as an AI employee.
 *
 * Builds a tailored system prompt from the employee's soul profile, skills,
 * and standing instructions, then calls the Anthropic Messages API.
 */
export async function executeTask(ctx: ExecutionContext): Promise<ExecutionResult> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      success: false,
      output: '',
      tokensUsed: 0,
      model: 'none',
      durationMs: 0,
      error: 'Anthropic API key not configured. Set ANTHROPIC_API_KEY or add it to the Paperclip .env.',
    };
  }

  // Resolve model — employee preference, defaults to sonnet
  const modelChoice: AgentModel = ctx.employee.model || 'sonnet';
  const modelId = MODEL_IDS[modelChoice];

  // Dynamic token limit based on task priority
  const maxTokens = TOKEN_LIMITS[ctx.task.priority] || DEFAULT_MAX_TOKENS;

  const systemPrompt = buildSystemPrompt(ctx);
  const userMessage = buildUserMessage(ctx);

  const startMs = Date.now();

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const durationMs = Date.now() - startMs;

    if (!res.ok) {
      const errorBody = await res.text();
      return {
        success: false,
        output: '',
        tokensUsed: 0,
        model: modelId,
        durationMs,
        error: `Anthropic API error ${res.status}: ${errorBody}`,
      };
    }

    const data = await res.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    const output = data.content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('\n\n');

    const tokensUsed =
      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    return {
      success: true,
      output,
      tokensUsed,
      model: data.model || modelId,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: '',
      tokensUsed: 0,
      model: modelId,
      durationMs,
      error: `Network error: ${message}`,
    };
  }
}

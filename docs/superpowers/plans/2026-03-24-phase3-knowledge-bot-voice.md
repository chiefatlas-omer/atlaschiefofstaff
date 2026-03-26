# Phase 3: Knowledge Bot + Voice Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a queryable business brain that gives any team member "owner-level answers" so 90% of daily decisions don't escalate to leadership. Add proactive alerts. Upgrade voice dictation to Whispr Flow quality with context-aware corrections.

**Architecture:** Upgrade the existing `/ask` command into a full knowledge bot accessible via Slack DMs, @mentions, and desktop voice. Add a KNOWLEDGE_QUERY intent to the desktop classifier so voice questions route to the knowledge bot. Add proactive behaviors via a daily cron that detects anomalies, stale deals, and knowledge gaps. Upgrade Whisper from whisper-1 to whisper-1 with optimized settings (prompt context, temperature).

**Tech Stack:** TypeScript, Claude Sonnet (answer synthesis), OpenAI Whisper (upgraded), existing embedding/graph services.

---

## File Structure

### New Files
- `bot/src/services/knowledge-bot.ts` — Central knowledge bot logic: query → search → synthesize → respond. Reused by /ask, DMs, @mentions, and voice.
- `bot/src/services/proactive-alerts.ts` — Detects anomalies, stale deals, knowledge gaps, overdue follow-ups. Generates proactive insight messages.

### Modified Files
- `bot/src/slack/commands.ts` — Refactor `/ask` to use knowledge-bot service
- `bot/src/slack/dm-handler.ts` — Add knowledge bot fallback for unrecognized DMs
- `bot/src/slack/listeners.ts` — Add knowledge bot fallback for unrecognized @mentions
- `bot/src/scheduler/cron-jobs.ts` — Add daily proactive alerts cron
- `desktop/src/main/ai/intent-classifier.ts` — Add KNOWLEDGE_QUERY intent
- `desktop/src/main/ipc-handlers.ts` — Route KNOWLEDGE_QUERY to knowledge bot
- `desktop/src/main/voice/whisper-client.ts` — Upgrade transcription settings
- `desktop/src/shared/types.ts` — Add KNOWLEDGE_RESPONSE IPC channel
- `desktop/src/preload/preload.ts` — Expose KNOWLEDGE_RESPONSE listener
- `desktop/src/renderer/app.ts` — Add knowledge response panel
- `desktop/src/renderer/index.html` — Add knowledge panel markup
- `desktop/src/renderer/styles.css` — Add knowledge panel styles

---

## Task 1: Build Knowledge Bot Service

**Files:**
- Create: `bot/src/services/knowledge-bot.ts`

This is the central brain — called by /ask, DMs, @mentions, and voice. Extracts the query logic from the existing `/ask` command into a reusable service.

- [ ] **Step 1: Create knowledge-bot.ts**

```typescript
import { semanticSearch, KnowledgeSearchResult } from './embedding-service';
import { recordQA } from './feedback-service';
import { anthropic } from '../ai/client';
import { getRelatedEntities } from './graph-service';
import { db } from '../db/connection';
import { documents } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface KnowledgeBotQuery {
  question: string;
  askedBy?: string;
  askedVia: 'slack' | 'voice' | 'web';
}

export interface KnowledgeBotResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sourceCount: number;
  qaId: number;
  sources: Array<{ content: string; sourceType: string; similarity: number }>;
}

const KNOWLEDGE_BOT_SYSTEM = `You are Atlas Chief of Staff — a business knowledge assistant for a company. Answer questions based ONLY on the provided context. Be direct, specific, and actionable.

Rules:
- Cite sources as [Source N] when referencing specific information
- If the context doesn't fully answer the question, say what you can and note what's missing
- For process questions, give step-by-step answers if the context supports it
- For data questions (deals, people, metrics), be precise with numbers and names
- If you find conflicting information across sources, note the conflict
- Be concise — executives are busy
- If you truly don't know, say so. Never fabricate information.`;

/**
 * Core knowledge bot query — used by all interfaces (Slack, voice, web).
 */
export async function queryKnowledgeBot(
  input: KnowledgeBotQuery,
): Promise<KnowledgeBotResponse> {
  // 1. Semantic search
  const results = await semanticSearch(input.question, 12);
  const relevant = results.filter(r => r.similarity > 0.25);

  // 2. Also check active SOPs for process-related questions
  const processKeywords = /\b(process|how do we|procedure|steps|sop|workflow|guide)\b/i;
  let sopContext = '';
  if (processKeywords.test(input.question)) {
    const activeSops = db.select().from(documents)
      .where(and(eq(documents.type, 'sop'), eq(documents.status, 'active')))
      .all();
    const relevantSops = activeSops.filter(s => {
      const topic = (s.metadata as any)?.topic?.toLowerCase() || '';
      const title = s.title.toLowerCase();
      const q = input.question.toLowerCase();
      return q.split(' ').some(word => word.length > 3 && (topic.includes(word) || title.includes(word)));
    });
    if (relevantSops.length > 0) {
      sopContext = relevantSops.map(s => `[Active SOP: ${s.title}]\n${s.content}`).join('\n\n');
    }
  }

  // 3. Handle no results
  if (relevant.length === 0 && !sopContext) {
    const qaId = recordQA({
      question: input.question,
      answer: 'No relevant information found in the knowledge base.',
      confidence: 'low',
      sourceEntryIds: [],
      askedBy: input.askedBy,
      askedVia: input.askedVia,
    });
    return {
      answer: `I don't have enough information to answer "${input.question}" yet. This has been flagged as a knowledge gap.`,
      confidence: 'low',
      sourceCount: 0,
      qaId,
      sources: [],
    };
  }

  // 4. Build context for Claude
  const searchContext = relevant.map((r, i) => `[Source ${i + 1}] (${r.sourceType}) ${r.content}`).join('\n\n');
  const fullContext = sopContext
    ? `${searchContext}\n\n--- Active SOPs ---\n${sopContext}`
    : searchContext;

  // 5. Synthesize answer with Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: KNOWLEDGE_BOT_SYSTEM,
    messages: [{ role: 'user', content: `Context:\n${fullContext}\n\nQuestion: ${input.question}` }],
  });

  const answer = response.content[0].type === 'text'
    ? response.content[0].text
    : 'Unable to generate answer.';

  // 6. Calculate confidence
  const topSimilarity = relevant.length > 0 ? relevant[0].similarity : 0;
  const confidence = topSimilarity >= 0.7 ? 'high' : topSimilarity >= 0.45 ? 'medium' : 'low';

  // 7. Record Q&A
  const qaId = recordQA({
    question: input.question,
    answer,
    confidence,
    sourceEntryIds: relevant.map(r => r.id),
    askedBy: input.askedBy,
    askedVia: input.askedVia,
  });

  return {
    answer,
    confidence,
    sourceCount: relevant.length,
    qaId,
    sources: relevant.slice(0, 5).map(r => ({
      content: r.content.substring(0, 200),
      sourceType: r.sourceType,
      similarity: r.similarity,
    })),
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add bot/src/services/knowledge-bot.ts
git commit -m "feat: add knowledge bot service — central brain for Slack, voice, and web queries"
```

---

## Task 2: Refactor /ask Command + Wire Knowledge Bot into DMs and @mentions

**Files:**
- Modify: `bot/src/slack/commands.ts`
- Modify: `bot/src/slack/dm-handler.ts`
- Modify: `bot/src/slack/listeners.ts`

- [ ] **Step 1: Refactor /ask to use knowledge-bot service**

In `bot/src/slack/commands.ts`, replace the current `/ask` implementation. Remove the inline semantic search + Claude calls and replace with:

```typescript
import { queryKnowledgeBot } from '../services/knowledge-bot';
```

Replace the body of the `/ask` handler with:

```typescript
    try {
      const result = await queryKnowledgeBot({
        question,
        askedBy: command.user_id,
        askedVia: 'slack',
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text: result.answer,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Q: ${question}*\n\n${result.answer}\n\n_Confidence: ${result.confidence} | ${result.sourceCount} sources_` },
          },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: '👍 Correct' }, action_id: 'qa_correct', value: String(result.qaId) },
              { type: 'button', text: { type: 'plain_text', text: '👎 Wrong' }, action_id: 'qa_incorrect', value: String(result.qaId) },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[ask] Failed:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Failed to search knowledge base. Please try again.',
      });
    }
```

Remove the now-unused imports for `semanticSearch` and `recordQA` from commands.ts (they're now in knowledge-bot.ts). Keep the `anthropic` import only if other commands use it.

- [ ] **Step 2: Add knowledge bot to DM handler**

In `bot/src/slack/dm-handler.ts`, add import:
```typescript
import { queryKnowledgeBot } from '../services/knowledge-bot';
```

Find the "Smart Fallback" section (where messages > 30 chars that don't match any command get sent to `extractCommitments`). BEFORE the commitment extraction fallback, add a knowledge query check:

```typescript
    // Knowledge bot: if message looks like a question, answer it
    if (text.includes('?') || /^(what|how|who|when|where|why|which|can|do|does|is|are|should|tell me|explain)\b/i.test(text)) {
      try {
        const result = await queryKnowledgeBot({
          question: text,
          askedBy: message.user,
          askedVia: 'slack',
        });
        await client.chat.postMessage({
          channel: message.channel,
          text: result.answer,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `${result.answer}\n\n_Confidence: ${result.confidence} | ${result.sourceCount} sources_` },
            },
            {
              type: 'actions',
              elements: [
                { type: 'button', text: { type: 'plain_text', text: '👍' }, action_id: 'qa_correct', value: String(result.qaId) },
                { type: 'button', text: { type: 'plain_text', text: '👎' }, action_id: 'qa_incorrect', value: String(result.qaId) },
              ],
            },
          ],
        });
        return true;
      } catch (err) {
        console.error('[dm] Knowledge bot failed:', err);
        // Fall through to existing behavior
      }
    }
```

- [ ] **Step 3: Add knowledge bot to @mention handler**

In `bot/src/slack/listeners.ts`, add import:
```typescript
import { queryKnowledgeBot } from '../services/knowledge-bot';
```

In the @mention handler, BEFORE the final commitment extraction fallback (the "else" block that calls `extractCommitments`), add a question detection check similar to the DM handler:

```typescript
      // Knowledge bot: if @mention looks like a question
      const mentionText = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
      if (mentionText.includes('?') || /^(what|how|who|when|where|why|which|can|do|does|is|are|should|tell me|explain)\b/i.test(mentionText)) {
        try {
          const result = await queryKnowledgeBot({
            question: mentionText,
            askedBy: event.user,
            askedVia: 'slack',
          });
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.thread_ts || event.ts,
            text: result.answer,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `${result.answer}\n\n_Confidence: ${result.confidence} | ${result.sourceCount} sources_` },
              },
              {
                type: 'actions',
                elements: [
                  { type: 'button', text: { type: 'plain_text', text: '👍' }, action_id: 'qa_correct', value: String(result.qaId) },
                  { type: 'button', text: { type: 'plain_text', text: '👎' }, action_id: 'qa_incorrect', value: String(result.qaId) },
                ],
              },
            ],
          });
          return; // Don't fall through to commitment extraction
        } catch (err) {
          console.error('[mention] Knowledge bot failed:', err);
        }
      }
```

- [ ] **Step 4: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add bot/src/slack/commands.ts bot/src/slack/dm-handler.ts bot/src/slack/listeners.ts
git commit -m "feat: wire knowledge bot into /ask, DMs, and @mentions — any question gets an answer"
```

---

## Task 3: Build Proactive Alerts Service

**Files:**
- Create: `bot/src/services/proactive-alerts.ts`
- Modify: `bot/src/scheduler/cron-jobs.ts`

- [ ] **Step 1: Create proactive-alerts.ts**

```typescript
import { db } from '../db/connection';
import { deals, people, companies, tasks, documents } from '../db/schema';
import { eq, and, lt, not, inArray } from 'drizzle-orm';
import { getKnowledgeGaps, getAccuracyStats } from './feedback-service';
import { getSOPCandidates } from './topic-tracker';

export interface ProactiveAlert {
  type: 'stale_deal' | 'knowledge_gap' | 'sop_candidate' | 'accuracy_drop' | 'overdue_surge';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Generate all proactive alerts for the current state.
 * Called by daily cron job.
 */
export function generateProactiveAlerts(): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - (7 * 24 * 60 * 60);

  // 1. Knowledge gaps — questions the bot couldn't answer
  const gaps = getKnowledgeGaps(5);
  if (gaps.length > 0) {
    const gapList = gaps.map(g => `• "${g.question}" (asked ${g.count}x)`).join('\n');
    alerts.push({
      type: 'knowledge_gap',
      title: 'Knowledge Gaps Detected',
      message: `The knowledge bot couldn't confidently answer these questions this week:\n${gapList}\n\nConsider adding documentation for these topics.`,
      priority: gaps.some(g => g.count >= 3) ? 'high' : 'medium',
    });
  }

  // 2. SOP candidates — topics ready for SOP generation
  const sopCandidates = getSOPCandidates();
  if (sopCandidates.length > 0) {
    const sopList = sopCandidates.map(c => `• "${c.topic}" (${c.occurrences} mentions)`).join('\n');
    alerts.push({
      type: 'sop_candidate',
      title: 'New SOP Candidates',
      message: `These topics have been discussed enough to generate SOPs:\n${sopList}\n\nUse \`/sop <topic>\` to generate, or wait for Wednesday auto-generation.`,
      priority: 'medium',
    });
  }

  // 3. Accuracy stats — is the bot getting worse?
  const accuracy = getAccuracyStats();
  if (accuracy.accuracyRate !== null && accuracy.accuracyRate < 70 && accuracy.total >= 10) {
    alerts.push({
      type: 'accuracy_drop',
      title: 'Knowledge Bot Accuracy Below 70%',
      message: `The knowledge bot's accuracy is ${accuracy.accuracyRate}% (${accuracy.correct}/${accuracy.correct + accuracy.incorrect} correct). Review recent corrections to improve the knowledge base.`,
      priority: 'high',
    });
  }

  // 4. Overdue task surge
  const overdueTasks = db.select().from(tasks)
    .where(and(
      not(eq(tasks.status, 'COMPLETED')),
      not(eq(tasks.status, 'DISMISSED')),
      lt(tasks.deadline, new Date()),
    ))
    .all();

  if (overdueTasks.length >= 10) {
    alerts.push({
      type: 'overdue_surge',
      title: `${overdueTasks.length} Overdue Tasks`,
      message: `There are ${overdueTasks.length} overdue tasks across the team. This is unusually high. Consider a task review session.`,
      priority: 'high',
    });
  }

  return alerts;
}

/**
 * Format alerts as a Slack message.
 */
export function formatAlertsForSlack(alerts: ProactiveAlert[]): string {
  if (alerts.length === 0) return '';

  const highPriority = alerts.filter(a => a.priority === 'high');
  const mediumPriority = alerts.filter(a => a.priority === 'medium');

  let message = '🔔 *Daily Intelligence Briefing*\n\n';

  if (highPriority.length > 0) {
    message += '🔴 *Needs Attention:*\n';
    for (const alert of highPriority) {
      message += `\n*${alert.title}*\n${alert.message}\n`;
    }
  }

  if (mediumPriority.length > 0) {
    message += '\n🟡 *Worth Knowing:*\n';
    for (const alert of mediumPriority) {
      message += `\n*${alert.title}*\n${alert.message}\n`;
    }
  }

  return message;
}
```

- [ ] **Step 2: Add daily proactive alerts cron**

In `bot/src/scheduler/cron-jobs.ts`, add imports:

```typescript
import { generateProactiveAlerts, formatAlertsForSlack } from '../services/proactive-alerts';
```

Add a daily cron job (8:30 AM CT, Mon-Fri — between the reminder and escalation runs):

```typescript
  // Daily 8:30 AM CT — Proactive intelligence alerts to leadership
  cron.schedule('30 8 * * 1-5', async () => {
    console.log('[cron] Running proactive alerts...');
    try {
      const alerts = generateProactiveAlerts();
      if (alerts.length === 0) {
        console.log('[cron] No proactive alerts today.');
        return;
      }
      const message = formatAlertsForSlack(alerts);
      // Send to leadership
      const leadershipIds = [config.slack.omerSlackUserId, config.slack.markSlackUserId, config.slack.ehsanSlackUserId].filter(Boolean);
      for (const userId of leadershipIds) {
        try {
          await client.chat.postMessage({ channel: userId, text: message });
        } catch (err) {
          console.error(`[cron] Failed to send proactive alert to ${userId}:`, err);
        }
      }
      console.log(`[cron] Sent ${alerts.length} proactive alerts to ${leadershipIds.length} leaders.`);
    } catch (err) {
      console.error('[cron] Proactive alerts failed:', err);
    }
  }, { timezone: 'America/Chicago' });
```

- [ ] **Step 3: Verify compilation**

Run: `cd bot && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add bot/src/services/proactive-alerts.ts bot/src/scheduler/cron-jobs.ts
git commit -m "feat: add proactive alerts — daily intelligence briefing with knowledge gaps, SOP candidates, accuracy stats"
```

---

## Task 4: Add KNOWLEDGE_QUERY Intent to Desktop Voice

**Files:**
- Modify: `desktop/src/main/ai/intent-classifier.ts`
- Modify: `desktop/src/shared/types.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/preload/preload.ts`
- Modify: `desktop/src/renderer/app.ts`
- Modify: `desktop/src/renderer/index.html`
- Modify: `desktop/src/renderer/styles.css`

- [ ] **Step 1: Add KNOWLEDGE_QUERY intent**

In `desktop/src/main/ai/intent-classifier.ts`:

Add `'KNOWLEDGE_QUERY'` to the Intent type union.

Add a knowledge pattern regex (before GENERAL fallback):
```typescript
const knowledgePatterns = /\b(what is|how do|who handles|what's our|tell me about|explain|where can i find|process for|pricing|policy)\b/i;
```

In the regex-first classification, add:
```typescript
if (knowledgePatterns.test(transcript)) return { intent: 'KNOWLEDGE_QUERY' };
```

Update the Claude fallback system prompt to include KNOWLEDGE_QUERY as a valid category: "asking about business knowledge, processes, people, pricing, policies, or company information."

- [ ] **Step 2: Add IPC channel for knowledge responses**

In `desktop/src/shared/types.ts`, add to the IPC channels:
```typescript
KNOWLEDGE_RESPONSE: 'knowledge:response',
```

- [ ] **Step 3: Route KNOWLEDGE_QUERY in IPC handler**

In `desktop/src/main/ipc-handlers.ts`, add the knowledge query handler.

Since the desktop app can't directly import the bot's knowledge-bot service (different project), we'll use the shared SQLite DB + a local Claude call. Add a simplified version:

```typescript
import { semanticSearch } from the bot's embedding service — BUT since we can't cross-import, use raw SQL on the shared DB instead.
```

Actually, the simplest approach: add a new IPC handler that does a lightweight knowledge query using the desktop's own SQLite connection + Claude:

```typescript
      } else if (intent === 'KNOWLEDGE_QUERY') {
        mainWindow.webContents.send(IPC.TRANSCRIPT, 'Searching knowledge base...');
        try {
          // Query knowledge entries from shared DB using raw SQL
          const entries = sqlite.prepare(
            'SELECT content, source_type, metadata FROM knowledge_entries WHERE embedding IS NOT NULL ORDER BY created_at DESC LIMIT 20'
          ).all() as Array<{ content: string; source_type: string; metadata: string }>;

          if (entries.length === 0) {
            mainWindow.webContents.send(IPC.KNOWLEDGE_RESPONSE, "I don't have enough information in the knowledge base yet.");
          } else {
            // Use Claude to find relevant entries and answer
            const Anthropic = require('@anthropic-ai/sdk');
            const ai = new Anthropic.default();
            const context = entries.map((e, i) => `[${i + 1}] (${e.source_type}) ${e.content.substring(0, 500)}`).join('\n\n');
            const response = await ai.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 512,
              system: 'You are a business knowledge assistant. Answer based ONLY on the provided context. Be concise — this is a voice response. Cite sources as [N].',
              messages: [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${transcript}` }],
            });
            const answer = response.content[0].type === 'text' ? response.content[0].text : 'Unable to answer.';
            mainWindow.webContents.send(IPC.KNOWLEDGE_RESPONSE, answer);
          }
        } catch (err: any) {
          mainWindow.webContents.send(IPC.ERROR, 'Knowledge query failed: ' + err.message);
        }
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
      }
```

Add the `sqlite` import at the top (from the existing desktop DB connection):
```typescript
import { sqlite } from './db/connection';
```

- [ ] **Step 4: Add preload + renderer support for knowledge response**

In `desktop/src/preload/preload.ts`, add:
```typescript
onKnowledgeResponse: (cb: (answer: string) => void) => {
  ipcRenderer.on(IPC.KNOWLEDGE_RESPONSE, (_e, answer) => cb(answer));
},
```

In `desktop/src/renderer/app.ts`, add DOM reference and listener:
```typescript
const knowledgePanel = document.getElementById('knowledge-panel')!;
const knowledgeText = document.getElementById('knowledge-text')!;

window.chiefOfStaff.onKnowledgeResponse((answer: string) => {
  knowledgeText.textContent = answer;
  knowledgePanel.classList.remove('hidden');
  setTimeout(() => {
    knowledgePanel.classList.add('hidden');
  }, 15000); // Show for 15 seconds
});
```

In `desktop/src/renderer/index.html`, add after the existing panels:
```html
<div id="knowledge-panel" class="knowledge-panel hidden">
  <div class="knowledge-header">Atlas Knowledge</div>
  <div id="knowledge-text" class="knowledge-content"></div>
</div>
```

In `desktop/src/renderer/styles.css`, add:
```css
.knowledge-panel {
  position: fixed;
  bottom: 60px;
  left: 20px;
  right: 20px;
  max-width: 500px;
  background: rgba(30, 20, 60, 0.95);
  border: 1px solid rgba(79, 53, 136, 0.6);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(20px);
  z-index: 100;
  color: #F3F1FC;
  font-size: 14px;
  line-height: 1.5;
  transition: opacity 0.3s, transform 0.3s;
}
.knowledge-panel.hidden {
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
}
.knowledge-header {
  font-weight: 600;
  color: #9B7ED8;
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.knowledge-content {
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}
```

- [ ] **Step 5: Verify compilation**

Run:
```bash
cd bot && npx tsc --noEmit
cd ../desktop && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/ai/intent-classifier.ts desktop/src/shared/types.ts desktop/src/main/ipc-handlers.ts desktop/src/preload/preload.ts desktop/src/renderer/app.ts desktop/src/renderer/index.html desktop/src/renderer/styles.css
git commit -m "feat: add KNOWLEDGE_QUERY intent to desktop voice — ask questions via voice, see answers in overlay panel"
```

---

## Task 5: Upgrade Voice Dictation Quality

**Files:**
- Modify: `desktop/src/main/voice/whisper-client.ts`

- [ ] **Step 1: Upgrade Whisper settings**

In `desktop/src/main/voice/whisper-client.ts`, upgrade the transcription call:

1. Add a `prompt` parameter to the Whisper API call. This helps Whisper recognize domain-specific terms:
```typescript
const WHISPER_PROMPT = 'Atlas Growth, Chief of Staff, landscaping, irrigation, maintenance contract, client onboarding, SOP, CRM, proposal, estimate, crew, site visit';
```

2. In the multipart form data builder, add the prompt field:
```typescript
formData += `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${WHISPER_PROMPT}\r\n`;
```

3. Add `temperature` parameter set to `0` for more deterministic transcription:
```typescript
formData += `--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0\r\n`;
```

4. Add `response_format` set to `verbose_json` to get word-level timestamps (useful for future features):
```typescript
formData += `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`;
```

5. Update the response parsing to handle verbose_json format:
```typescript
const json = JSON.parse(responseBody);
return json.text; // verbose_json still has a top-level 'text' field
```

These changes improve recognition of business terms without changing the model (whisper-1 is currently the only option from OpenAI, but the prompt and temperature settings significantly improve accuracy).

- [ ] **Step 2: Verify compilation**

Run: `cd desktop && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add desktop/src/main/voice/whisper-client.ts
git commit -m "feat: upgrade Whisper voice quality — domain-specific prompt, temperature 0, verbose_json format"
```

---

## Task 6: Integration Verification

- [ ] **Step 1: Verify both apps compile**

```bash
cd bot && npx tsc --noEmit
cd ../desktop && npx tsc --noEmit
```

- [ ] **Step 2: Verify new files exist**

```bash
ls -la bot/src/services/knowledge-bot.ts bot/src/services/proactive-alerts.ts
```

- [ ] **Step 3: Check for stray imports**

```bash
cd bot && grep -r "from.*commands" src/services/knowledge-bot.ts || echo "OK: no circular imports"
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: Phase 3 integration fixes" || echo "Nothing to fix"
```

---

## Verification Summary

| What | How to Test | Expected |
|------|-------------|----------|
| Knowledge bot service | `/ask <question>` in Slack | Answer with citations, confidence, feedback buttons |
| DM knowledge queries | DM bot with a question | Bot answers from knowledge base |
| @mention questions | `@bot what is our pricing?` | Bot answers in thread |
| Proactive alerts | Wait for 8:30 AM cron or trigger manually | Leadership gets daily intelligence briefing |
| Voice knowledge query | Say "What is our onboarding process?" via desktop | Knowledge panel shows answer in overlay |
| Voice quality upgrade | Dictate with business terms | Better recognition of "Atlas Growth", "SOP", etc. |
| SOP-aware answers | Ask about a process with active SOPs | Answer references the SOP content |

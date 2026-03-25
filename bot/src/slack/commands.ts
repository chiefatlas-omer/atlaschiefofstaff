import type { App } from '@slack/bolt';
import { getTasksByUser, completeTask, getTaskById, updateDeadline, getAllOpenTasks, reassignTask } from '../tasks/task-service';
import { taskListBlocks, adminTaskListBlocks } from './blocks';
import { config } from '../config';
import { generatePersonalDigest } from '../tasks/digest-service';
import { deduplicateTasks } from '../tasks/task-service';
import { ingestDocument } from '../services/ingestion-service';
import { createSOPForTopic, getSOPs } from '../services/sop-service';
import { getSOPCandidates, getTopTopics } from '../services/topic-tracker';
import { semanticSearch } from '../services/embedding-service';
import { recordQA } from '../services/feedback-service';
import { anthropic } from '../ai/client';

export function registerCommands(app: App) {
  // /tasks - show your open tasks
  app.command('/tasks', async ({ command, ack, respond }) => {
    await ack();

    const userId = command.user_id;
    const userTasks = getTasksByUser(userId);
    const blocks = taskListBlocks(userTasks);

    await respond({
      response_type: 'ephemeral',
      blocks,
      text: 'Your open tasks',
    });
  });

  // /alltasks - admin view of everyone's open tasks
  app.command('/alltasks', async ({ command, ack, respond }) => {
    await ack();

    // Check if user is an admin (leadership)
    const adminIds = [
      config.escalation.omerSlackUserId,
      config.escalation.markSlackUserId,
      config.escalation.ehsanSlackUserId,
    ].filter(Boolean);

    if (!adminIds.includes(command.user_id)) {
      await respond({
        response_type: 'ephemeral',
        text: ':lock: This command is only available to admins.',
      });
      return;
    }

    const allTasks = getAllOpenTasks();
    const blocks = adminTaskListBlocks(allTasks);

    await respond({
      response_type: 'ephemeral',
      blocks,
      text: 'All open tasks',
    });
  });

  // /complete <task-id> - mark a task done
  app.command('/complete', async ({ command, ack, respond, client }) => {
    await ack();

    const taskId = command.text.trim();
    if (!taskId) {
      await respond({
        response_type: 'ephemeral',
        text: 'Usage: /complete <task-id> (e.g., /complete tsk_a7x3q)',
      });
      return;
    }

    const task = getTaskById(taskId);
    if (!task) {
      await respond({
        response_type: 'ephemeral',
        text: 'Task not found: ' + taskId,
      });
      return;
    }

    completeTask(taskId);

    await respond({
      response_type: 'ephemeral',
      text: ':white_check_mark: Done! Marked *' + task.description + '* as complete.',
    });

    // Also update the original thread message if possible
    if (task.botReplyTs && task.sourceChannelId) {
      try {
        await client.chat.update({
          channel: task.sourceChannelId,
          ts: task.botReplyTs,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':white_check_mark: *Done!* ' + task.description + ' -- marked complete.',
              },
            },
          ],
          text: 'Task completed: ' + task.description,
        });
      } catch {
        // Original message may have been deleted
      }
    }
  });

  // /digest - on-demand digest
  app.command('/digest', async ({ command, ack, respond, client }) => {
    await ack();
    await respond({
      response_type: 'ephemeral',
      text: ':hourglass_flowing_sand: Generating your digest...',
    });
    await generatePersonalDigest(client, command.user_id);
  });

  // /ping - health check
  app.command('/ping', async ({ command, ack, respond }) => {
    await ack();
    await respond({
      response_type: 'ephemeral',
      text: ':robot_face: Atlas Chief of Staff is online and watching.',
    });
  });


  // /push <task-id> <new-deadline> - push a task's deadline
  app.command('/push', async ({ command, ack, respond }) => {
    await ack();

    const parts = command.text.trim().split(/\s+/);
    const taskId = parts[0];
    const newDeadline = parts.slice(1).join(' ');

    if (!taskId || !newDeadline) {
      await respond({
        response_type: 'ephemeral',
        text: 'Usage: /push <task-id> <new deadline> -- Examples: /push tsk_a7x3q tomorrow, /push tsk_a7x3q Friday, /push tsk_a7x3q next Monday',
      });
      return;
    }

    const task = getTaskById(taskId);
    if (!task) {
      await respond({
        response_type: 'ephemeral',
        text: 'Task not found: ' + taskId,
      });
      return;
    }

    updateDeadline(taskId, newDeadline);
    const updated = getTaskById(taskId);
    const newDate = updated && updated.deadline
      ? new Date(updated.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : newDeadline;

    await respond({
      response_type: 'ephemeral',
      text: ':calendar: Pushed *' + task.description + '* to ' + newDate + '.',
    });
  });

  // /reassign <task-id> @user - reassign a task to another person
  app.command('/reassign', async ({ command, ack, respond, client }) => {
    await ack();

    const parts = command.text.trim().split(/\s+/);
    const taskId = parts[0];
    const userMention = parts[1];

    if (!taskId || !userMention) {
      await respond({
        response_type: 'ephemeral',
        text: 'Usage: /reassign <task-id> @person -- Example: /reassign tsk_abc123 @Omer',
      });
      return;
    }

    // Resolve user ID from mention - supports <@U123|name>, <@U123>, "me", or plain @Name
    let newUserId: string | undefined;

    // 1. Try standard Slack mention format <@U123|name> or <@U123>
    const userMatch = userMention.match(/<@([A-Z0-9]+)(?:\|[^>]*)?>/i);
    if (userMatch) {
      newUserId = userMatch[1];
    }

    // 2. If "me", reassign to the invoking user
    if (!newUserId && userMention.toLowerCase() === 'me') {
      newUserId = command.user_id;
    }

    // 3. Strip leading @ and search by display name / real name
    if (!newUserId) {
      const searchName = userMention.replace(/^@/, '').toLowerCase();
      try {
        const listRes = await client.users.list({});
        const match = listRes.members?.find((m) => {
          if (m.deleted || m.is_bot) return false;
          const displayName = (m.profile?.display_name || '').toLowerCase();
          const realName = (m.real_name || '').toLowerCase();
          const userName = (m.name || '').toLowerCase();
          return displayName === searchName || realName === searchName || userName === searchName;
        });
        if (match?.id) {
          newUserId = match.id;
        }
      } catch (err) {
        console.error('Failed to look up user by name:', err);
      }
    }

    if (!newUserId) {
      await respond({
        response_type: 'ephemeral',
        text: 'Could not find a user matching "' + userMention + '". Try @mentioning them, using their display name, or "me" to reassign to yourself.',
      });
      return;
    }

    const task = getTaskById(taskId);
    if (!task) {
      await respond({
        response_type: 'ephemeral',
        text: 'Task not found: ' + taskId,
      });
      return;
    }

    // Look up new user's name
    let newUserName: string | undefined;
    try {
      const userInfo = await client.users.info({ user: newUserId });
      newUserName = userInfo.user?.real_name || userInfo.user?.name;
    } catch {}

    reassignTask(taskId, newUserId, newUserName);

    await respond({
      response_type: 'ephemeral',
      text: ':arrows_counterclockwise: Reassigned *' + task.description + '* to <@' + newUserId + '>.',
    });

    // DM the new owner about the reassigned task
    try {
      const deadlineStr = task.deadline
        ? new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : 'no deadline set';
      await client.chat.postMessage({
        channel: newUserId,
        text: ':clipboard: <@' + command.user_id + '> reassigned a task to you: *' + task.description + '*, due ' + deadlineStr + '.',
      });
    } catch (err) {
      console.error('Failed to DM new task owner:', err);
    }
  });

  // /cleanup - admin: deduplicate tasks
  app.command('/cleanup', async ({ command, ack, respond }) => {
    await ack();

    const adminIds = [
      config.escalation.omerSlackUserId,
      config.escalation.markSlackUserId,
      config.escalation.ehsanSlackUserId,
    ].filter(Boolean);

    if (!adminIds.includes(command.user_id)) {
      await respond({
        response_type: 'ephemeral',
        text: ':lock: This command is only available to admins.',
      });
      return;
    }

    const dismissed = deduplicateTasks();
    await respond({
      response_type: 'ephemeral',
      text: dismissed > 0
        ? ':broom: Cleaned up ' + dismissed + ' duplicate task' + (dismissed > 1 ? 's' : '') + '. Run /alltasks to see the result.'
        : ':sparkles: No duplicates found -- everything looks clean!',
    });
  });

  // /sop - manage Standard Operating Procedures
  app.command('/sop', async ({ command, ack, client }) => {
    await ack();
    const text = command.text.trim();
    const subcommand = text.toLowerCase();

    // /sop or /sop list — list all SOPs
    if (!text || subcommand === 'list') {
      const sops = getSOPs();
      if (sops.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: 'No SOPs found. Use `/sop <topic>` to generate one.',
        });
        return;
      }
      const lines = sops.map((s) => `• *${s.title}* (${s.status ?? 'draft'}) — \`${s.id}\``);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*SOPs (${sops.length}):*\n${lines.join('\n')}`,
      });
      return;
    }

    // /sop candidates — topics that have hit the threshold but no SOP yet
    if (subcommand === 'candidates') {
      const candidates = getSOPCandidates();
      if (candidates.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: 'No SOP candidates yet. Topics need to appear 5+ times to qualify.',
        });
        return;
      }
      const lines = candidates.map((c) => `• *${c.topic}* (${c.occurrences} occurrences)`);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*SOP Candidates (${candidates.length}):*\n${lines.join('\n')}\n\nUse \`/sop <topic>\` to generate a SOP for any of these.`,
      });
      return;
    }

    // /sop topics — all tracked topics ranked by occurrence
    if (subcommand === 'topics') {
      const topics = getTopTopics(20);
      if (topics.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: 'No topics tracked yet.',
        });
        return;
      }
      const lines = topics.map((t) => {
        const sopTag = t.sopGenerated ? ' ✓ SOP' : '';
        return `• *${t.topic}* — ${t.occurrences} occurrences${sopTag}`;
      });
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `*Tracked Topics (top 20):*\n${lines.join('\n')}`,
      });
      return;
    }

    // /sop <topic> — generate a SOP for the given topic
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `:hourglass_flowing_sand: Generating SOP for *${text}*... this may take a moment.`,
    });

    try {
      const result = await createSOPForTopic(text, { createdBy: command.user_id });
      if (!result) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: `:warning: Could not generate SOP for *${text}*. Not enough knowledge base content on this topic yet.`,
        });
        return;
      }

      await client.chat.postMessage({
        channel: command.channel_id,
        text: `New SOP generated: ${result.title}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:page_facing_up: *New SOP Draft: ${result.title}*\n\n${result.summary}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Format: *${result.format}* | Doc ID: \`${result.docId}\``,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Publish' },
                style: 'primary',
                action_id: 'sop_publish',
                value: result.docId,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Dismiss' },
                style: 'danger',
                action_id: 'sop_dismiss',
                value: result.docId,
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[/sop] SOP generation error:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: ':x: Failed to generate SOP. Please try again.',
      });
    }
  });

  // /ask <question> — semantic search + Claude synthesis
  app.command('/ask', async ({ command, ack, client }) => {
    await ack();
    const question = command.text.trim();

    if (!question) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Usage: `/ask <question>` — e.g. `/ask What is our refund policy?`',
      });
      return;
    }

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: ':mag: Searching knowledge base...',
    });

    let results;
    try {
      results = await semanticSearch(question, 8);
    } catch (err) {
      console.error('[/ask] Semantic search error:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: ':x: Search failed. Please try again.',
      });
      return;
    }

    if (results.length === 0) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: ":shrug: I don't have any relevant information on that topic yet.",
      });
      return;
    }

    // Build context from search results
    const contextBlocks = results.map((r, i) => `[Source ${i + 1}] (${r.sourceType}): ${r.content}`).join('\n\n');

    let answer: string;
    let confidence: string;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Context:\n${contextBlocks}\n\nQuestion: ${question}`,
          },
        ],
        system:
          'Answer based ONLY on provided context. Cite sources as [Source N]. If the context does not contain enough information to answer, say so clearly. Be concise.',
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      answer = textBlock?.type === 'text' ? textBlock.text : 'Unable to generate answer.';

      // Rough confidence based on top similarity score
      const topSim = results[0].similarity ?? 0;
      confidence = topSim >= 0.8 ? 'high' : topSim >= 0.6 ? 'medium' : 'low';
    } catch (err) {
      console.error('[/ask] Claude synthesis error:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: ':x: Failed to synthesize answer. Please try again.',
      });
      return;
    }

    // Record the Q&A for feedback tracking
    const qaId = recordQA({
      question,
      answer,
      confidence,
      sourceEntryIds: results.map((r) => r.id),
      askedBy: command.user_id,
      askedVia: 'slack_command',
    });

    await client.chat.postMessage({
      channel: command.channel_id,
      text: answer,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Q: ${question}*\n\n${answer}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Confidence: *${confidence}* | Sources: ${results.length} | Asked by <@${command.user_id}>`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '👍 Correct' },
              style: 'primary',
              action_id: 'qa_correct',
              value: String(qaId),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '👎 Wrong' },
              style: 'danger',
              action_id: 'qa_incorrect',
              value: String(qaId),
            },
          ],
        },
      ],
    });
  });

  // /upload - ingest a document into the knowledge graph
  app.command('/upload', async ({ command, ack, client }) => {
    await ack();
    const text = command.text.trim();

    if (!text) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Usage: `/upload Title | type | Content...`\nTypes: sop, playbook, pricing_guide, process_doc, customer_info, general',
      });
      return;
    }

    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Please use format: `/upload Title | type | Content...`',
      });
      return;
    }

    const [title, type, ...contentParts] = parts;
    const content = contentParts.join('|');
    const validTypes = ['sop', 'playbook', 'pricing_guide', 'process_doc', 'customer_info', 'general'];

    if (!validTypes.includes(type)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `Invalid type "${type}". Valid types: ${validTypes.join(', ')}`,
      });
      return;
    }

    try {
      const result = await ingestDocument({ title, content, type, uploadedBy: command.user_id });
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `Document "${title}" ingested. ${result.chunkCount} chunks embedded. ${result.entities.people.length} people, ${result.entities.companies.length} companies detected.`,
      });
    } catch (err) {
      console.error('[upload] Document ingestion failed:', err);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Failed to ingest document. Please try again.',
      });
    }
  });

}

import type { App } from '@slack/bolt';
import { registerMessageHandler } from './messages';
import { registerInteractionHandlers } from './interactions';
import { registerCommands } from './commands';
import { queryKnowledgeBot } from '../services/knowledge-bot';

export function registerAllListeners(app: App) {
  registerMessageHandler(app);
  registerInteractionHandlers(app);
  registerCommands(app);

  // Handle @mention for conversational queries
  app.event('app_mention', async ({ event, client }) => {
    console.log('app_mention received:', { text: (event.text || '').substring(0, 100), thread_ts: (event as any).thread_ts, channel: event.channel, user: event.user });
    const text = (event.text || '').toLowerCase();

    if (text.includes('help')) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: [
          '*Atlas Chief of Staff -- Commands:*',
          '\u2022 `/tasks` -- See your open tasks',
          '\u2022 `/complete <task-id>` -- Mark a task done',
          '\u2022 `/digest` -- Get an on-demand weekly digest',
          '\u2022 `/ping` -- Check if I\'m online',
          '',
          'I also passively monitor this channel for commitments and will track them automatically.',
        ].join('\n'),
      });
    } else if (text.includes('what') && (text.includes('plate') || text.includes('open') || text.includes('tasks'))) {
      const { getTasksByUser } = require('../tasks/task-service');
      const { taskListBlocks } = require('./blocks');
      const userTasks = getTasksByUser(event.user);
      const blocks = taskListBlocks(userTasks);
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        blocks,
        text: 'Your open tasks',
      });
    } else if (text.includes('overdue')) {
      const { getOverdueTasks } = require('../tasks/task-service');
      const overdue = getOverdueTasks();
      if (overdue.length === 0) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: 'No overdue tasks right now. :tada:',
        });
      } else {
        const lines = overdue.map((t: any) =>
          '\u2022 *' + t.description + '* -- <@' + t.slackUserId + '>'
        );
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: '*Overdue tasks (' + overdue.length + '):*\n' + lines.join('\n'),
        });
      }
    } else if (/\b(complete|done|finished?|mark.*done|mark.*complete)\b/.test(text) && event.thread_ts) {
      // Thread-based task completion: user replies "@Atlas Chief done" or "mark complete" in a task thread
      const { getTaskById, completeTask } = require('../tasks/task-service');
      const { db } = require('../db/connection');
      const { tasks } = require('../db/schema');
      const { eq } = require('drizzle-orm');
      // Find task linked to this thread (by source_message_ts or bot_reply_ts)
      const threadTs = event.thread_ts;
      const task = db.select().from(tasks)
        .where(eq(tasks.sourceMessageTs, threadTs))
        .get()
        || db.select().from(tasks)
          .where(eq(tasks.botReplyTs, threadTs))
          .get();
      if (task && task.status !== 'COMPLETED') {
        completeTask(task.id);
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: ':white_check_mark: Done! Marked *' + task.description + '* as complete.',
        });
      } else if (task) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: 'That task is already complete! :white_check_mark:',
        });
      } else {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: "I couldn't find a task linked to this thread. Try `/complete tsk_xxx` with the task ID.",
        });
      }
    } else if (/\b(not a task|dismiss|remove this task|not really a task)\b/.test(text) && event.thread_ts) {
      // Thread-based task dismissal
      const { dismissTask } = require('../tasks/task-service');
      const { db } = require('../db/connection');
      const { tasks } = require('../db/schema');
      const { eq } = require('drizzle-orm');
      const threadTs = event.thread_ts;
      const task = db.select().from(tasks)
        .where(eq(tasks.sourceMessageTs, threadTs))
        .get()
        || db.select().from(tasks)
          .where(eq(tasks.botReplyTs, threadTs))
          .get();
      if (task && task.status !== 'DISMISSED') {
        dismissTask(task.id);
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: ':wastebasket: Dismissed *' + task.description + '*. Removed from tracking.',
        });
      } else if (task) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: "That task was already dismissed.",
        });
      } else {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: "I couldn't find a task linked to this thread.",
        });
      }
    } else if (/\b(assign.*to|reassign.*to)\b/.test(text) && event.thread_ts) {
      // Thread-based reassignment: "@Atlas Chief assign to @Heather"
      const { reassignTask } = require('../tasks/task-service');
      const { db } = require('../db/connection');
      const { tasks } = require('../db/schema');
      const { eq } = require('drizzle-orm');
      const threadTs = event.thread_ts;
      const task = db.select().from(tasks)
        .where(eq(tasks.sourceMessageTs, threadTs))
        .get()
        || db.select().from(tasks)
          .where(eq(tasks.botReplyTs, threadTs))
          .get();
      if (!task) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: "I couldn't find a task linked to this thread. Try `/reassign tsk_xxx @person`.",
        });
      } else {
        // Extract user mentions from the text, excluding the bot
        const mentionMatch = (event.text || '').match(/<@([A-Z0-9]+)(?:\|[^>]*)?>/gi);
        // Get the bot's user ID from the app_mention event (the mention target)
        const botMentionId = (event.text || '').match(/<@([A-Z0-9]+)/)?.[1];
        const userMentions = (mentionMatch || [])
          .map((m: string) => m.match(/<@([A-Z0-9]+)/i)?.[1])
          .filter((id: string | undefined) => id && id !== botMentionId); // exclude the bot mention

        if (userMentions.length === 0) {
          // Try plain text name lookup
          const nameMatch = (event.text || '').match(/(?:assign|reassign)\s+(?:to|this to)\s+@?(\w+)/i);
          if (nameMatch) {
            try {
              const listRes = await client.users.list({});
              const match = listRes.members?.find((m: any) => {
                if (m.deleted || m.is_bot) return false;
                const searchName = nameMatch[1].toLowerCase();
                return (m.profile?.display_name || '').toLowerCase() === searchName
                  || (m.real_name || '').toLowerCase() === searchName
                  || (m.name || '').toLowerCase() === searchName;
              });
              if (match?.id) {
                const userName = match.real_name || match.name;
                reassignTask(task.id, match.id, userName);
                await client.chat.postMessage({
                  channel: event.channel,
                  thread_ts: event.ts,
                  text: ':arrows_counterclockwise: Reassigned *' + task.description + '* to <@' + match.id + '>.',
                });
              } else {
                await client.chat.postMessage({
                  channel: event.channel,
                  thread_ts: event.ts,
                  text: "Couldn't find a user named \"" + nameMatch[1] + "\". Try @mentioning them directly.",
                });
              }
            } catch (err) {
              console.error('User lookup failed:', err);
            }
          } else {
            await client.chat.postMessage({
              channel: event.channel,
              thread_ts: event.ts,
              text: 'Please specify who to assign to. Example: `@Atlas Chief assign to @Heather`',
            });
          }
        } else {
          const newUserId = userMentions[0] as string;
          let userName: string | undefined;
          try {
            const userInfo = await client.users.info({ user: newUserId });
            userName = userInfo.user?.real_name || userInfo.user?.name;
          } catch {}
          reassignTask(task.id, newUserId, userName);
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: ':arrows_counterclockwise: Reassigned *' + task.description + '* to <@' + newUserId + '>.',
          });
        }
      }
    } else {
      // Strip @mention from text to get clean question/statement
      const strippedText = (event.text || '').replace(/<@[A-Z0-9]+>/gi, '').trim();

      // Check if this looks like a question — route to knowledge bot first
      const QUESTION_STARTERS = /^(what|who|where|when|why|how|which|is|are|do|does|did|can|could|should|would|will|has|have|tell me)/i;
      const looksLikeQuestion = strippedText.includes('?') || QUESTION_STARTERS.test(strippedText);

      if (looksLikeQuestion && strippedText.length > 5) {
        try {
          const result = await queryKnowledgeBot({
            question: strippedText,
            askedBy: event.user,
            askedVia: 'slack_mention',
          });
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: result.answer,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: result.answer },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `Confidence: *${result.confidence}* | Sources: ${result.sourceCount}`,
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
                    value: String(result.qaId),
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '👎 Wrong' },
                    style: 'danger',
                    action_id: 'qa_incorrect',
                    value: String(result.qaId),
                  },
                ],
              },
            ],
          });
        } catch (err) {
          console.error('[listeners] Knowledge bot error on @mention:', err);
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: ':x: Failed to search the knowledge base. Please try again.',
          });
        }
        return;
      }

      // Try to extract a task from the @mention message
      const { extractCommitments } = require('../ai/commitment-extractor');
      const { createTask, updateBotReplyTs } = require('../tasks/task-service');
      const { taskConfirmationBlocks } = require('./blocks');

      try {
        const commitments = await extractCommitments([{
          user: event.user,
          text: event.text || '',
          ts: event.ts,
          channel: event.channel,
        }]);

        if (commitments.length > 0) {
          for (const commitment of commitments) {
            let userName: string | undefined;
            try {
              const userInfo = await client.users.info({ user: commitment.who });
              userName = userInfo.user?.real_name || userInfo.user?.name;
            } catch {}

            const task = createTask({
              slackUserId: commitment.who,
              slackUserName: userName,
              description: commitment.what,
              sourceChannelId: event.channel,
              sourceMessageTs: event.ts,
              confidence: commitment.confidence,
              deadlineText: commitment.deadline_text,
              source: 'slack',
            });

            if (!task) continue; // duplicate

            const blocks = taskConfirmationBlocks(
              task.id,
              commitment.who,
              commitment.what,
              commitment.deadline_text,
              commitment.confidence,
              task.deadline,
            );

            const reply = await client.chat.postMessage({
              channel: event.channel,
              thread_ts: event.ts,
              blocks,
              text: 'Task tracked: ' + commitment.what,
            });

            if (reply.ts) {
              updateBotReplyTs(task.id, reply.ts);
            }
          }
        } else {
          // No task found, show help
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: 'Hey! I\'m your Chief of Staff bot. Try "@atlaschief help" to see what I can do, or tag me with a task like "@atlaschief track that Mason will follow up on the leads".',
          });
        }
      } catch (err) {
        console.error('Error processing @mention task:', err);
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: 'Hey! I\'m your Chief of Staff bot. Try "@atlaschief help" to see what I can do.',
        });
      }
    }
  });

  // Handle reaction_added for task completion via checkmark emoji
  app.event('reaction_added', async ({ event, client }) => {
    const reaction = event.reaction;
    if (reaction !== 'white_check_mark' && reaction !== 'heavy_check_mark' && reaction !== 'ballot_box_with_check') {
      return;
    }

    if (!event.item || event.item.type !== 'message') return;

    const { db } = require('../db/connection');
    const { tasks } = require('../db/schema');
    const { eq } = require('drizzle-orm');
    const { completeTask } = require('../tasks/task-service');

    const task = db.select().from(tasks)
      .where(eq(tasks.botReplyTs, event.item.ts))
      .get();

    if (task && task.status !== 'COMPLETED' && task.status !== 'DISMISSED') {
      completeTask(task.id);

      await client.chat.postMessage({
        channel: event.item.channel,
        thread_ts: event.item.ts,
        text: ':white_check_mark: *' + task.description + '* marked complete!',
      });
    }
  });

  console.log('All Slack listeners registered.');
}

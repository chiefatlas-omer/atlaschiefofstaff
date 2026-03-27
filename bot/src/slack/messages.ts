import type { App } from '@slack/bolt';
import { extractCommitments, ExtractedCommitment } from '../ai/commitment-extractor';
import { createTask, updateBotReplyTs } from '../tasks/task-service';
import { taskConfirmationBlocks } from './blocks';
import { handleDirectMessage } from './dm-handler';
import { config } from '../config';
import { db } from '../db/connection';
import { processedMessages } from '../db/schema';
import { eq } from 'drizzle-orm';
import { completeTask, dismissTask, reassignTask, getTaskById } from '../tasks/task-service';
import { tasks } from '../db/schema';


interface BufferedMessage {
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
}

// Cache for user ID -> display name lookups
const userNameCache = new Map<string, string>();

async function resolveUserMentions(text: string, client: any): Promise<string> {
  const mentionPattern = /<@([A-Z0-9]+)(?:\|([^>]*))?>/gi;
  const matches = [...text.matchAll(mentionPattern)];
  if (matches.length === 0) return text;

  let resolved = text;
  for (const match of matches) {
    const userId = match[1];
    const displayName = match[2]; // Slack sometimes includes |name

    if (displayName) {
      resolved = resolved.replace(match[0], '@' + displayName);
      continue;
    }

    // Check cache first
    if (userNameCache.has(userId)) {
      resolved = resolved.replace(match[0], '@' + userNameCache.get(userId)!);
      continue;
    }

    // Look up the user
    try {
      const info = await client.users.info({ user: userId });
      const name = info.user?.real_name || info.user?.name || userId;
      userNameCache.set(userId, name);
      resolved = resolved.replace(match[0], '@' + name);
    } catch {
      resolved = resolved.replace(match[0], '@' + userId);
    }
  }
  return resolved;
}

const messageBuffer: Map<string, BufferedMessage[]> = new Map();
const BATCH_WINDOW_MS = 5000;
const MIN_MESSAGE_LENGTH = 20;

// Channels where we should NOT create tasks (digest-only channels)
const SKIP_TASK_CHANNELS = new Set(
  [config.channels.teamA, config.channels.teamB].filter(Boolean)
);

/**
 * Handle replies to bot messages as commands.
 * When someone replies in a thread to a message the bot posted,
 * parse the reply as a task management command instead of extracting commitments.
 * Returns true if the reply was handled as a command.
 */
async function handleBotReply(
  message: any,
  client: any,
  botUserId: string | undefined,
): Promise<boolean> {
  // Only handle thread replies
  const threadTs = message.thread_ts;
  if (!threadTs) return false;

  const text = (message.text || '').trim();
  const lowerText = text.toLowerCase();
  const userId = message.user;
  const channel = message.channel;

  // Fetch the parent message to check if it was posted by the bot
  try {
    const parentResult = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 1,
      inclusive: true,
    });
    const parentMsg = parentResult.messages?.[0];
    if (!parentMsg) return false;

    // Check if parent was posted by the bot (has bot_id or matches our bot user)
    const isFromBot = parentMsg.bot_id || (botUserId && parentMsg.user === botUserId);
    if (!isFromBot) return false;

    console.log('Bot reply detected:', { text: text.substring(0, 200), thread_ts: threadTs, user: userId });

    // Extract full text from parent message — check both plain text AND blocks
    let parentText = parentMsg.text || '';
    if (parentMsg.blocks && Array.isArray(parentMsg.blocks)) {
      const blockTexts = parentMsg.blocks
        .filter((b: any) => b.type === 'section' && b.text?.text)
        .map((b: any) => b.text.text);
      if (blockTexts.length > 0) {
        parentText = blockTexts.join('\n');
      }
    }
    console.log('Parent text (first 500):', parentText.substring(0, 500));

    // --- Parse numbered action items from the parent message ---
    // Matches patterns like "(1) Person — Action" from Zoom meeting summaries
    // Handles both plain text and mrkdwn bold formatting
    const actionItems: Array<{ num: number; owner: string; action: string }> = [];
    const parentLines = parentText.split('\n');
    for (const line of parentLines) {
      const itemMatch = line.match(/^\((\d+)\)\s+\*?([^—–\-*]+?)\*?\s*[—–\-]\s*(.+)/);
      if (itemMatch) {
        actionItems.push({
          num: parseInt(itemMatch[1], 10),
          owner: itemMatch[2].trim().replace(/\*/g, ''),
          action: itemMatch[3].trim(),
        });
      }
    }
    console.log('Parsed action items:', actionItems.length);

    // --- Also check if the parent is linked to a specific task ---
    const linkedTask = db.select().from(tasks)
      .where(eq(tasks.botReplyTs, threadTs))
      .get()
      || db.select().from(tasks)
        .where(eq(tasks.sourceMessageTs, threadTs))
        .get();

    // --- COMPLETE command: "complete", "done", "mark complete", "complete 1 and 3" ---
    if (/\b(complet(?:e|ed)?|done|finished?|mark.*(?:done|complet))\b/i.test(lowerText)) {
      if (linkedTask) {
        // Single task thread — complete it
        if (linkedTask.status !== 'COMPLETED') {
          completeTask(linkedTask.id);
          await client.chat.postMessage({
            channel, thread_ts: threadTs,
            text: ':white_check_mark: Done! Marked *' + linkedTask.description + '* as complete.',
          });
        } else {
          await client.chat.postMessage({
            channel, thread_ts: threadTs,
            text: 'That task is already complete! :white_check_mark:',
          });
        }
        return true;
      }
      // No specific handling for numbered items in complete context for now
    }

    // --- DISMISS command: "not a task", "dismiss", "remove" ---
    if (/\b(not (?:a )?task|dismiss|remove)\b/i.test(lowerText)) {
      if (linkedTask) {
        if (linkedTask.status !== 'DISMISSED') {
          dismissTask(linkedTask.id);
          await client.chat.postMessage({
            channel, thread_ts: threadTs,
            text: ':wastebasket: Dismissed *' + linkedTask.description + '*.',
          });
        }
        return true;
      }
    }

    // --- ASSIGN command: handles single or multi-line assign commands ---
    // Supports: "assign 5 to carlos", "assign 4, 6, 9 to carlos", or multi-line:
    //   assign 5 to carlos
    //   assign 8 to rodrigo
    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const assignLines = lines.filter((l: string) => /^assign\s/i.test(l));

    if (assignLines.length > 0 && actionItems.length > 0) {
      // Cache user lookups to avoid redundant API calls
      const userCache = new Map<string, { id: string; name: string }>();

      async function resolveUser(nameOrMention: string): Promise<{ id: string; name: string } | null> {
        // Check @mention format
        const mentionMatch = nameOrMention.match(/<@([A-Z0-9]+)(?:\|([^>]*))?>/i);
        if (mentionMatch) {
          const uid = mentionMatch[1];
          if (userCache.has(uid)) return userCache.get(uid)!;
          let uname = mentionMatch[2] || undefined;
          if (!uname) { try { const info = await client.users.info({ user: uid }); uname = info.user?.real_name || info.user?.name; } catch {} }
          const result = { id: uid, name: uname || uid };
          userCache.set(uid, result);
          return result;
        }
        // Check "me"
        if (nameOrMention.toLowerCase() === 'me') {
          if (userCache.has(userId)) return userCache.get(userId)!;
          let uname: string | undefined;
          try { const info = await client.users.info({ user: userId }); uname = info.user?.real_name || info.user?.name; } catch {}
          const result = { id: userId, name: uname || 'you' };
          userCache.set(userId, result);
          return result;
        }
        // Look up by name
        const searchName = nameOrMention.replace(/^@/, '').toLowerCase();
        if (userCache.has(searchName)) return userCache.get(searchName)!;
        try {
          const listRes = await client.users.list({});
          const match = listRes.members?.find((m: any) => {
            if (m.deleted || m.is_bot) return false;
            return (m.profile?.display_name || '').toLowerCase() === searchName
              || (m.real_name || '').toLowerCase() === searchName
              || (m.name || '').toLowerCase() === searchName
              || (m.profile?.display_name || '').toLowerCase().startsWith(searchName)
              || (m.real_name || '').toLowerCase().startsWith(searchName);
          });
          if (match?.id) {
            const result = { id: match.id, name: match.real_name || match.name || searchName };
            userCache.set(searchName, result);
            return result;
          }
        } catch {}
        return null;
      }

      const assignedByUser = new Map<string, string[]>();
      const errors: string[] = [];

      for (const line of assignLines) {
        // Match: "assign 5 to carlos" or "assign 4, 6 to carlos" or "assign to carlos"
        const m = line.match(/^assign\s+(?:(?:#?\s*)?(\d[\d\s,and]*)\s+to\s+)?(?:to\s+)?(.+)/i);
        if (!m) continue;
        const numsStr = m[1] || '';
        const personStr = m[2]?.trim();
        if (!personStr) continue;

        const user = await resolveUser(personStr);
        if (!user) {
          errors.push("Couldn't find user: " + personStr);
          continue;
        }

        // Parse task numbers
        const nums = numsStr ? (numsStr.match(/\d+/g) || []).map((n: string) => parseInt(n, 10)) : [];
        if (nums.length === 0 && linkedTask) {
          // Single task context — reassign linked task
          reassignTask(linkedTask.id, user.id, user.name);
          if (!assignedByUser.has(user.id)) assignedByUser.set(user.id, []);
          assignedByUser.get(user.id)!.push(linkedTask.description);
          continue;
        }

        for (const num of nums) {
          const item = actionItems.find(a => a.num === num);
          if (!item) continue;
          const task = createTask({
            slackUserId: user.id,
            slackUserName: user.name,
            description: item.action,
            sourceChannelId: channel,
            sourceMessageTs: threadTs,
            confidence: 'high',
            deadlineText: null,
            source: 'zoom',
          });
          if (task) {
            if (!assignedByUser.has(user.id)) assignedByUser.set(user.id, []);
            assignedByUser.get(user.id)!.push('(' + num + ') ' + item.action);
          }
        }
      }

      // Build response
      const parts: string[] = [];
      for (const [uid, items] of assignedByUser) {
        parts.push(':white_check_mark: Assigned ' + items.length + ' task' + (items.length > 1 ? 's' : '') + ' to <@' + uid + '>:\n' + items.join('\n'));
      }
      if (errors.length > 0) parts.push(':warning: ' + errors.join(', '));
      if (parts.length === 0) parts.push("No tasks were assigned. Check the task numbers and try again.");

      await client.chat.postMessage({
        channel, thread_ts: threadTs,
        text: parts.join('\n\n'),
      });
      return true;
    }

    // Single "assign to X" without numbers and without multi-line
    const singleAssign = lowerText.match(/assign\s+(?:to\s+)?@?(.+)/i);
    if (singleAssign && linkedTask) {
      const personStr = singleAssign[1]?.trim();
      if (personStr) {
        let targetUserId: string | undefined;
        let targetUserName: string | undefined;
        const mentionInText = text.match(/<@([A-Z0-9]+)(?:\|([^>]*))?>/i);
        if (mentionInText) {
          targetUserId = mentionInText[1];
          try { const info = await client.users.info({ user: targetUserId }); targetUserName = info.user?.real_name || info.user?.name; } catch {}
        } else {
          const searchName = personStr.replace(/^@/, '').toLowerCase();
          try {
            const listRes = await client.users.list({});
            const match = listRes.members?.find((m: any) => {
              if (m.deleted || m.is_bot) return false;
              return (m.profile?.display_name || '').toLowerCase() === searchName
                || (m.real_name || '').toLowerCase() === searchName
                || (m.name || '').toLowerCase() === searchName
                || (m.profile?.display_name || '').toLowerCase().startsWith(searchName)
                || (m.real_name || '').toLowerCase().startsWith(searchName);
            });
            if (match?.id) { targetUserId = match.id; targetUserName = match.real_name || match.name; }
          } catch {}
        }
        if (targetUserId) {
          reassignTask(linkedTask.id, targetUserId, targetUserName);
          await client.chat.postMessage({
            channel, thread_ts: threadTs,
            text: ':arrows_counterclockwise: Reassigned *' + linkedTask.description + '* to <@' + targetUserId + '>.',
          });
          return true;
        }
      }
    }

    // If the parent has action items and the user just typed a number or numbers,
    // treat as wanting to self-assign
    if (actionItems.length > 0) {
      const justNumbers = lowerText.match(/^[\d\s,and]+$/);
      if (justNumbers) {
        const nums = lowerText.match(/\d+/g);
        if (nums) {
          const taskNums = nums.map((n: string) => parseInt(n, 10));
          const assigned: string[] = [];
          for (const num of taskNums) {
            const item = actionItems.find(a => a.num === num);
            if (!item) continue;
            const task = createTask({
              slackUserId: userId,
              slackUserName: undefined,
              description: item.action,
              sourceChannelId: channel,
              sourceMessageTs: threadTs,
              confidence: 'high',
              deadlineText: null,
              source: 'zoom',
            });
            if (task) {
              assigned.push('(' + num + ') ' + item.action);
            }
          }
          if (assigned.length > 0) {
            // Look up the user's name
            let userName = 'you';
            try {
              const info = await client.users.info({ user: userId });
              userName = info.user?.real_name || info.user?.name || 'you';
            } catch {}
            await client.chat.postMessage({
              channel, thread_ts: threadTs,
              text: ':white_check_mark: Assigned ' + assigned.length + ' task' + (assigned.length > 1 ? 's' : '') + ' to ' + userName + ':\n' + assigned.join('\n'),
            });
            return true;
          }
        }
      }
    }

    // --- "remind [Person] to [task]" or "[Person] — [task]" pattern ---
    // Catches formats like: "remind Carlos to get the docs done by Friday"
    // or "Carlos Hernández — Update the iMessage documentation"
    const remindMatch = text.match(/(?:remind\s+)?(.+?)\s*(?:to\s+|—\s*|–\s*|-\s+)(.+)/i);
    if (remindMatch) {
      const personName = remindMatch[1].replace(/^remind\s+/i, '').replace(/<@[A-Z0-9]+\|?/gi, '').replace(/>/g, '').trim();
      const taskDescription = remindMatch[2].trim();

      if (personName && taskDescription && personName.length > 1 && taskDescription.length > 3) {
        // Look up the person
        let targetUserId: string | undefined;
        let targetUserName: string | undefined;

        // Check for @mention first
        const mentionInPerson = text.match(/<@([A-Z0-9]+)(?:\|([^>]*))?>/i);
        if (mentionInPerson) {
          targetUserId = mentionInPerson[1];
          targetUserName = mentionInPerson[2] || undefined;
        } else {
          // Look up by name
          try {
            const listRes = await client.users.list({});
            const userMatch = listRes.members?.find((m: any) => {
              if (m.deleted || m.is_bot) return false;
              const search = personName.toLowerCase();
              return (m.profile?.display_name || '').toLowerCase() === search
                || (m.real_name || '').toLowerCase() === search
                || (m.name || '').toLowerCase() === search
                || (m.real_name || '').toLowerCase().startsWith(search)
                || (m.profile?.display_name || '').toLowerCase().startsWith(search);
            });
            if (userMatch?.id) {
              targetUserId = userMatch.id;
              targetUserName = userMatch.real_name || userMatch.name;
            }
          } catch {}
        }

        if (targetUserId) {
          if (!targetUserName) {
            try {
              const info = await client.users.info({ user: targetUserId });
              targetUserName = info.user?.real_name || info.user?.name;
            } catch {}
          }

          // Parse deadline from the task description
          const deadlineMatch = taskDescription.match(/\b(?:by|before|due|until)\s+(.+)$/i);
          const deadlineText = deadlineMatch ? deadlineMatch[1].trim() : null;
          const cleanDescription = deadlineMatch ? taskDescription.replace(deadlineMatch[0], '').trim() : taskDescription;

          const task = createTask({
            slackUserId: targetUserId,
            slackUserName: targetUserName,
            description: cleanDescription || taskDescription,
            sourceChannelId: channel,
            sourceMessageTs: threadTs,
            confidence: 'high',
            deadlineText,
            source: 'zoom',
          });

          if (task) {
            const deadlineStr = task.deadline
              ? ', due ' + task.deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              : '';
            await client.chat.postMessage({
              channel, thread_ts: threadTs,
              text: ':white_check_mark: Assigned to <@' + targetUserId + '>: *' + (cleanDescription || taskDescription) + '*' + deadlineStr + '.',
            });
          } else {
            await client.chat.postMessage({
              channel, thread_ts: threadTs,
              text: 'That task already exists for <@' + targetUserId + '>.',
            });
          }
          return true;
        }
      }
    }

    // Not a recognized command for a bot reply - don't handle it
    console.log('Bot reply not matched as command. assignLines:', lines.filter((l: string) => /^assign\s/i.test(l)).length, 'actionItems:', actionItems.length, 'linkedTask:', !!linkedTask);
    return false;
  } catch (err) {
    console.error('Error handling bot reply:', err);
    return false;
  }
}

export function registerMessageHandler(app: App) {
  app.message(async ({ message, client, context }) => {
    if (!('text' in message) || !('user' in message)) return;
    if (message.subtype) return;

    // Check thread replies to bot messages FIRST — works in both DMs and channels
    const botUserId = context.botUserId;
    if ((message as any).thread_ts) {
      const handledAsReply = await handleBotReply(message, client, botUserId);
      if (handledAsReply) return;
    }

    // Route DMs to the DM handler instead of commitment extraction
    const handled = await handleDirectMessage(message as any, client);
    if (handled) return;

    // Skip task creation for Team A and Team B channels (digest-only)
    if (SKIP_TASK_CHANNELS.has(message.channel)) return;

    const text = message.text || '';

    // Skip messages that @mention the bot — the app_mention handler handles those
    if (botUserId && text.includes(`<@${botUserId}>`)) return;
    const user = message.user;

    if (text.length < MIN_MESSAGE_LENGTH) return;

    const existing = db.select().from(processedMessages)
      .where(eq(processedMessages.messageTs, message.ts))
      .get();
    if (existing) return;

    db.insert(processedMessages).values({
      messageTs: message.ts,
      channelId: message.channel,
      processedAt: new Date(),
    }).run();

    const channelId = message.channel;
    const bufferedMsg: BufferedMessage = {
      user,
      text,
      ts: message.ts,
      channel: channelId,
      thread_ts: (message as any).thread_ts,
    };

    if (!messageBuffer.has(channelId)) {
      messageBuffer.set(channelId, []);
      setTimeout(() => processBatch(channelId, client, app), BATCH_WINDOW_MS);
    }
    messageBuffer.get(channelId)!.push(bufferedMsg);
  });
}

async function processBatch(channelId: string, client: any, app: App) {
  const messages = messageBuffer.get(channelId) || [];
  messageBuffer.delete(channelId);

  if (messages.length === 0) return;

  // Build a map of message_ts -> thread_ts so replies stay in-thread
  const threadTsMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.thread_ts) {
      threadTsMap.set(msg.ts, msg.thread_ts);
    }
  }

  try {
    // Resolve <@USERID> mentions to display names before sending to AI
    const resolvedMessages = await Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        text: await resolveUserMentions(msg.text, client),
      }))
    );

    const commitments = await extractCommitments(resolvedMessages);

    for (const commitment of commitments) {
      // If the original message was a thread reply, use its thread_ts
      const originalThreadTs = threadTsMap.get(commitment.message_ts);
      await handleCommitment(commitment, client, originalThreadTs);
    }

    // ─── Knowledge graph ingestion REMOVED ─────────────────────
    // Architecture decision: Slack messages do not feed the knowledge base.
    // Knowledge base is only fed by: manual document uploads, auto-generated SOPs, user corrections.
    // Slack feeds: task detection only.
  } catch (error) {
    // Processing failed — remove the processed markers so messages can be retried
    for (const msg of messages) {
      try {
        db.delete(processedMessages)
          .where(eq(processedMessages.messageTs, msg.ts))
          .run();
      } catch (_) { /* ignore cleanup errors */ }
    }
    console.error('Message batch processing failed, will retry:', error);
  }
}

async function handleCommitment(commitment: ExtractedCommitment, client: any, threadTs?: string) {
  try {
    let userName: string | undefined;
    try {
      const userInfo = await client.users.info({ user: commitment.who });
      userName = userInfo.user?.real_name || userInfo.user?.name;
    } catch {
      // Ignore lookup failures
    }

    const task = createTask({
      slackUserId: commitment.who,
      slackUserName: userName,
      description: commitment.what,
      sourceChannelId: commitment.channel,
      sourceMessageTs: commitment.message_ts,
      confidence: commitment.confidence,
      deadlineText: commitment.deadline_text,
      source: 'slack',
    });

    if (!task) {
      // Duplicate task, skip
      return;
    }

    const blocks = taskConfirmationBlocks(
      task.id,
      commitment.who,
      commitment.what,
      commitment.deadline_text,
      commitment.confidence,
      task.deadline,
    );

    const reply = await client.chat.postMessage({
      channel: commitment.channel,
      thread_ts: threadTs || commitment.message_ts,
      blocks,
      text: 'Task tracked: ' + commitment.what,
    });

    if (reply.ts) {
      updateBotReplyTs(task.id, reply.ts);
    }

    console.log('Task created:', task.id, '-', commitment.what, 'for user', commitment.who);
  } catch (error) {
    console.error('Error handling commitment:', error);
  }
}

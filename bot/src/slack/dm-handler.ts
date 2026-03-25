
import { getTasksByUser, getOverdueTasks, getOverdueTasksByUser, getAllOpenTasks, completeTask, dismissTask, reopenTask, getTaskById, updateDeadline, createTask, updateBotReplyTs } from '../tasks/task-service';
import { generatePersonalDigest } from '../tasks/digest-service';
import { extractCommitments } from '../ai/commitment-extractor';
import { taskListBlocks, taskConfirmationBlocks } from './blocks';
import { config } from '../config';

// Leadership users who can see all tasks
const LEADERSHIP_IDS = new Set(
  [config.escalation.omerSlackUserId, config.escalation.markSlackUserId, config.escalation.ehsanSlackUserId].filter(Boolean)
);

// --- Conversational session state for multi-turn task management ---
interface ConversationState {
  action: 'complete' | 'dismiss' | 'reopen';
  tasks: Array<{ id: string; description: string; botReplyTs?: string | null; sourceChannelId?: string | null }>;
  expiresAt: number;
}
const activeConversations = new Map<string, ConversationState>();
const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of activeConversations) {
    if (now > session.expiresAt) activeConversations.delete(key);
  }
}

/**
 * Handle a follow-up reply in an active conversation session.
 * Returns true if the message was handled as a session reply.
 */
async function handleConversationReply(
  text: string,
  userId: string,
  channel: string,
  client: any,
): Promise<boolean> {
  cleanExpiredSessions();
  const session = activeConversations.get(userId);
  if (!session) return false;

  const input = text.trim().toLowerCase();

  // Parse which tasks the user wants to act on
  let selectedIndices: number[] = [];

  if (input === 'all' || input === 'all of them' || input === 'everything') {
    selectedIndices = session.tasks.map((_, i) => i);
  } else if (input === 'none' || input === 'nevermind' || input === 'cancel' || input === 'nvm') {
    activeConversations.delete(userId);
    await client.chat.postMessage({ channel, text: 'No problem, cancelled! :thumbsup:' });
    return true;
  } else {
    // Try to parse numbers: "1 and 3", "1, 2, 3", "1 3", "#1 #2"
    const numberMatches = input.match(/\d+/g);
    if (numberMatches) {
      selectedIndices = numberMatches
        .map(n => parseInt(n, 10) - 1) // convert 1-based to 0-based
        .filter(i => i >= 0 && i < session.tasks.length);
    }

    // If no numbers matched, try exact task ID matching (e.g. "tsk_abc123")
    if (selectedIndices.length === 0) {
      const mentionedIds: string[] = input.match(/tsk_\w+/g) || [];
      if (mentionedIds.length > 0) {
        session.tasks.forEach((task, i) => {
          if (mentionedIds.includes(task.id.toLowerCase())) {
            selectedIndices.push(i);
          }
        });
      }
    }
  }

  if (selectedIndices.length === 0) {
    await client.chat.postMessage({
      channel,
      text: "I couldn't figure out which tasks you mean. Reply with numbers (e.g. *1, 3*), *all*, or *cancel*.",
    });
    return true;
  }

  // Execute the action on selected tasks
  const actionPast = session.action === 'complete' ? 'complete' : session.action === 'dismiss' ? 'dismissed' : 'reopened';
  const actionEmoji = session.action === 'complete' ? ':white_check_mark:' : session.action === 'dismiss' ? ':wastebasket:' : ':arrows_counterclockwise:';
  const completedNames: string[] = [];

  for (const idx of selectedIndices) {
    const task = session.tasks[idx];
    if (session.action === 'complete') {
      completeTask(task.id);
    } else if (session.action === 'dismiss') {
      dismissTask(task.id);
    } else {
      reopenTask(task.id);
    }
    completedNames.push(task.description);

    // Update the original bot message if possible
    if (task.botReplyTs && task.sourceChannelId) {
      try {
        const updateText = session.action === 'complete'
          ? ':white_check_mark: *Done!* ' + task.description + ' — marked complete.'
          : '_Dismissed_ — ' + task.description;
        await client.chat.update({
          channel: task.sourceChannelId,
          ts: task.botReplyTs,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: updateText } }],
          text: (session.action === 'complete' ? 'Task completed: ' : 'Task dismissed: ') + task.description,
        });
      } catch {}
    }
  }

  activeConversations.delete(userId);

  const summary = completedNames.map(n => '• ' + n).join('\n');
  await client.chat.postMessage({
    channel,
    text: actionEmoji + ' Done! Marked ' + completedNames.length + ' task' + (completedNames.length > 1 ? 's' : '') + ' ' + actionPast + ':\n' + summary,
  });

  return true;
}

/**
 * Try to create tasks from a DM message using the commitment extractor.
 * Returns true if at least one task was created.
 */
async function tryCreateTaskFromDM(
  text: string,
  userId: string,
  channel: string,
  messageTs: string,
  client: any,
): Promise<boolean> {
  try {
    // Strip bot @mentions from the text so "remind me" maps to the DM sender, not the bot
    const cleanedText = text.replace(/<@[A-Z0-9]+>/gi, '').trim();

    const commitments = await extractCommitments([{
      user: userId,
      text: cleanedText,
      ts: messageTs,
      channel,
    }]);

    if (commitments.length === 0) return false;

    for (const commitment of commitments) {
      // In DMs, default to the sender if AI couldn't resolve a valid user ID
      const taskOwnerId = (commitment.who && /^U[A-Z0-9]+$/i.test(commitment.who)) ? commitment.who : userId;

      let userName: string | undefined;
      try {
        const userInfo = await client.users.info({ user: taskOwnerId });
        userName = userInfo.user?.real_name || userInfo.user?.name;
      } catch {}

      const task = createTask({
        slackUserId: taskOwnerId,
        slackUserName: userName,
        description: commitment.what,
        sourceChannelId: channel,
        sourceMessageTs: messageTs,
        confidence: commitment.confidence,
        deadlineText: commitment.deadline_text,
        source: 'slack',
      });

      if (!task) continue; // duplicate

      const blocks = taskConfirmationBlocks(
        task.id,
        taskOwnerId,
        commitment.what,
        commitment.deadline_text,
        commitment.confidence,
        task.deadline,
      );

      const reply = await client.chat.postMessage({
        channel,
        blocks,
        text: 'Task tracked: ' + commitment.what,
      });

      if (reply.ts) {
        updateBotReplyTs(task.id, reply.ts);
      }
    }

    return true;
  } catch (err) {
    console.error('Error creating task from DM:', err);
    return false;
  }
}

export async function handleDirectMessage(
  message: any,
  client: any,
): Promise<boolean> {
  if (!message.channel.startsWith('D')) return false;

  const text = (message.text || '').trim().toLowerCase();
  const originalText = (message.text || '').trim();
  const userId = message.user;
  const channel = message.channel;
  const isLeadership = LEADERSHIP_IDS.has(userId);

  // --- Check for active conversation session first ---
  const handledByConversation = await handleConversationReply(text, userId, channel, client);
  if (handledByConversation) return true;

  // --- Greetings ---
  if (/^(hi|hey|hello|yo|sup|howdy)\b/.test(text)) {
    const greetLines: string[] = [
      "Hey! I'm your AI Chief of Staff. Here's what I can help with:",
      '',
      '\u2022 *"my tasks"* \u2014 See your open tasks',
      '\u2022 *"overdue"* \u2014 See your overdue tasks',
      '\u2022 *"done <task-id>"* \u2014 Mark a task complete',
      '\u2022 *"mark my tasks complete"* \u2014 Conversational task completion',
      '\u2022 *"push <task-id> Friday"* \u2014 Push a deadline',
      '\u2022 *"digest"* \u2014 Get an on-demand digest',
      '\u2022 *"remind me to..."* \u2014 Create a task for yourself',
      '\u2022 *"help"* \u2014 Show this menu',
    ];
    if (isLeadership) {
      greetLines.push('\u2022 *"all tasks"* \u2014 See all open tasks across the team');
      greetLines.push('\u2022 *"all overdue"* \u2014 See all overdue tasks across the team');
    }
    greetLines.push('', 'Or just ask me anything!');
    await client.chat.postMessage({ channel, text: greetLines.join('\n') });
    return true;
  }

  // --- Help ---
  if (/^help\b/.test(text)) {
    const helpLines: string[] = [
      '*Atlas Chief of Staff \u2014 DM Commands:*',
      '',
      ':clipboard: *Task Management*',
      '\u2022 *"my tasks"* or *"tasks"* \u2014 Show your open tasks',
      '\u2022 *"overdue"* \u2014 Show your overdue tasks',
      '\u2022 *"done <task-id>"* \u2014 Mark a task complete (e.g. "done tsk_a7x3q")',
      '\u2022 *"mark my tasks complete"* \u2014 Walk through completing tasks conversationally',
      '\u2022 *"dismiss my tasks"* \u2014 Walk through dismissing tasks that aren\'t real',
      '\u2022 *"push <task-id> <new deadline>"* \u2014 Push a deadline (e.g. "push tsk_a7x3q next Monday")',
      '\u2022 *"remind me to..."* \u2014 Create a task for yourself',
      '',
      ':bar_chart: *Reports*',
      '\u2022 *"digest"* \u2014 Get a full weekly digest right now',
    ];
    if (isLeadership) {
      helpLines.push('');
      helpLines.push(':bust_in_silhouette: *Leadership*');
      helpLines.push('\u2022 *"all tasks"* \u2014 See all open tasks across the entire team');
      helpLines.push('\u2022 *"all overdue"* \u2014 See all overdue tasks across the entire team');
    }
    helpLines.push(
      '',
      ':bulb: *Tips*',
      '\u2022 You can also use slash commands in any channel: `/tasks`, `/complete`, `/push`, `/digest`',
      '\u2022 React with :white_check_mark: on any task message to mark it done',
      '\u2022 Just tell me what to track and I\'ll create a task for you!',
    );
    await client.chat.postMessage({ channel, text: helpLines.join('\n') });
    return true;
  }

  // --- Task creation intent (BEFORE "tasks" keyword match) ---
  // Catches: "remind me to...", "track ...", "create a task...", "add a task...", "I'll ...", "note that..."
  if (/\b(remind me|track\s|create a task|add a task|i need to|i'll |i will |note that|don't let me forget|don't forget)\b/.test(text)) {
    await client.chat.postMessage({ channel, text: ':hourglass_flowing_sand: On it...' });
    const created = await tryCreateTaskFromDM(originalText, userId, channel, message.ts, client);
    if (created) return true;
    // If extraction failed, fall through to show help
    await client.chat.postMessage({ channel, text: "I couldn't quite parse that as a task. Try something like: *\"remind me to send the report by Friday\"*" });
    return true;
  }

  // --- Conversational complete / dismiss intent ---
  if (/\b(mark.*(?:complet(?:ed?)?|done|finished)|complet(?:ed?)?.*tasks?|finish.*tasks?|close.*tasks?|i(?:'ve|'m)\s+done\s+with)\b/.test(text)) {
    // Check if user is asking about another person's tasks (e.g. "mark the tasks by @Atlas Chief complete")
    const mentionMatch = originalText.match(/<@([A-Z0-9]+)(?:\|[^>]*)?>/i);
    const targetUserId = mentionMatch ? mentionMatch[1] : userId;
    const isOtherUser = targetUserId !== userId;
    const userTasks = getTasksByUser(targetUserId);
    if (userTasks.length === 0) {
      await client.chat.postMessage({ channel, text: isOtherUser ? ':tada: No open tasks found for that user!' : ':tada: You have no open tasks to complete!' });
      return true;
    }
    const taskLines = userTasks.map((t: any, i: number) =>
      (i + 1) + '. ' + t.description + ' (`' + t.id + '`)'
    );
    activeConversations.set(userId, {
      action: 'complete',
      tasks: userTasks.map((t: any) => ({ id: t.id, description: t.description, botReplyTs: t.botReplyTs, sourceChannelId: t.sourceChannelId })),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    await client.chat.postMessage({
      channel,
      text: (isOtherUser ? 'Here are their open tasks:\n' : 'Here are your open tasks:\n') + taskLines.join('\n') + '\n\nWhich ones should I mark *complete*? Reply with numbers (e.g. *1, 3*), *all*, or *cancel*.',
    });
    return true;
  }

  if (/\b(not (?:a )?tasks?|dismiss.*tasks?|remove.*tasks?|these aren'?t tasks?|clear.*tasks?)\b/.test(text)) {
    const userTasks = getTasksByUser(userId);
    if (userTasks.length === 0) {
      await client.chat.postMessage({ channel, text: ':tada: You have no open tasks to dismiss!' });
      return true;
    }
    const taskLines = userTasks.map((t: any, i: number) =>
      (i + 1) + '. ' + t.description + ' (`' + t.id + '`)'
    );
    activeConversations.set(userId, {
      action: 'dismiss',
      tasks: userTasks.map((t: any) => ({ id: t.id, description: t.description, botReplyTs: t.botReplyTs, sourceChannelId: t.sourceChannelId })),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    await client.chat.postMessage({
      channel,
      text: 'Here are your open tasks:\n' + taskLines.join('\n') + '\n\nWhich ones should I *dismiss* (not real tasks)? Reply with numbers (e.g. *1, 3*), *all*, or *cancel*.',
    });
    return true;
  }

  // --- Reopen / undo / put back a completed task ---
  if (/\b(reopen|put.*back|undo|un-?complete|restore)\b/.test(text)) {
    // Check for a specific task ID
    const taskIdMatch = text.match(/tsk_\w+/);
    if (taskIdMatch) {
      const task = getTaskById(taskIdMatch[0]);
      if (!task) {
        await client.chat.postMessage({ channel, text: 'Task not found: `' + taskIdMatch[0] + '`.' });
      } else if (task.status !== 'COMPLETED' && task.status !== 'DISMISSED') {
        await client.chat.postMessage({ channel, text: 'That task is already open! Use *"my tasks"* to see it.' });
      } else {
        reopenTask(taskIdMatch[0]);
        await client.chat.postMessage({ channel, text: ':arrows_counterclockwise: Reopened *' + task.description + '*. It\'s back on your list!' });
      }
      return true;
    }
    // No task ID specified — show recently completed tasks to pick from
    const { db } = require('../db/connection');
    const { tasks } = require('../db/schema');
    const { eq, and, inArray, desc } = require('drizzle-orm');
    const recentlyCompleted = db.select().from(tasks)
      .where(and(
        eq(tasks.slackUserId, userId),
        inArray(tasks.status, ['COMPLETED', 'DISMISSED']),
      ))
      .orderBy(desc(tasks.updatedAt))
      .limit(10)
      .all();
    if (recentlyCompleted.length === 0) {
      await client.chat.postMessage({ channel, text: 'You have no recently completed or dismissed tasks to reopen.' });
      return true;
    }
    const taskLines = recentlyCompleted.map((t: any, i: number) =>
      (i + 1) + '. ' + t.description + ' (`' + t.id + '`) — ' + (t.status === 'COMPLETED' ? '✅ completed' : '🗑️ dismissed')
    );
    activeConversations.set(userId, {
      action: 'reopen' as any,
      tasks: recentlyCompleted.map((t: any) => ({ id: t.id, description: t.description, botReplyTs: t.botReplyTs, sourceChannelId: t.sourceChannelId })),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    await client.chat.postMessage({
      channel,
      text: 'Here are your recently completed/dismissed tasks:\n' + taskLines.join('\n') + '\n\nWhich ones should I *reopen*? Reply with numbers (e.g. *1, 3*), *all*, or *cancel*.',
    });
    return true;
  }

  // --- All tasks (leadership only) - must be before "my tasks" match ---
  if (/\ball tasks\b/.test(text) && isLeadership) {
    const allTasks = getAllOpenTasks();
    if (allTasks.length === 0) {
      await client.chat.postMessage({ channel, text: ':tada: No open tasks across the team right now!' });
    } else {
      const taskLines = allTasks.map((t: any) => {
        const deadlineStr = t.deadline ? new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'no deadline';
        return '\u2022 `' + t.id + '` ' + t.description + ' \u2014 <@' + t.slackUserId + '> (due ' + deadlineStr + ')';
      });
      await client.chat.postMessage({ channel, text: '*All open tasks (' + allTasks.length + '):*\n' + taskLines.join('\n') });
    }
    return true;
  }

  // --- All overdue (leadership only) - must be before individual "overdue" match ---
  if (/\ball overdue\b/.test(text) && isLeadership) {
    const allOverdue = getOverdueTasks();
    if (allOverdue.length === 0) {
      await client.chat.postMessage({ channel, text: ':tada: No overdue tasks right now. The team is on top of it!' });
    } else {
      const odLines = allOverdue.map((t: any) => {
        const daysLate = Math.ceil((Date.now() - new Date(t.deadline).getTime()) / (1000 * 60 * 60 * 24));
        return '\u2022 *' + t.description + '* \u2014 <@' + t.slackUserId + '> (' + daysLate + 'd late)';
      });
      await client.chat.postMessage({ channel, text: ':warning: *All overdue tasks (' + allOverdue.length + '):*\n' + odLines.join('\n') });
    }
    return true;
  }

  // --- My tasks / tasks / what on my plate (only for SHORT messages that are clearly asking to VIEW tasks) ---
  if (/\b(my tasks|tasks|plate|open|what do i have|to.?do)\b/.test(text) && text.length < 50) {
    const userTasks = getTasksByUser(userId);
    const blocks = taskListBlocks(userTasks);
    await client.chat.postMessage({ channel, blocks, text: 'Your open tasks' });
    return true;
  }

  // --- Overdue (individual - shows only your overdue tasks) ---
  if (/\boverdue\b/.test(text) && text.length < 50) {
    const overdue = getOverdueTasksByUser(userId);
    if (overdue.length === 0) {
      await client.chat.postMessage({ channel, text: ':tada: You have no overdue tasks. Nice work!' });
    } else {
      const myOdLines = overdue.map((t: any) => {
        const daysLate = Math.ceil((Date.now() - new Date(t.deadline).getTime()) / (1000 * 60 * 60 * 24));
        return '\u2022 *' + t.description + '* (' + daysLate + 'd late)';
      });
      await client.chat.postMessage({ channel, text: ':warning: *Your overdue tasks (' + overdue.length + '):*\n' + myOdLines.join('\n') });
    }
    return true;
  }

  // --- Done / complete <task-id> ---
  const doneMatch = text.match(/^(?:done|complete|finished?)\s+(tsk_\w+)/);
  if (doneMatch) {
    const taskId = doneMatch[1];
    const task = getTaskById(taskId);
    if (!task) {
      await client.chat.postMessage({ channel, text: 'Task not found: `' + taskId + '`. Use *"my tasks"* to see your task IDs.' });
    } else if (task.status === 'COMPLETED') {
      await client.chat.postMessage({ channel, text: 'That task is already done! :white_check_mark:' });
    } else {
      completeTask(taskId);
      await client.chat.postMessage({ channel, text: ':white_check_mark: Done! Marked *' + task.description + '* as complete.' });
      if (task.botReplyTs && task.sourceChannelId) {
        try {
          await client.chat.update({
            channel: task.sourceChannelId, ts: task.botReplyTs,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':white_check_mark: *Done!* ' + task.description + ' \u2014 marked complete.' } }],
            text: 'Task completed: ' + task.description,
          });
        } catch { }
      }
    }
    return true;
  }

  // --- Push <task-id> <new deadline> ---
  const pushMatch = text.match(/^push\s+(tsk_\w+)\s+(.+)/);
  if (pushMatch) {
    const taskId = pushMatch[1];
    const newDeadline = pushMatch[2].trim();
    const task = getTaskById(taskId);
    if (!task) {
      await client.chat.postMessage({ channel, text: 'Task not found: `' + taskId + '`. Use *"my tasks"* to see your task IDs.' });
    } else {
      updateDeadline(taskId, newDeadline);
      const updated = getTaskById(taskId);
      const newDate = updated && updated.deadline
        ? new Date(updated.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : newDeadline;
      await client.chat.postMessage({ channel, text: ':calendar: Pushed *' + task.description + '* to ' + newDate + '.' });
    }
    return true;
  }

  // --- Digest ---
  if (/^digest\b/.test(text)) {
    await client.chat.postMessage({ channel, text: ':hourglass_flowing_sand: Generating your digest...' });
    await generatePersonalDigest(client, userId);
    return true;
  }

  // --- Smart fallback: for longer messages, try to extract a task ---
  if (text.length > 30) {
    await client.chat.postMessage({ channel, text: ':hourglass_flowing_sand: Let me see if there\'s a task in there...' });
    const created = await tryCreateTaskFromDM(originalText, userId, channel, message.ts, client);
    if (created) return true;
    // If no task found, fall through to generic fallback
  }

  // --- Generic fallback ---
  const fallbackLines: string[] = [
    "I'm not sure what you mean by that. Here are some things you can ask me:",
    '',
    '\u2022 *"my tasks"* \u2014 See your open tasks',
    '\u2022 *"overdue"* \u2014 See your overdue items',
    '\u2022 *"done tsk_abc123"* \u2014 Mark a task complete',
    '\u2022 *"push tsk_abc123 Friday"* \u2014 Push a deadline',
    '\u2022 *"remind me to..."* \u2014 Create a task',
    '\u2022 *"digest"* \u2014 Weekly digest',
    '\u2022 *"help"* \u2014 Full command list',
  ];
  if (isLeadership) {
    fallbackLines.push('\u2022 *"all tasks"* \u2014 All open tasks across the team');
  }
  await client.chat.postMessage({ channel, text: fallbackLines.join('\n') });
  return true;
}

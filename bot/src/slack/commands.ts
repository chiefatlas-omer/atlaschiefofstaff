import type { App } from '@slack/bolt';
import { getTasksByUser, completeTask, getTaskById, updateDeadline, getAllOpenTasks, reassignTask } from '../tasks/task-service';
import { taskListBlocks, adminTaskListBlocks } from './blocks';
import { config } from '../config';
import { generatePersonalDigest } from '../tasks/digest-service';
import { deduplicateTasks } from '../tasks/task-service';

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

}

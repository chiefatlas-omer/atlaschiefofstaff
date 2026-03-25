import type { App } from '@slack/bolt';
import { completeTask, dismissTask, confirmTask, getTaskById, createTask } from '../tasks/task-service';

export function registerInteractionHandlers(app: App) {
  // Mark Complete button
  app.action('task_complete', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const taskId = action.value!;
    const task = getTaskById(taskId);
    if (!task) {
      console.log('task_complete: Task not found:', taskId);
      if ('channel' in body && body.channel && 'message' in body && body.message) {
        await client.chat.update({
          channel: (body as any).channel.id,
          ts: (body as any).message.ts,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':warning: Task not found. It may have been completed already.' } }],
          text: 'Task not found',
        });
      }
      return;
    }

    completeTask(taskId);

    // Update the message to show completion
    if ('channel' in body && body.channel && 'message' in body && body.message) {
      await client.chat.update({
        channel: (body as any).channel.id,
        ts: (body as any).message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':white_check_mark: *Done!* ' + task.description + ' -- marked complete by <@' + (body.user?.id || 'someone') + '>.',
            },
          },
        ],
        text: 'Task completed: ' + task.description,
      });
    }
  });

  // Dismiss / Not a Task button
  app.action('task_dismiss', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const taskId = action.value!;
    const task = getTaskById(taskId);
    if (!task) {
      console.log('task_dismiss: Task not found:', taskId);
      return;
    }
    dismissTask(taskId);

    // Remove the message
    if ('channel' in body && body.channel && 'message' in body && body.message) {
      await client.chat.delete({
        channel: (body as any).channel.id,
        ts: (body as any).message.ts,
      }).catch(() => {
        // If we can't delete, update it instead
        client.chat.update({
          channel: (body as any).channel.id,
          ts: (body as any).message.ts,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '_Dismissed -- not a task._' },
            },
          ],
          text: 'Task dismissed',
        });
      });
    }
  });

  // Confirm task (medium confidence)
  app.action('task_confirm', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const taskId = action.value!;
    const task = getTaskById(taskId);
    if (!task) {
      console.log('task_confirm: Task not found:', taskId);
      return;
    }

    confirmTask(taskId);

    if ('channel' in body && body.channel && 'message' in body && body.message) {
      const deadlineStr = task.deadline
        ? new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : 'in ~1 week';
      await client.chat.update({
        channel: (body as any).channel.id,
        ts: (body as any).message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: "Got it -- tracking: *" + task.description + "*, due " + deadlineStr + ". I'll ping you when it's approaching.",
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Mark Complete' },
                style: 'primary',
                action_id: 'task_complete',
                value: taskId,
              },
            ],
          },
        ],
        text: 'Task confirmed: ' + task.description,
      });
    }
  });

  // Snooze / Need More Time - show time options
  app.action('task_snooze', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const taskId = action.value!;
    const task = getTaskById(taskId);
    if (!task) {
      console.log('task_snooze: Task not found:', taskId);
      if ('channel' in body && body.channel && 'message' in body && body.message) {
        await client.chat.update({
          channel: (body as any).channel.id,
          ts: (body as any).message.ts,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':warning: Task not found. It may have been completed already.' } }],
          text: 'Task not found',
        });
      }
      return;
    }

    if ('channel' in body && body.channel && 'message' in body && body.message) {
      await client.chat.update({
        channel: (body as any).channel.id,
        ts: (body as any).message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'When can you get to *' + task.description + '*?',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Tomorrow' },
                action_id: 'snooze_tomorrow',
                value: taskId,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'In 2 Days' },
                action_id: 'snooze_2days',
                value: taskId,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Next Week' },
                action_id: 'snooze_nextweek',
                value: taskId,
              },
            ],
          },
        ],
        text: 'Snooze: ' + task.description,
      });
    }
  });

  // Snooze time handlers
  const snoozeOptions: Record<string, string> = {
    snooze_tomorrow: 'tomorrow',
    snooze_2days: 'in 2 days',
    snooze_nextweek: 'next Monday',
  };

  for (const [actionId, deadlineText] of Object.entries(snoozeOptions)) {
    app.action(actionId, async ({ action, ack, client, body }) => {
      await ack();
      if (action.type !== 'button') return;

      const taskId = action.value!;
      const task = getTaskById(taskId);
      if (!task) {
        console.log(actionId + ': Task not found:', taskId);
        return;
      }

      const { updateDeadline } = require('../tasks/task-service');
      updateDeadline(taskId, deadlineText);

      const updated = getTaskById(taskId);
      const newDate = updated && updated.deadline
        ? new Date(updated.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : deadlineText;

      if ('channel' in body && body.channel && 'message' in body && body.message) {
        await client.chat.update({
          channel: (body as any).channel.id,
          ts: (body as any).message.ts,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "No worries -- pushed *" + task.description + "* to " + newDate + ". I'll check in again then.",
              },
            },
          ],
          text: 'Task pushed: ' + task.description,
        });
      }
    });
  }

  // View thread noop (just acknowledges)
  app.action('view_thread_noop', async ({ ack }) => {
    await ack();
  });

  // --- Zoom meeting assignment handlers ---
  // Handle "Assign #N" button clicks from meeting summary DMs
  for (let i = 0; i < 25; i++) {
    app.action('zoom_assign_' + i, async ({ action, ack, client, body }) => {
      await ack();
      if (action.type !== 'button') return;

      let assignData: any;
      try {
        assignData = JSON.parse(action.value!);
      } catch {
        return;
      }

      // Open a modal with a user select dropdown
      const triggerId = (body as any).trigger_id;
      if (!triggerId) return;

      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'zoom_assign_modal',
          private_metadata: action.value!,
          title: { type: 'plain_text', text: 'Assign Action Item' },
          submit: { type: 'plain_text', text: 'Assign' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Action item:* ' + assignData.action,
              },
            },
            {
              type: 'input',
              block_id: 'user_block',
              label: { type: 'plain_text', text: 'Assign to' },
              element: {
                type: 'users_select',
                action_id: 'assigned_user',
                placeholder: { type: 'plain_text', text: 'Pick a team member...' },
              },
            },
          ],
        },
      });
    });
  }

  // Handle the assignment modal submission
  app.view('zoom_assign_modal', async ({ ack, view, client, body }) => {
    await ack();

    let assignData: any;
    try {
      assignData = JSON.parse(view.private_metadata);
    } catch {
      return;
    }

    const selectedUserId = view.state.values.user_block.assigned_user.selected_user;
    if (!selectedUserId) return;

    const assignedByUserId = body.user.id;

    // Create the task for the assigned user
    const taskResult = createTask({
      slackUserId: selectedUserId,
      slackUserName: assignData.owner || null,
      description: assignData.action,
      sourceChannelId: 'DM',
      sourceMessageTs: Date.now().toString(),
      confidence: 'high',
      deadlineText: assignData.deadline || null,
      source: 'zoom',
      zoomMeetingId: assignData.mid || null,
    });

    if (!taskResult) {
      // Duplicate task — already exists for this user/meeting (already ack'd above)
      return;
    }

    // DM the assigned user
    try {
      const dmResult = await client.conversations.open({ users: selectedUserId });
      const dmChannel = dmResult.channel?.id;
      if (dmChannel) {
        const deadlineStr = taskResult.deadline
          ? taskResult.deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          : 'in ~1 week';
        await client.chat.postMessage({
          channel: dmChannel,
          text: ':clipboard: <@' + assignedByUserId + '> assigned you a task from a meeting: *' + assignData.action + '*, due ' + deadlineStr + '.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':clipboard: <@' + assignedByUserId + '> assigned you a task from a meeting:\n\n*' + assignData.action + '*\nDue: ' + deadlineStr,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Mark Complete' },
                  style: 'primary',
                  action_id: 'task_complete',
                  value: taskResult.id,
                },
              ],
            },
          ],
        });
      }
    } catch (err) {
      console.error('Failed to DM assigned user:', err);
    }

    // Also notify the assigner
    try {
      const assignerDm = await client.conversations.open({ users: assignedByUserId });
      const assignerChannel = assignerDm.channel?.id;
      if (assignerChannel) {
        await client.chat.postMessage({
          channel: assignerChannel,
          text: ':white_check_mark: Assigned *' + assignData.action + "* to <@" + selectedUserId + ">. They've been notified.",
        });
      }
    } catch (err) {
      console.error('Failed to notify assigner:', err);
    }
  });
}

/**
 * Slack Notifier — sends AI Team event notifications to the owner via Slack DM.
 *
 * Uses the SLACK_BOT_TOKEN from the environment to send messages.
 * Falls back gracefully if not configured.
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

// ---------------------------------------------------------------------------
// Core send helper
// ---------------------------------------------------------------------------

async function sendSlackMessage(channel: string, text: string, blocks?: any[]): Promise<boolean> {
  if (!SLACK_BOT_TOKEN) return false;

  try {
    const body: Record<string, unknown> = { channel, text };
    if (blocks) body.blocks = blocks;

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;
    if (!data.ok) {
      console.error('[slack-notifier] Failed to send message:', data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[slack-notifier] Error sending message:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Look up a user's DM channel
// ---------------------------------------------------------------------------

const _dmChannelCache = new Map<string, string>();

async function getDmChannel(userId: string): Promise<string | null> {
  if (_dmChannelCache.has(userId)) return _dmChannelCache.get(userId)!;
  if (!SLACK_BOT_TOKEN) return null;

  try {
    const res = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: userId }),
    });
    const data = await res.json() as any;
    if (data.ok && data.channel?.id) {
      _dmChannelCache.set(userId, data.channel.id);
      return data.channel.id;
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// AI Team notification methods
// ---------------------------------------------------------------------------

export function isSlackConfigured(): boolean {
  return SLACK_BOT_TOKEN.length > 0;
}

/**
 * Notify owner when a task is completed and needs approval.
 */
export async function notifyTaskCompleted(opts: {
  ownerSlackId: string;
  employeeName: string;
  employeeIcon: string;
  taskTitle: string;
  needsApproval: boolean;
  outputPreview?: string;
}): Promise<void> {
  const channel = await getDmChannel(opts.ownerSlackId);
  if (!channel) return;

  const statusEmoji = opts.needsApproval ? ':eyes:' : ':white_check_mark:';
  const statusText = opts.needsApproval ? 'Needs your approval' : 'Completed';

  const text = `${opts.employeeIcon} *${opts.employeeName}* — ${statusText}: ${opts.taskTitle}`;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} ${opts.employeeIcon} *${opts.employeeName}* ${opts.needsApproval ? 'needs your approval on' : 'completed'}:\n*${opts.taskTitle}*`,
      },
    },
  ];

  if (opts.outputPreview) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${opts.outputPreview.slice(0, 300).replace(/\n/g, '\n> ')}${opts.outputPreview.length > 300 ? '...' : ''}`,
      },
    });
  }

  if (opts.needsApproval) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: ':point_right: Open the *Atlas Command Center* to review and approve.' },
      ],
    });
  }

  await sendSlackMessage(channel, text, blocks);
}

/**
 * Notify owner when a task fails.
 */
export async function notifyTaskFailed(opts: {
  ownerSlackId: string;
  employeeName: string;
  employeeIcon: string;
  taskTitle: string;
  error: string;
}): Promise<void> {
  const channel = await getDmChannel(opts.ownerSlackId);
  if (!channel) return;

  const text = `${opts.employeeIcon} *${opts.employeeName}* — Failed: ${opts.taskTitle}`;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:warning: ${opts.employeeIcon} *${opts.employeeName}* failed on:\n*${opts.taskTitle}*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${opts.error.slice(0, 300)}`,
      },
    },
  ];

  await sendSlackMessage(channel, text, blocks);
}

/**
 * Notify owner of a new hire.
 */
export async function notifyNewHire(opts: {
  ownerSlackId: string;
  employeeName: string;
  employeeIcon: string;
  role: string;
}): Promise<void> {
  const channel = await getDmChannel(opts.ownerSlackId);
  if (!channel) return;

  const text = `${opts.employeeIcon} New hire: *${opts.employeeName}* (${opts.role}) has joined your AI team!`;
  await sendSlackMessage(channel, text);
}

/**
 * Notify owner when all employees are paused.
 */
export async function notifyBulkPause(ownerSlackId: string, count: number): Promise<void> {
  const channel = await getDmChannel(ownerSlackId);
  if (!channel) return;

  await sendSlackMessage(channel, `:pause_button: Paused ${count} AI team member${count !== 1 ? 's' : ''}. They will not execute any tasks until resumed.`);
}

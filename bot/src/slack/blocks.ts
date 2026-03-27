type SlackBlock = any;

export function taskConfirmationBlocks(
  taskId: string,
  userId: string,
  description: string,
  deadlineText: string | null,
  confidence: 'high' | 'medium',
  deadline: Date | null,
): SlackBlock[] {
  const deadlineStr = deadline
    ? deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'in ~1 week';

  if (confidence === 'high') {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Got it -- tracking this for <@${userId}>: *${description}*${deadlineText ? `, due ${deadlineStr}` : ''}. I'll ping you when it's approaching.`,
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
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Not a Task' },
            action_id: 'task_dismiss',
            value: taskId,
          },
        ],
      },
    ];
  }

  // Medium confidence - ask for confirmation
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hey <@${userId}>, sounds like you might be picking this up? *${description}*. Want me to track it?`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Yes, Track It' },
          style: 'primary',
          action_id: 'task_confirm',
          value: taskId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Nah' },
          action_id: 'task_dismiss',
          value: taskId,
        },
      ],
    },
  ];
}

export function reminderBlocks(
  taskId: string,
  description: string,
  deadline: Date | null,
): SlackBlock[] {
  const deadlineStr = deadline
    ? deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'soon';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Friendly nudge: *${description}* is due ${deadlineStr}. You got this.`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done' },
          style: 'primary',
          action_id: 'task_complete',
          value: taskId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Need More Time' },
          action_id: 'task_snooze',
          value: taskId,
        },
      ],
    },
  ];
}

export function escalationBlocks(
  taskId: string,
  userId: string,
  description: string,
  daysOverdue: number,
  permalink?: string,
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Heads up: *${description}* (<@${userId}>) is now ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue.`,
      },
    },
  ];

  if (permalink) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Thread' },
          url: permalink,
          action_id: 'view_thread',
        },
      ],
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Mark Complete' },
        style: 'primary',
        action_id: 'task_complete',
        value: taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Dismiss' },
        action_id: 'task_dismiss',
        value: taskId,
      },
    ],
  });

  return blocks;
}

interface DigestData {
  completedCount: number;
  openCount: number;
  overdueCount: number;
  overdueTasks: Array<{ description: string; slackUserName: string | null; slackUserId: string; daysOverdue: number }>;
  date: string;
}

export function digestBlocks(data: DigestData): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Atlas Weekly Digest -- ${data.date}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*Completed this week:* ${data.completedCount} tasks`,
          `*Still open:* ${data.openCount} tasks`,
          `*Overdue:* ${data.overdueCount} tasks`,
        ].join('\n'),
      },
    },
  ];

  if (data.overdueTasks.length > 0) {
    const overdueLines = data.overdueTasks.map(
      (t) => `• ${t.description} → <@${t.slackUserId}> (${t.daysOverdue}d late)`
    );
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Overdue items needing attention:*\n${overdueLines.join('\n')}`,
      },
    });
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'Have a great weekend team',
    },
  });

  return blocks;
}

export function meetingSummaryBlocks(
  summary: string[],
  actionItems: Array<{ owner_name: string; action: string; deadline_text: string | null }>,
  decisions: string[],
  openQuestions: string[],
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  if (actionItems.length > 0) {
    const items = actionItems.map((item, i) =>
      `(${i + 1}) ${item.owner_name} — ${item.action}${item.deadline_text ? ' by ' + item.deadline_text : ''}`
    );
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${actionItems.length} task${actionItems.length > 1 ? 's' : ''} detected:*\n${items.join('\n')}`,
      },
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No tasks detected in this meeting._',
      },
    });
  }

  return blocks;
}

export function meetingSummaryDmBlocks(
  meetingTopic: string,
  typeLabel: string,
  summary: string[],
  actionItems: Array<{ owner_name: string; action: string; deadline_text: string | null }>,
  decisions: string[],
  openQuestions: string[],
  externalNames: string[],
  meetingId: string,
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Privacy notice
  if (typeLabel === 'External') {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':lock: External meeting — this summary is only visible to internal participants. External attendees: ' + externalNames.join(', '),
        },
      ],
    });
  } else {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':lock: Private meeting — this summary is only visible to participants.',
        },
      ],
    });
  }

  blocks.push({ type: 'divider' });

  // Action items with assign buttons
  if (actionItems.length > 0) {
    const items = actionItems.map((item, i) =>
      `(${i + 1}) *${item.owner_name}* — ${item.action}${item.deadline_text ? ' by ' + item.deadline_text : ''}`
    );
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${actionItems.length} task${actionItems.length > 1 ? 's' : ''} detected:*\n${items.join('\n')}`,
      },
    });

    // Add assign buttons for each action item (chunked into rows of 5 for Slack limit)
    const maxButtons = Math.min(actionItems.length, 25);
    const assignButtons = actionItems.slice(0, maxButtons).map((item, i) => {
      const assignData = JSON.stringify({
        idx: i,
        action: item.action.substring(0, 100),
        owner: item.owner_name,
        deadline: item.deadline_text || null,
        mid: meetingId,
      });
      return {
        type: 'button',
        text: { type: 'plain_text', text: 'Assign #' + (i + 1) },
        action_id: 'zoom_assign_' + i,
        value: assignData,
      };
    });

    // Slack allows max 5 elements per actions block, so chunk into rows
    for (let c = 0; c < assignButtons.length; c += 5) {
      blocks.push({
        type: 'actions',
        elements: assignButtons.slice(c, c + 5),
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No tasks detected in this meeting. This may be because the meeting was very short or had minimal discussion._',
      },
    });
  }

  return blocks;
}

export function taskListBlocks(
  userTasks: Array<{ id: string; description: string; status: string; deadline: Date | null }>,
): SlackBlock[] {
  if (userTasks.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'You have no open tasks. Nice work!' },
      },
    ];
  }

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Your open tasks (${userTasks.length}):*`,
      },
    },
  ];

  for (const t of userTasks) {
    const statusIcon =
      t.status === 'OVERDUE' || t.status === 'ESCALATED' ? ':rotating_light:' :
      t.status === 'CONFIRMED' ? ':pushpin:' : ':question:';
    const deadlineStr = t.deadline
      ? t.deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'no deadline';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusIcon} *${t.description}* — due ${deadlineStr}`,
      },
    });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Mark Complete' },
          style: 'primary',
          action_id: 'task_complete',
          value: t.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Need More Time' },
          action_id: 'task_snooze',
          value: t.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Not a Task' },
          action_id: 'task_dismiss',
          value: t.id,
        },
      ],
    });
  }

  return blocks;
}

export function adminTaskListBlocks(
  allTasks: Array<{ id: string; description: string; status: string; deadline: Date | null; slackUserId: string; slackUserName: string | null; source: string | null; sourceChannelId: string | null; sourceMessageTs: string | null; sourceThreadTs: string | null }>,
): SlackBlock[] {
  if (allTasks.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: ':clipboard: No open tasks across the team right now.' },
      },
    ];
  }

  // Group tasks by person
  const byPerson: Record<string, typeof allTasks> = {};
  for (const t of allTasks) {
    const key = t.slackUserId;
    if (!byPerson[key]) byPerson[key] = [];
    byPerson[key].push(t);
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'All Open Tasks (' + allTasks.length + ')' },
    },
  ];

  for (const [userId, tasks] of Object.entries(byPerson)) {
    const name = tasks[0].slackUserName || userId;
    const overdueCount = tasks.filter(t => t.status === 'OVERDUE' || t.status === 'ESCALATED').length;
    const overdueLabel = overdueCount > 0 ? '  :rotating_light: ' + overdueCount + ' overdue' : '';
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*<@' + userId + '>* — ' + tasks.length + ' task' + (tasks.length > 1 ? 's' : '') + overdueLabel,
      },
    });

    const taskLines = tasks.map(t => {
      const statusIcon =
        t.status === 'OVERDUE' || t.status === 'ESCALATED' ? ':rotating_light:' :
        t.status === 'CONFIRMED' ? ':pushpin:' : ':question:';
      const dl = t.deadline instanceof Date ? t.deadline : (t.deadline ? new Date(Number(t.deadline) * 1000) : null);
      const deadlineStr = dl
        ? dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'no deadline';
      const sourceTag = t.source === 'zoom' ? ' :video_camera:' : t.source === 'manual' ? ' :pencil:' : '';

      // Build thread link if we have channel + message timestamp
      let threadLink = '';
      if (t.sourceChannelId && (t.sourceThreadTs || t.sourceMessageTs)) {
        const ts = (t.sourceThreadTs || t.sourceMessageTs)!.replace('.', '');
        threadLink = '  <https://slack.com/archives/' + t.sourceChannelId + '/p' + ts + '|:link: view>';
      }

      return statusIcon + ' ' + t.description + ' — due ' + deadlineStr + sourceTag + threadLink + '  `' + t.id + '`';
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: taskLines.join('\n'),
      },
    });

    blocks.push({ type: 'divider' });
  }

  return blocks;
}

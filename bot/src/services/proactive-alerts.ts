import { getKnowledgeGaps, getAccuracyStats } from './feedback-service';
import { getSOPCandidates } from './topic-tracker';
import { getOverdueTasks } from '../tasks/task-service';

// --- Types ---

export type AlertPriority = 'high' | 'medium' | 'low';

export interface ProactiveAlert {
  type: 'knowledge_gap' | 'sop_candidate' | 'accuracy_warning' | 'overdue_surge';
  priority: AlertPriority;
  title: string;
  detail: string;
}

// --- Alert generators ---

function knowledgeGapAlerts(): ProactiveAlert[] {
  const gaps = getKnowledgeGaps(5);
  if (gaps.length === 0) return [];

  return gaps.map((gap) => ({
    type: 'knowledge_gap' as const,
    priority: gap.occurrences >= 3 ? 'high' : 'medium' as AlertPriority,
    title: `Knowledge gap: "${gap.question.slice(0, 60)}${gap.question.length > 60 ? '...' : ''}"`,
    detail: `Asked ${gap.occurrences} time${gap.occurrences > 1 ? 's' : ''} with low-confidence answers. Consider adding documentation.`,
  }));
}

function sopCandidateAlerts(): ProactiveAlert[] {
  const candidates = getSOPCandidates();
  if (candidates.length === 0) return [];

  return candidates.slice(0, 5).map((c) => ({
    type: 'sop_candidate' as const,
    priority: 'medium' as AlertPriority,
    title: `SOP candidate ready: "${c.topic}"`,
    detail: `Topic has come up ${c.occurrences} times. Run \`/sop ${c.topic}\` to generate a Standard Operating Procedure.`,
  }));
}

function accuracyAlerts(): ProactiveAlert[] {
  const stats = getAccuracyStats();
  if (stats.total === 0) return [];

  const rated = stats.correct + stats.incorrect;
  if (rated < 5) return []; // Not enough data to warn

  if (stats.accuracyRate < 0.7) {
    const pct = Math.round(stats.accuracyRate * 100);
    return [
      {
        type: 'accuracy_warning' as const,
        priority: stats.accuracyRate < 0.5 ? 'high' : 'medium',
        title: `Knowledge bot accuracy is ${pct}%`,
        detail: `${stats.incorrect} incorrect answer${stats.incorrect > 1 ? 's' : ''} out of ${rated} rated. Review recent Q&A corrections or add better source documents.`,
      },
    ];
  }

  return [];
}

function overdueAlerts(): ProactiveAlert[] {
  const overdue = getOverdueTasks();
  if (overdue.length < 10) return [];

  return [
    {
      type: 'overdue_surge' as const,
      priority: overdue.length >= 20 ? 'high' : 'medium',
      title: `Overdue task surge: ${overdue.length} tasks past deadline`,
      detail: `${overdue.length} tasks are overdue across the team. Use \`/alltasks\` to review and consider pushing or reassigning.`,
    },
  ];
}

// --- Main export ---

export function generateProactiveAlerts(): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [
    ...accuracyAlerts(),
    ...overdueAlerts(),
    ...knowledgeGapAlerts(),
    ...sopCandidateAlerts(),
  ];

  // Sort: high → medium → low
  const priorityOrder: Record<AlertPriority, number> = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return alerts;
}

// --- Slack message formatter ---

export function formatAlertsForSlack(alerts: ProactiveAlert[]): string {
  if (alerts.length === 0) {
    return ':white_check_mark: *Daily Knowledge Bot Report* — No issues to flag. Everything looks healthy!';
  }

  const high = alerts.filter((a) => a.priority === 'high');
  const medium = alerts.filter((a) => a.priority === 'medium');

  const lines: string[] = [':robot_face: *Daily Knowledge Bot Report*', ''];

  if (high.length > 0) {
    lines.push(':red_circle: *High Priority*');
    for (const alert of high) {
      lines.push(`• *${alert.title}*`);
      lines.push(`  ${alert.detail}`);
    }
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push(':yellow_circle: *Medium Priority*');
    for (const alert of medium) {
      lines.push(`• *${alert.title}*`);
      lines.push(`  ${alert.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

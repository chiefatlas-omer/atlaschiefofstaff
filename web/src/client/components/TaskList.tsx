import React, { useState } from 'react';
import { Task, api } from '../lib/api';

const STATUS_COLORS: Record<Task['status'], string> = {
  DETECTED:  'bg-amber-50 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border border-blue-200',
  OVERDUE:   'bg-red-50 text-red-700 border border-red-200',
  ESCALATED: 'bg-red-50 text-red-700 border border-red-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  DISMISSED: 'bg-gray-50 text-gray-500 border border-gray-200',
};

const PUSH_PRESETS = [
  { label: '+1 day', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+7 days', days: 7 },
  { label: '+14 days', days: 14 },
];

function getSlackPermalink(task: Task): string | null {
  // Build Slack permalink from channel + message timestamp
  if (task.sourceChannelId && task.sourceMessageTs) {
    const tsFormatted = task.sourceMessageTs.replace('.', '');
    return `https://youratlas.slack.com/archives/${task.sourceChannelId}/p${tsFormatted}`;
  }
  return null;
}

function PushDropdown({ taskId, onAction }: { taskId: string; onAction?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);

  const handlePush = async (days: number) => {
    setPushing(true);
    try {
      await api.pushTask(taskId, days);
      onAction?.();
    } catch { /* ignore */ }
    setPushing(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={pushing}
        className="text-xs font-medium px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors"
        title="Push deadline"
      >
        {pushing ? '...' : 'Push \u25BE'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[100px]">
          {PUSH_PRESETS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => handlePush(days)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#4F3588] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return '\u2014';
  try {
    return new Date(deadline).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return deadline;
  }
}

interface TaskListProps {
  tasks: Task[];
  onTaskAction?: () => void;
}

export default function TaskList({ tasks, onTaskAction }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-gray-400 text-sm space-y-3">
        <p className="font-medium text-gray-500">What you'll see here:</p>
        <div className="font-mono text-xs space-y-1">
          <p>{'\u2610'} Send revised proposal to Lakeside Properties · Due tomorrow</p>
          <p>{'\u2610'} Review Matt's onboarding notes for Premier Lawns · Due Friday</p>
          <p>{'\u2611'} Follow up with Greenscape about irrigation contract · Completed</p>
        </div>
      </div>
    );
  }

  const isOpen = (status: Task['status']) =>
    status !== 'COMPLETED' && status !== 'DISMISSED';

  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: string; description: string } | null>(null);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleComplete = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    try {
      await api.completeTask(id);
      setCelebrateId(id);
      setTimeout(() => setCelebrateId(null), 1200);
      // Show undo toast for 5 seconds
      setUndoToast({ id, description: task?.description ?? 'Task' });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
      onTaskAction?.();
    } catch { /* ignore */ }
  };

  const handleUndo = async (id: string) => {
    try {
      // Reopen the task by pushing it (sets status back to CONFIRMED)
      await api.pushTask(id, 0);
      setUndoToast(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      onTaskAction?.();
    } catch { /* ignore */ }
  };

  const handleDismiss = async (id: string) => {
    if (!confirm('Dismiss this task? It will be hidden from your list.')) return;
    try {
      await api.dismissTask(id);
      onTaskAction?.();
    } catch { /* ignore */ }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-medium">Task</th>
            <th className="text-left py-2 pr-4 font-medium">Owner</th>
            <th className="text-left py-2 pr-4 font-medium">Status</th>
            <th className="text-left py-2 pr-4 font-medium">Deadline</th>
            <th className="text-left py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className={`border-b border-gray-100 hover:bg-purple-50/50 transition-all duration-300 ${celebrateId === task.id ? 'bg-emerald-50 scale-[0.98]' : ''}`}
            >
              <td className="py-3 pr-4 max-w-xs">
                <span className="text-gray-700 truncate block" title={task.description}>
                  {task.description}
                </span>
                {(() => {
                  if (task.source === 'zoom') {
                    const label = task.zoomMeetingTitle
                      ? `📞 ${task.zoomMeetingTitle}${task.zoomBusinessName ? ` · ${task.zoomBusinessName}` : ''}`
                      : '📞 From Zoom call';
                    return (
                      <span className="text-xs text-gray-400 mt-0.5 inline-flex items-center gap-1 truncate max-w-xs" title={label}>
                        {label}
                      </span>
                    );
                  }
                  const link = getSlackPermalink(task);
                  return link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#4F3588] hover:underline mt-0.5 inline-block"
                    >
                      View in Slack {'\u2197'}
                    </a>
                  ) : task.source === 'desktop' ? (
                    <span className="text-xs text-gray-400 mt-0.5 inline-flex items-center gap-1">
                      🎙️ From voice command
                    </span>
                  ) : null;
                })()}
              </td>
              <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                {task.slackUserName ?? '\u2014'}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={[
                    'inline-block px-2 py-0.5 rounded text-xs font-medium',
                    STATUS_COLORS[task.status] ?? 'bg-gray-50 text-gray-400',
                  ].join(' ')}
                >
                  {task.status}
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                {formatDeadline(task.deadline)}
              </td>
              <td className="py-3 whitespace-nowrap">
                {isOpen(task.status) && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="text-xs font-medium px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      title="Complete"
                    >
                      Complete
                    </button>
                    <PushDropdown taskId={task.id} onAction={onTaskAction} />
                    <button
                      onClick={() => handleDismiss(task.id)}
                      className="text-xs font-medium px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                      title="Dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Undo toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-[slideUp_0.3s_ease-out]">
          <span className="text-sm">✅ Task completed</span>
          <button
            onClick={() => handleUndo(undoToast.id)}
            className="text-sm font-semibold text-[#A78BFA] hover:text-white transition-colors underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

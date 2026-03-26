import React from 'react';
import { Task, api } from '../lib/api';

const STATUS_COLORS: Record<Task['status'], string> = {
  DETECTED:  'bg-amber-50 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border border-blue-200',
  OVERDUE:   'bg-red-50 text-red-700 border border-red-200',
  ESCALATED: 'bg-red-50 text-red-700 border border-red-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  DISMISSED: 'bg-gray-50 text-gray-500 border border-gray-200',
};

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

  const handleComplete = async (id: string) => {
    try {
      await api.completeTask(id);
      onTaskAction?.();
    } catch { /* ignore */ }
  };

  const handlePush = async (id: string) => {
    try {
      await api.pushTask(id, 1);
      onTaskAction?.();
    } catch { /* ignore */ }
  };

  const handleDismiss = async (id: string) => {
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
              className="border-b border-gray-100 hover:bg-purple-50/50 transition-colors"
            >
              <td className="py-3 pr-4 max-w-xs">
                <span className="text-gray-700 truncate block" title={task.description}>
                  {task.description}
                </span>
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
                    <button
                      onClick={() => handlePush(task.id)}
                      className="text-xs font-medium px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors"
                      title="Push 1 day"
                    >
                      Push
                    </button>
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
    </div>
  );
}

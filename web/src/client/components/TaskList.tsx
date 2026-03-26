import React from 'react';
import { Task } from '../lib/api';

const STATUS_COLORS: Record<Task['status'], string> = {
  DETECTED:  'bg-amber-50 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border border-blue-200',
  OVERDUE:   'bg-red-50 text-red-700 border border-red-200',
  ESCALATED: 'bg-red-50 text-red-700 border border-red-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  DISMISSED: 'bg-gray-50 text-gray-500 border border-gray-200',
};

function formatDeadline(deadline: string | null): string {
  if (!deadline) return '—';
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
}

export default function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-4">No tasks to display.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-medium">Task</th>
            <th className="text-left py-2 pr-4 font-medium">Owner</th>
            <th className="text-left py-2 pr-4 font-medium">Status</th>
            <th className="text-left py-2 font-medium">Deadline</th>
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
                {task.slackUserName ?? '—'}
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
              <td className="py-3 text-gray-500 whitespace-nowrap">
                {formatDeadline(task.deadline)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

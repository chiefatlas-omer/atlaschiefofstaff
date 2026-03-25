import React from 'react';
import { Task } from '../lib/api';

const STATUS_COLORS: Record<Task['status'], string> = {
  DETECTED:  'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  CONFIRMED: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  OVERDUE:   'bg-red-900/50 text-red-300 border border-red-700',
  ESCALATED: 'bg-red-900/50 text-red-300 border border-red-700',
  COMPLETED: 'bg-green-900/50 text-green-300 border border-green-700',
  DISMISSED: 'bg-gray-800 text-gray-500 border border-gray-700',
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
      <p className="text-gray-500 text-sm py-4">No tasks to display.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-gray-800">
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
              className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors"
            >
              <td className="py-3 pr-4 max-w-xs">
                <span className="text-gray-200 truncate block" title={task.description}>
                  {task.description}
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">
                {task.owner ?? '—'}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={[
                    'inline-block px-2 py-0.5 rounded text-xs font-medium',
                    STATUS_COLORS[task.status] ?? 'bg-gray-800 text-gray-400',
                  ].join(' ')}
                >
                  {task.status}
                </span>
              </td>
              <td className="py-3 text-gray-400 whitespace-nowrap">
                {formatDeadline(task.deadline)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

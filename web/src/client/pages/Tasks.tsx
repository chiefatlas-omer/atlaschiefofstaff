import React, { useEffect, useState } from 'react';
import { api, Task, TaskStats } from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskList from '../components/TaskList';
import MetricCard from '../components/MetricCard';
import { SkeletonCard, SkeletonTable } from '../components/Skeleton';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const [selectedPerson, setSelectedPerson] = useState<string>('all');

  const loadTasks = () => {
    Promise.all([api.tasks(), api.taskStats()])
      .then(([taskData, statsData]) => {
        setTasks(taskData);
        setStats(statsData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div><div className="h-8 bg-gray-200 rounded w-32 animate-pulse mb-2" /><div className="h-4 bg-gray-100 rounded w-64 animate-pulse" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load tasks: {error}
      </div>
    );
  }

  // Group tasks by person for admin view
  const tasksByPerson: Record<string, { name: string; tasks: Task[]; overdue: number; open: number }> = {};
  for (const task of tasks) {
    const key = task.slackUserId;
    if (!tasksByPerson[key]) {
      tasksByPerson[key] = { name: task.slackUserName ?? key, tasks: [], overdue: 0, open: 0 };
    }
    tasksByPerson[key].tasks.push(task);
    if (task.status === 'OVERDUE' || task.status === 'ESCALATED') tasksByPerson[key].overdue++;
    if (task.status !== 'COMPLETED' && task.status !== 'DISMISSED') tasksByPerson[key].open++;
  }

  const sortedPeople = Object.entries(tasksByPerson)
    .sort((a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open);

  const filteredTasks = selectedPerson === 'all'
    ? tasks
    : tasks.filter((t) => t.slackUserId === selectedPerson);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <p className="text-gray-500 text-sm mt-1">
          {isAdmin
            ? 'Executive view — track team accountability and follow-through'
            : 'Your open tasks detected from Slack, Zoom, and manual input'
          }
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total" value={stats.total} color="purple" />
            <MetricCard label="Open" value={stats.open} color="blue" />
            <MetricCard label="Completed" value={stats.completed} color="green" />
            <MetricCard
              label="Overdue"
              value={stats.overdue}
              color={stats.overdue > 0 ? 'red' : 'green'}
              subtitle={stats.overdue > 0 ? 'Needs attention' : 'All on track'}
            />
          </div>
        </section>
      )}

      {/* Admin: Team accountability table */}
      {isAdmin && sortedPeople.length > 1 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Team Accountability</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Team Member</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Open</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {sortedPeople.map(([slackId, person]) => (
                  <tr
                    key={slackId}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors ${selectedPerson === slackId ? 'bg-[#FAF9FE]' : ''}`}
                    onClick={() => setSelectedPerson(selectedPerson === slackId ? 'all' : slackId)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{person.name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{person.open}</td>
                    <td className="px-4 py-3 text-center">
                      {person.overdue > 0 ? (
                        <span className="text-red-600 font-semibold">{person.overdue}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {person.overdue > 0 ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          Behind
                        </span>
                      ) : person.open > 0 ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          On Track
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[#4F3588]">
                      {selectedPerson === slackId ? 'Viewing ▼' : 'View →'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Person filter indicator */}
      {isAdmin && selectedPerson !== 'all' && tasksByPerson[selectedPerson] && (
        <div className="flex items-center justify-between bg-[#FAF9FE] rounded-lg border border-[#4F3588]/10 px-4 py-2">
          <span className="text-sm text-[#4F3588] font-medium">
            Showing tasks for: {tasksByPerson[selectedPerson].name}
          </span>
          <button
            onClick={() => setSelectedPerson('all')}
            className="text-xs text-[#4F3588] hover:underline"
          >
            Show all →
          </button>
        </div>
      )}

      {/* Task list */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <TaskList tasks={filteredTasks} onTaskAction={loadTasks} />
        </div>
      </section>
    </div>
  );
}

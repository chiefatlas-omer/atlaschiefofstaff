import React, { useEffect, useState } from 'react';
import { api, Task, TaskStats } from '../lib/api';
import TaskList from '../components/TaskList';
import MetricCard from '../components/MetricCard';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.tasks(), api.taskStats()])
      .then(([taskData, statsData]) => {
        setTasks(taskData);
        setStats(statsData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading tasks...
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <p className="text-gray-500 text-sm mt-1">All open tasks detected from Slack, Zoom, and manual input</p>
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

      {/* Task list */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <TaskList tasks={tasks} />
        </div>
      </section>
    </div>
  );
}

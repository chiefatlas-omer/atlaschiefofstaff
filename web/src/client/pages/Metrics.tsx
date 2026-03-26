import React, { useEffect, useState } from 'react';
import { api, DashboardData, Task } from '../lib/api';
import MetricCard from '../components/MetricCard';
import TaskList from '../components/TaskList';

export default function Metrics() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.dashboard(), api.tasks()])
      .then(([dash, taskList]) => {
        setDashboard(dash);
        setTasks(taskList);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading metrics...
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Failed to load metrics: {error ?? 'Unknown error'}
      </div>
    );
  }

  const accuracy =
    dashboard.knowledgeBot.interactions > 0
      ? Math.round(
          (dashboard.knowledgeBot.correctAnswers / dashboard.knowledgeBot.interactions) * 100
        )
      : 0;

  const meetingsPrepPct =
    dashboard.meetings.total > 0
      ? Math.round((dashboard.meetings.meetingsPrepped / dashboard.meetings.total) * 100)
      : 0;

  const overdueTasks = tasks.filter((t) => t.status === 'OVERDUE' || t.status === 'ESCALATED');

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Metrics</h1>
        <p className="text-gray-500 text-sm mt-1">Impact and outcome dashboards</p>
      </div>

      {/* Impact This Week */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Impact This Week</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Tasks Completed"
            value={dashboard.tasks.completed}
            color="green"
            subtitle="All time"
          />
          <MetricCard
            label="Meetings Prepped"
            value={dashboard.meetings.meetingsPrepped}
            color="blue"
            subtitle={`${meetingsPrepPct}% of ${dashboard.meetings.total} total (with prep brief)`}
          />
          <MetricCard
            label="Decisions Logged"
            value={dashboard.decisions.recentThirtyDays}
            color="purple"
            subtitle="Last 30 days"
          />
        </div>
      </section>

      {/* Knowledge */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Knowledge</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Active SOPs"
            value={dashboard.sops.published}
            color="green"
            subtitle={`${dashboard.sops.total} total`}
          />
          <MetricCard
            label="Bot Accuracy"
            value={`${accuracy}%`}
            color={accuracy >= 80 ? 'green' : accuracy >= 60 ? 'yellow' : 'red'}
            subtitle={`${dashboard.knowledgeBot.interactions} interactions`}
          />
          <MetricCard
            label="Questions Answered"
            value={dashboard.knowledgeBot.interactions}
            color="blue"
            subtitle={`${dashboard.knowledgeBot.correctAnswers} correct`}
          />
        </div>
      </section>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-red-400 mb-4">
            Overdue Tasks ({overdueTasks.length})
          </h2>
          <div className="bg-gray-900 rounded-xl border border-red-800/50 p-4">
            <TaskList tasks={overdueTasks} />
          </div>
        </section>
      )}

      {/* All Open Tasks */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">
          All Open Tasks ({tasks.length})
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <TaskList tasks={tasks} />
        </div>
      </section>
    </div>
  );
}

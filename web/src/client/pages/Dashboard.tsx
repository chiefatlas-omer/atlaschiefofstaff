import React, { useEffect, useState } from 'react';
import { api, DashboardData } from '../lib/api';
import MetricCard from '../components/MetricCard';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load dashboard: {error ?? 'Unknown error'}
      </div>
    );
  }

  const accuracy =
    data.knowledgeBot.interactions > 0
      ? Math.round((data.knowledgeBot.correctAnswers / data.knowledgeBot.interactions) * 100)
      : 0;

  const knowledgeGap =
    data.topics.total > 0
      ? Math.round(((data.topics.total - data.topics.sopGenerated) / data.topics.total) * 100)
      : 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
        <p className="text-gray-500 text-sm mt-1">Atlas Chief of Staff — live metrics</p>
      </div>

      {/* Tasks */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasks</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Tasks" value={data.tasks.total} color="purple" />
          <MetricCard label="Open Tasks" value={data.tasks.open} color="blue" />
          <MetricCard label="Completed" value={data.tasks.completed} color="green" />
          <MetricCard
            label="Overdue"
            value={data.tasks.overdue}
            color={data.tasks.overdue > 0 ? 'red' : 'green'}
            subtitle={data.tasks.overdue > 0 ? 'Needs attention' : 'All on track'}
          />
        </div>
      </section>

      {/* Intelligence */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Intelligence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Meetings"
            value={data.meetings.total}
            color="purple"
          />
          <MetricCard
            label="Meetings (30d)"
            value={data.meetings.recentThirtyDays}
            color="blue"
          />
          <MetricCard
            label="Decisions Logged"
            value={data.decisions.total}
            color="green"
            subtitle={`${data.decisions.recentThirtyDays} in last 30 days`}
          />
          <MetricCard
            label="Bot Accuracy"
            value={`${accuracy}%`}
            color={accuracy >= 80 ? 'green' : accuracy >= 60 ? 'yellow' : 'red'}
            subtitle={`${data.knowledgeBot.interactions} interactions`}
          />
        </div>
      </section>

      {/* Knowledge Base */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Knowledge Base</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total SOPs"
            value={data.sops.total}
            color="purple"
            subtitle={`${data.sops.published} published`}
          />
          <MetricCard
            label="Knowledge Entries"
            value={data.knowledgeBot.entries}
            color="blue"
          />
          <MetricCard
            label="Topics Tracked"
            value={data.topics.total}
            color="green"
            subtitle={`${data.topics.sopGenerated} with SOPs`}
          />
          <MetricCard
            label="Knowledge Gap"
            value={`${knowledgeGap}%`}
            color={knowledgeGap > 40 ? 'red' : knowledgeGap > 20 ? 'yellow' : 'green'}
            subtitle="Topics without SOPs"
          />
        </div>
      </section>

      {/* Trending Topics placeholder */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Trending Topics</h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {data.topics.total === 0 ? (
            <p className="text-gray-400 text-sm">No topics tracked yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-700 text-sm">
                <span className="font-semibold text-[#4F3588]">{data.topics.total}</span> total
                topics tracked &mdash;{' '}
                <span className="font-semibold text-emerald-600">{data.topics.sopGenerated}</span>{' '}
                have generated SOPs.
              </p>
              <p className="text-gray-400 text-xs">
                For detailed topic breakdowns, use <code className="text-[#4F3588]">/topics</code>{' '}
                in Slack.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

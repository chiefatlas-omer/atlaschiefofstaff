import React, { useEffect, useState } from 'react';
import { api, DigestData } from '../lib/api';
import MetricCard from '../components/MetricCard';

const OUTCOME_COLOR: Record<string, string> = {
  closed_won: 'bg-green-900/40 text-green-300 border-green-700',
  demo_scheduled: 'bg-blue-900/40 text-blue-300 border-blue-700',
  follow_up: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  no_decision: 'bg-gray-800 text-gray-400 border-gray-700',
  churned: 'bg-red-900/40 text-red-300 border-red-700',
  unknown: 'bg-gray-800 text-gray-500 border-gray-700',
};

const AWARENESS_COLOR: Record<string, string> = {
  problem_aware: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  solution_aware: 'bg-blue-900/40 text-blue-300 border-blue-700',
  product_aware: 'bg-purple-900/40 text-purple-300 border-purple-700',
  most_aware: 'bg-green-900/40 text-green-300 border-green-700',
  unaware: 'bg-gray-800 text-gray-400 border-gray-700',
  unknown: 'bg-gray-800 text-gray-500 border-gray-700',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={['text-xs px-2 py-0.5 rounded border font-medium', colorClass].join(' ')}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

export default function SalesIntel() {
  const [data, setData] = useState<DigestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .salesDigest()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading sales intelligence...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Failed to load sales intelligence: {error ?? 'Unknown error'}
      </div>
    );
  }

  const demosScheduled = data.outcomeBreakdown['demo_scheduled'] ?? 0;
  const closedWon = data.outcomeBreakdown['closed_won'] ?? 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Sales Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">Weekly call analysis — last 7 days</p>
      </div>

      {/* Metric cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label="Calls This Week"
            value={data.totalCalls}
            color="purple"
            subtitle="analyzed by AI"
          />
          <MetricCard
            label="Demos Scheduled"
            value={demosScheduled}
            color="blue"
          />
          <MetricCard
            label="Closed Won"
            value={closedWon}
            color="green"
          />
        </div>
      </section>

      {/* Awareness breakdown */}
      {Object.keys(data.awarenessBreakdown).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Prospect Awareness Breakdown</h2>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.awarenessBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([level, count]) => (
                  <div key={level} className="flex items-center gap-2">
                    <Badge
                      label={level}
                      colorClass={AWARENESS_COLOR[level] ?? 'bg-gray-800 text-gray-400 border-gray-700'}
                    />
                    <span className="text-gray-400 text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Outcome breakdown */}
      {Object.keys(data.outcomeBreakdown).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Outcome Breakdown</h2>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.outcomeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([outcome, count]) => (
                  <div key={outcome} className="flex items-center gap-2">
                    <Badge
                      label={outcome}
                      colorClass={OUTCOME_COLOR[outcome] ?? 'bg-gray-800 text-gray-400 border-gray-700'}
                    />
                    <span className="text-gray-400 text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent calls list */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Recent Calls</h2>
        {data.calls.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-gray-500 text-sm">
            No calls analyzed this week yet.
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                  <th className="text-left px-4 py-3 font-medium">Rep</th>
                  <th className="text-left px-4 py-3 font-medium">Outcome</th>
                  <th className="text-left px-4 py-3 font-medium">Awareness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-200 max-w-xs truncate">
                      {call.title ?? 'Untitled'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {call.businessName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {call.repName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {call.outcome ? (
                        <Badge
                          label={call.outcome}
                          colorClass={OUTCOME_COLOR[call.outcome] ?? 'bg-gray-800 text-gray-400 border-gray-700'}
                        />
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {call.awarenessLevel ? (
                        <Badge
                          label={call.awarenessLevel}
                          colorClass={AWARENESS_COLOR[call.awarenessLevel] ?? 'bg-gray-800 text-gray-400 border-gray-700'}
                        />
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

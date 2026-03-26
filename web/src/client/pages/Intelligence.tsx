import React, { useEffect, useState } from 'react';
import { api, DigestData, ProductIntelData, CoachingSnapshot } from '../lib/api';
import MetricCard from '../components/MetricCard';

// ─── Shared badge helpers ────────────────────────────────────────────────────

const OUTCOME_COLOR: Record<string, string> = {
  closed_won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  demo_scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  follow_up: 'bg-amber-50 text-amber-700 border-amber-200',
  no_decision: 'bg-gray-50 text-gray-500 border-gray-200',
  churned: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-gray-50 text-gray-400 border-gray-200',
};

const AWARENESS_COLOR: Record<string, string> = {
  problem_aware: 'bg-amber-50 text-amber-700 border-amber-200',
  solution_aware: 'bg-blue-50 text-blue-700 border-blue-200',
  product_aware: 'bg-purple-50 text-[#4F3588] border-purple-200',
  most_aware: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unaware: 'bg-gray-50 text-gray-500 border-gray-200',
  unknown: 'bg-gray-50 text-gray-400 border-gray-200',
};

const TYPE_EMOJI: Record<string, string> = {
  feature_request: '✨',
  bug: '🐛',
  churn_risk: '⚠️',
  pricing_concern: '💰',
  competitor_mention: '🔄',
  integration_request: '🔗',
  performance_issue: '⚡',
  ux_friction: '😤',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-amber-600',
  medium: 'text-gray-600',
  low: 'text-gray-400',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border border-red-200',
  high: 'bg-amber-50 text-amber-700 border border-amber-200',
  medium: 'bg-amber-50 text-amber-600 border border-amber-200',
  low: 'bg-gray-50 text-gray-500 border border-gray-200',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={['text-xs px-2 py-0.5 rounded border font-medium', colorClass].join(' ')}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

type TabId = 'calls' | 'product' | 'coaching';

const TABS: { id: TabId; label: string }[] = [
  { id: 'calls', label: 'Calls' },
  { id: 'product', label: 'Product Signals' },
  { id: 'coaching', label: 'Coaching' },
];

// ─── Calls Tab Content ──────────────────────────────────────────────────────

function CallsTab() {
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
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading call intelligence...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load call intelligence: {error ?? 'Unknown error'}
      </div>
    );
  }

  const demosScheduled = data.outcomeBreakdown['demo_scheduled'] ?? 0;
  const closedWon = data.outcomeBreakdown['closed_won'] ?? 0;

  return (
    <div className="space-y-8">
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
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Prospect Awareness</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.awarenessBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([level, count]) => (
                  <div key={level} className="flex items-center gap-2">
                    <Badge
                      label={level}
                      colorClass={AWARENESS_COLOR[level] ?? 'bg-gray-50 text-gray-500 border-gray-200'}
                    />
                    <span className="text-gray-500 text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Outcome breakdown */}
      {Object.keys(data.outcomeBreakdown).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Outcome Breakdown</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.outcomeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([outcome, count]) => (
                  <div key={outcome} className="flex items-center gap-2">
                    <Badge
                      label={outcome}
                      colorClass={OUTCOME_COLOR[outcome] ?? 'bg-gray-50 text-gray-500 border-gray-200'}
                    />
                    <span className="text-gray-500 text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent calls list */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Calls</h2>
        {data.calls.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-gray-400 text-sm">
            No calls analyzed this week yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                  <th className="text-left px-4 py-3 font-medium">Rep</th>
                  <th className="text-left px-4 py-3 font-medium">Outcome</th>
                  <th className="text-left px-4 py-3 font-medium">Awareness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.calls.map((call) => (
                  <tr key={call.id} className="hover:bg-purple-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {call.title ?? 'Untitled'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {call.businessName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {call.repName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {call.outcome ? (
                        <Badge
                          label={call.outcome}
                          colorClass={OUTCOME_COLOR[call.outcome] ?? 'bg-gray-50 text-gray-500 border-gray-200'}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {call.awarenessLevel ? (
                        <Badge
                          label={call.awarenessLevel}
                          colorClass={AWARENESS_COLOR[call.awarenessLevel] ?? 'bg-gray-50 text-gray-500 border-gray-200'}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
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

// ─── Product Signals Tab Content ────────────────────────────────────────────

function ProductSignalsTab() {
  const [data, setData] = useState<ProductIntelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .productSignals()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading product intelligence...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load product intelligence: {error ?? 'Unknown error'}
      </div>
    );
  }

  const featureRequests = data.typeBreakdown['feature_request'] ?? 0;
  const bugs = data.typeBreakdown['bug'] ?? 0;
  const churnRisks = data.typeBreakdown['churn_risk'] ?? 0;

  return (
    <div className="space-y-8">
      {/* Metric cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Signals"
            value={data.signals.length}
            color="purple"
          />
          <MetricCard
            label="Feature Requests"
            value={featureRequests}
            color="blue"
          />
          <MetricCard
            label="Bugs Reported"
            value={bugs}
            color={bugs > 0 ? 'red' : 'green'}
          />
          <MetricCard
            label="Churn Risks"
            value={churnRisks}
            color={churnRisks > 0 ? 'red' : 'green'}
          />
        </div>
      </section>

      {/* Signals table */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">All Product Signals</h2>
        {data.signals.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-gray-400 text-sm">
            No product signals captured yet. Signals are extracted automatically from analyzed sales calls.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Severity</th>
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.signals.map((signal) => (
                  <tr key={signal.id} className="hover:bg-purple-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <span className="mr-1.5">{TYPE_EMOJI[signal.type] ?? '📌'}</span>
                      {signal.type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-sm">
                      <p className="truncate">{signal.description}</p>
                      {signal.verbatimQuote && (
                        <p className="text-gray-400 text-xs mt-0.5 truncate italic">
                          "{signal.verbatimQuote}"
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {signal.category ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {signal.severity ? (
                        <span className={['font-medium capitalize', SEVERITY_COLOR[signal.severity] ?? 'text-gray-400'].join(' ')}>
                          {signal.severity}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {signal.businessName ?? '—'}
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

// ─── Coaching Tab Content ───────────────────────────────────────────────────

function CoachingTab() {
  const [snapshots, setSnapshots] = useState<CoachingSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .coaching()
      .then(setSnapshots)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading coaching data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load coaching data: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {snapshots.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm">No coaching data yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Snapshots are generated every Monday after reps complete calls.
          </p>
        </div>
      ) : (
        snapshots.map((snapshot) => {
          const flags = snapshot.coachingFlags ?? [];
          const sortedFlags = [...flags].sort(
            (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
          );

          return (
            <div key={snapshot.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              {/* Rep header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {snapshot.repName ?? snapshot.repSlackId}
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Week of {formatDate(snapshot.weekStart)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#4F3588]">{snapshot.callCount ?? 0}</p>
                  <p className="text-gray-400 text-xs">calls</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 mb-5 text-sm">
                {snapshot.avgTalkRatio !== null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <p className="text-gray-500 text-xs">Avg Talk Ratio</p>
                    <p className={[
                      'font-semibold',
                      (snapshot.avgTalkRatio ?? 0) > 60 ? 'text-red-600' : 'text-emerald-600',
                    ].join(' ')}>
                      {snapshot.avgTalkRatio}%
                    </p>
                  </div>
                )}
                {snapshot.avgQuestionCount !== null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <p className="text-gray-500 text-xs">Avg Questions</p>
                    <p className="font-semibold text-blue-600">{snapshot.avgQuestionCount}</p>
                  </div>
                )}
                {snapshot.avgOpenQuestionRatio !== null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <p className="text-gray-500 text-xs">Open Question %</p>
                    <p className="font-semibold text-[#4F3588]">{snapshot.avgOpenQuestionRatio}%</p>
                  </div>
                )}
              </div>

              {/* Coaching flags */}
              {sortedFlags.length === 0 ? (
                <p className="text-emerald-600 text-sm">No coaching flags this week. Great work!</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                    Coaching Flags ({sortedFlags.length})
                  </p>
                  {sortedFlags.map((flag, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={[
                          'text-xs px-2 py-0.5 rounded font-medium',
                          SEVERITY_BADGE[flag.severity] ?? SEVERITY_BADGE.low,
                        ].join(' ')}>
                          {flag.severity}
                        </span>
                        <span className="text-gray-700 text-sm font-medium">{flag.flag}</span>
                      </div>
                      <p className="text-gray-500 text-xs italic">{flag.observation}</p>
                      <p className="text-gray-700 text-xs">
                        <span className="text-[#4F3588] font-medium">Suggestion:</span>{' '}
                        {flag.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Main Intelligence Page ─────────────────────────────────────────────────

export default function Intelligence() {
  const [activeTab, setActiveTab] = useState<TabId>('calls');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">Call analysis, product signals, and rep coaching</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'text-sm pb-3 transition-colors',
                activeTab === tab.id
                  ? 'text-[#4F3588] border-b-2 border-[#4F3588] font-medium'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'calls' && <CallsTab />}
      {activeTab === 'product' && <ProductSignalsTab />}
      {activeTab === 'coaching' && <CoachingTab />}
    </div>
  );
}

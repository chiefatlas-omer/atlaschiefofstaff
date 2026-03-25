import React, { useEffect, useState } from 'react';
import { api, ProductIntelData } from '../lib/api';
import MetricCard from '../components/MetricCard';

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
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-gray-400',
};

export default function ProductIntel() {
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
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading product intelligence...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Failed to load product intelligence: {error ?? 'Unknown error'}
      </div>
    );
  }

  const featureRequests = data.typeBreakdown['feature_request'] ?? 0;
  const bugs = data.typeBreakdown['bug'] ?? 0;
  const churnRisks = data.typeBreakdown['churn_risk'] ?? 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Product Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">Signals extracted from sales calls</p>
      </div>

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
        <h2 className="text-lg font-semibold text-gray-200 mb-4">All Product Signals</h2>
        {data.signals.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-gray-500 text-sm">
            No product signals captured yet. Signals are extracted automatically from analyzed sales calls.
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Severity</th>
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.signals.map((signal) => (
                  <tr key={signal.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-200 whitespace-nowrap">
                      <span className="mr-1.5">{TYPE_EMOJI[signal.type] ?? '📌'}</span>
                      {signal.type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-sm">
                      <p className="truncate">{signal.description}</p>
                      {signal.verbatimQuote && (
                        <p className="text-gray-500 text-xs mt-0.5 truncate italic">
                          "{signal.verbatimQuote}"
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {signal.category ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {signal.severity ? (
                        <span className={['font-medium capitalize', SEVERITY_COLOR[signal.severity] ?? 'text-gray-400'].join(' ')}>
                          {signal.severity}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
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

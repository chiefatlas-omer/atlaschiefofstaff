import React, { useEffect, useState } from 'react';
import { api, CoachingSnapshot } from '../lib/api';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-900/40 text-red-300 border border-red-700',
  high: 'bg-orange-900/40 text-orange-300 border border-orange-700',
  medium: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
  low: 'bg-gray-800 text-gray-400 border border-gray-700',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

function formatDate(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Coaching() {
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
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading coaching data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Failed to load coaching data: {error}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Coaching</h1>
        <p className="text-gray-500 text-sm mt-1">Weekly per-rep performance snapshots</p>
      </div>

      {snapshots.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-500 text-sm">No coaching data yet</p>
          <p className="text-gray-600 text-xs mt-1">
            Snapshots are generated every Monday after reps complete calls.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {snapshots.map((snapshot) => {
            const flags = snapshot.coachingFlags ?? [];
            const sortedFlags = [...flags].sort(
              (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
            );

            return (
              <div key={snapshot.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                {/* Rep header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">
                      {snapshot.repName ?? snapshot.repSlackId}
                    </h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Week of {formatDate(snapshot.weekStart)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-purple-400">{snapshot.callCount ?? 0}</p>
                    <p className="text-gray-500 text-xs">calls</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-4 mb-5 text-sm">
                  {snapshot.avgTalkRatio !== null && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2">
                      <p className="text-gray-500 text-xs">Avg Talk Ratio</p>
                      <p className={[
                        'font-semibold',
                        (snapshot.avgTalkRatio ?? 0) > 60 ? 'text-red-400' : 'text-green-400',
                      ].join(' ')}>
                        {snapshot.avgTalkRatio}%
                      </p>
                    </div>
                  )}
                  {snapshot.avgQuestionCount !== null && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2">
                      <p className="text-gray-500 text-xs">Avg Questions</p>
                      <p className="font-semibold text-blue-400">{snapshot.avgQuestionCount}</p>
                    </div>
                  )}
                  {snapshot.avgOpenQuestionRatio !== null && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2">
                      <p className="text-gray-500 text-xs">Open Question %</p>
                      <p className="font-semibold text-purple-400">{snapshot.avgOpenQuestionRatio}%</p>
                    </div>
                  )}
                </div>

                {/* Coaching flags */}
                {sortedFlags.length === 0 ? (
                  <p className="text-green-400 text-sm">No coaching flags this week. Great work!</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
                      Coaching Flags ({sortedFlags.length})
                    </p>
                    {sortedFlags.map((flag, i) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={[
                            'text-xs px-2 py-0.5 rounded font-medium',
                            SEVERITY_BADGE[flag.severity] ?? SEVERITY_BADGE.low,
                          ].join(' ')}>
                            {flag.severity}
                          </span>
                          <span className="text-gray-200 text-sm font-medium">{flag.flag}</span>
                        </div>
                        <p className="text-gray-400 text-xs italic">{flag.observation}</p>
                        <p className="text-gray-300 text-xs">
                          <span className="text-purple-400 font-medium">Suggestion:</span>{' '}
                          {flag.suggestion}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api, BriefingData } from '../lib/api';
import ActivityFeed from '../components/ActivityFeed';
import type { ActivityItem } from '../components/ActivityFeed';

export default function Briefing() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .briefing()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading briefing...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load briefing: {error ?? 'Unknown error'}
      </div>
    );
  }

  const attentionItems = data.needsAttention;
  const hasAttention = attentionItems.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{data.greeting}</h1>
        <span className="text-gray-500 text-sm">{data.date}</span>
      </div>

      {/* ── Needs Your Attention ──────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Needs Your Attention
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {!hasAttention ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-sm">
            All clear — nothing needs your attention right now.
          </div>
        ) : (
          <div className="space-y-3">
            {attentionItems.map((item, i) => {
              let bgClass = '';
              let indicator = '';

              if (item.type === 'overdue_task') {
                bgClass = 'bg-red-50 border-red-200';
                indicator = '\u{1F534}';
              } else if (item.type === 'risk_flag') {
                bgClass = 'bg-amber-50 border-amber-200';
                indicator = '\u26A0\uFE0F';
              } else if (item.type === 'unprepped_meeting') {
                bgClass = 'bg-blue-50 border-blue-200';
                indicator = '\u{1F4C5}';
              }

              const labelMap: Record<string, string> = {
                overdue_task: 'Overdue task',
                risk_flag: 'Risk detected',
                unprepped_meeting: 'Needs prep',
              };

              return (
                <div
                  key={`${item.type}-${i}`}
                  className={`border rounded-xl p-4 ${bgClass}`}
                >
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    {indicator} {labelMap[item.type] ?? item.type}
                  </p>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.subtitle}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Today's Schedule ──────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Today's Schedule
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {data.todaysMeetings.length === 0 ? (
          <p className="text-gray-400 text-sm">No meetings scheduled today.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
            {data.todaysMeetings.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3">
                <span className="text-sm text-gray-400 font-mono w-20 flex-shrink-0">
                  {m.time}
                </span>
                <span className="text-sm text-gray-900 font-medium flex-1">{m.title}</span>
                {m.hasPrep ? (
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Prepped
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    No prep
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── This Week + Recent Activity (side by side) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* This Week */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              This Week
            </h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="grid grid-cols-2 gap-4">
              <StatItem
                value={data.weekSummary.callsAnalyzed}
                label="calls analyzed"
              />
              <StatItem
                value={data.weekSummary.followUpsSent}
                label="follow-ups sent"
              />
              <StatItem
                value={data.weekSummary.tasksCompleted}
                label="tasks completed"
              />
              <StatItem
                value={`${data.weekSummary.hoursSaved}h`}
                label={`saved ($${data.weekSummary.roiDollars})`}
              />
            </div>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recent Activity
            </h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <ActivityFeed
              items={data.recentActivity as ActivityItem[]}
              maxItems={8}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

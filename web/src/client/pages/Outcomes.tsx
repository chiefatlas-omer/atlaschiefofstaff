import React, { useEffect, useState } from 'react';
import { api, OutcomeData, LeaderboardEntry } from '../lib/api';
import MetricCard from '../components/MetricCard';

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-gray-400 text-xs ml-1">—</span>;
  }
  if (pct > 0) {
    return (
      <span className="text-emerald-600 text-xs font-semibold ml-1">
        ↑ {pct}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="text-red-600 text-xs font-semibold ml-1">
        ↓ {Math.abs(pct)}%
      </span>
    );
  }
  return <span className="text-gray-400 text-xs ml-1">→ 0%</span>;
}

interface WoWCardProps {
  label: string;
  thisWeek: number;
  pct: number | null;
  unit?: string;
}

function WoWCard({ label, thisWeek, pct, unit }: WoWCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-gray-500 text-sm font-medium mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
          {thisWeek}
          {unit && <span className="text-lg ml-0.5 text-gray-400">{unit}</span>}
        </span>
        <TrendBadge pct={pct} />
      </div>
      <p className="text-gray-400 text-xs mt-1">vs last week</p>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  rows: Array<{ label: string; value: string | number; highlight?: boolean }>;
}

function SectionCard({ title, rows }: SectionCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="space-y-3">
        {rows.map(({ label, value, highlight }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">{label}</span>
            <span
              className={[
                'text-sm font-bold',
                highlight ? 'text-emerald-600' : 'text-gray-900',
              ].join(' ')}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function LeaderboardSection() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .leaderboard()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-gray-400 text-sm py-4">Loading leaderboard...</div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-gray-400 text-sm py-4">
        No activity this week yet — complete tasks or analyze calls to appear here.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {entries.map((entry, idx) => (
        <div
          key={entry.name}
          className={[
            'flex items-center gap-3 px-5 py-3',
            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50',
            idx < entries.length - 1 ? 'border-b border-gray-100' : '',
          ].join(' ')}
        >
          {/* Rank */}
          <span className="text-lg w-8 flex-shrink-0 text-center">
            {entry.rank <= 3 ? RANK_MEDALS[entry.rank - 1] : `${entry.rank}.`}
          </span>

          {/* Name */}
          <span className="flex-1 text-sm font-medium text-gray-900">{entry.name}</span>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              <span className="font-semibold text-gray-700">{entry.tasksCompleted}</span> tasks
            </span>
            <span>
              <span className="font-semibold text-gray-700">{entry.callsAnalyzed}</span> calls
            </span>
            {entry.latestGrade && (
              <span
                className={[
                  'font-bold px-2 py-0.5 rounded',
                  entry.latestGrade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                  entry.latestGrade === 'B+' ? 'bg-blue-100 text-blue-700' :
                  entry.latestGrade === 'B' ? 'bg-sky-100 text-sky-700' :
                  'bg-amber-100 text-amber-700',
                ].join(' ')}
              >
                {entry.latestGrade}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Outcomes() {
  const [data, setData] = useState<OutcomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .outcomes()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading outcome data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load outcomes: {error ?? 'Unknown error'}
      </div>
    );
  }

  const { timeSaved, thisWeek, wow, taskManagement, callIntelligence, knowledgeBase, productIntelligence } = data;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Outcomes</h1>
        <p className="text-gray-500 text-sm mt-1">
          What Atlas Chief actually accomplished — measured in impact, not activity
        </p>
      </div>

      {/* Hero — Time Saved */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">This Month</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Hours Saved"
            value={`${timeSaved.hours}h`}
            color="green"
            subtitle="Meetings × 15m + follow-ups × 10m + tasks × 5m + queries × 3m"
          />
          <MetricCard
            label="Estimated ROI"
            value={`$${timeSaved.roiDollars.toLocaleString()}`}
            color="purple"
            subtitle="At $50/hr fully loaded cost"
          />
          <MetricCard
            label="Minutes Saved"
            value={timeSaved.minutes.toLocaleString()}
            color="blue"
            subtitle="Raw calculation"
          />
        </div>
      </section>

      {/* Week-over-Week Trends */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">This Week vs Last Week</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <WoWCard
            label="Meetings Prepped"
            thisWeek={thisWeek.meetingsPrepped}
            pct={wow.meetingsPrepped}
          />
          <WoWCard
            label="Follow-up Emails Drafted"
            thisWeek={thisWeek.followUpsDrafted}
            pct={wow.followUpsDrafted}
          />
          <WoWCard
            label="Tasks Completed"
            thisWeek={thisWeek.tasksCompleted}
            pct={wow.tasksCompleted}
          />
          <WoWCard
            label="Knowledge Queries Answered"
            thisWeek={thisWeek.knowledgeQueries}
            pct={wow.knowledgeQueries}
          />
          <WoWCard
            label="Product Signals Captured"
            thisWeek={thisWeek.productSignals}
            pct={wow.productSignals}
          />
          <WoWCard
            label="Tasks Detected"
            thisWeek={thisWeek.tasksCreated}
            pct={null}
          />
        </div>
      </section>

      {/* Activity Breakdown */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Breakdown — This Month</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard
            title="Task Management"
            rows={[
              { label: 'Tasks Created', value: taskManagement.totalCreated },
              { label: 'Tasks Completed (this month)', value: taskManagement.completedThisMonth, highlight: true },
              { label: 'Overdue Prevented', value: taskManagement.overduePreventedThisMonth, highlight: true },
              { label: 'Currently Open', value: taskManagement.totalOpen },
              { label: 'All-Time Completion Rate', value: `${taskManagement.completionRatePct}%`, highlight: taskManagement.completionRatePct >= 60 },
            ]}
          />
          <SectionCard
            title="Call Intelligence"
            rows={[
              { label: 'Calls Analyzed', value: callIntelligence.callsAnalyzedThisMonth, highlight: true },
              { label: 'Follow-ups Drafted', value: callIntelligence.followUpsDraftedThisMonth, highlight: true },
              { label: 'Coaching Sessions Delivered', value: callIntelligence.coachingSessionsThisMonth },
              { label: 'Total Calls Analyzed (all time)', value: callIntelligence.totalCallsAnalyzed },
            ]}
          />
          <SectionCard
            title="Knowledge Base"
            rows={[
              { label: 'Queries Answered', value: knowledgeBase.queriesAnsweredThisMonth, highlight: true },
              { label: 'Documents Ingested', value: knowledgeBase.docsIngestedThisMonth },
              { label: 'Knowledge Entries Created', value: knowledgeBase.knowledgeEntriesThisMonth },
              { label: 'SOPs Generated', value: knowledgeBase.sopsGeneratedThisMonth, highlight: true },
              { label: 'Total SOPs', value: knowledgeBase.totalSops },
              { label: 'Total Knowledge Entries', value: knowledgeBase.totalKnowledgeEntries.toLocaleString() },
            ]}
          />
          <SectionCard
            title="Product Intelligence"
            rows={[
              { label: 'Signals Captured', value: productIntelligence.signalsCapturedThisMonth, highlight: true },
              { label: 'Feature Requests', value: productIntelligence.featureRequests },
              { label: 'Bug Reports', value: productIntelligence.bugReports },
              { label: 'Churn Reasons', value: productIntelligence.churnReasons },
              { label: 'Total Signals (all time)', value: productIntelligence.totalSignals },
            ]}
          />
        </div>
      </section>

      {/* ROI Calculator */}
      <section>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">ROI Summary</h2>
          <p className="text-gray-700 text-sm leading-relaxed">
            Atlas Chief has saved your team approximately{' '}
            <span className="text-emerald-600 font-bold">{timeSaved.hours} hours</span> this month,
            equivalent to{' '}
            <span className="text-[#4F3588] font-bold">
              ${timeSaved.roiDollars.toLocaleString()}
            </span>{' '}
            at $50/hr. This includes{' '}
            {data.callIntelligence.callsAnalyzedThisMonth} calls analyzed,{' '}
            {taskManagement.completedThisMonth} tasks managed,{' '}
            {knowledgeBase.queriesAnsweredThisMonth} knowledge queries answered, and{' '}
            {productIntelligence.signalsCapturedThisMonth} product signals captured.
          </p>
        </div>
      </section>

      {/* Team Leaderboard */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Leaderboard — This Week</h2>
          <span className="text-xs text-gray-400">Ranked by tasks × 2 + calls</span>
        </div>
        <LeaderboardSection />
      </section>
    </div>
  );
}

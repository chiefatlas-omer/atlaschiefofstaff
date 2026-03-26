import React, { useEffect, useState } from 'react';
import { api, DigestData, ProductIntelData, CoachingSnapshot, EmailDraft, SOP } from '../lib/api';
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

type TabId = 'calls' | 'product' | 'coaching' | 'email_drafts' | 'sops';

const TABS: { id: TabId; label: string }[] = [
  { id: 'calls', label: 'Call Analysis' },
  { id: 'product', label: 'Product Signals' },
  { id: 'coaching', label: 'Rep Coaching' },
  { id: 'email_drafts', label: 'Follow-Up Emails' },
  { id: 'sops', label: 'Playbooks & SOPs' },
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

  const talkRatioColor = data.avgTalkRatio !== null && data.avgTalkRatio < 60 ? 'green' : 'red';
  const questionsColor = data.avgQuestionsPerCall !== null && data.avgQuestionsPerCall >= 5 ? 'green' : 'red';

  return (
    <div className="space-y-8">
      {/* Gong/Rilla-style metric cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Calls Analyzed"
            value={data.totalCalls}
            color="purple"
            subtitle="this week"
          />
          <MetricCard
            label="Avg Talk Ratio"
            value={data.avgTalkRatio !== null ? `${data.avgTalkRatio}%` : '—'}
            color={talkRatioColor}
            subtitle="target: <60%"
          />
          <MetricCard
            label="Avg Questions/Call"
            value={data.avgQuestionsPerCall ?? '—'}
            color={questionsColor}
            subtitle="target: 5+"
          />
          <MetricCard
            label="Coaching Flags"
            value={data.coachingFlagCount}
            color={data.coachingFlagCount > 0 ? 'red' : 'green'}
            subtitle="this week"
          />
        </div>
      </section>

      {/* Recent calls — Gong/Rilla-style scorecard per call */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Calls</h2>
        {data.calls.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-gray-400 text-sm space-y-4">
            <p className="font-medium text-gray-500">What you'll see here:</p>
            <div className="space-y-3 font-mono text-xs">
              <div>
                <p className="text-gray-500">{'📞'} Greenscape QBR — March 24</p>
                <p className="ml-5">Talk ratio: {'████████░░'} 42% (great!)</p>
                <p className="ml-5">Key insight: Customer interested in automated scheduling module</p>
                <p className="ml-5">Objections: 2 · Pains: 1 · Risk flags: 0</p>
              </div>
              <div>
                <p className="text-gray-500">{'📞'} Lakeside Properties Demo — March 23</p>
                <p className="ml-5">Talk ratio: {'██████████░'} 68% (too high)</p>
                <p className="ml-5">Key insight: Price objection — comparing with competitor</p>
                <p className="ml-5">Objections: 3 · Pains: 2 · Risk flags: 1</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.calls.map((call) => {
              const talkRatio = call.talkListenRatio ?? 50;
              const prospectRatio = 100 - talkRatio;
              const ratioGood = talkRatio < 60;
              const objectionCount = call.objections?.length ?? 0;
              const painCount = call.pains?.length ?? 0;
              const risks = call.riskFlags ?? [];
              const callDate = call.date
                ? new Date(call.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';

              return (
                <div key={call.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {call.title ?? 'Untitled Call'}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {callDate}{call.repName ? ` · ${call.repName}` : ''}{call.businessName ? ` · ${call.businessName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {call.outcome && (
                        <Badge
                          label={call.outcome}
                          colorClass={OUTCOME_COLOR[call.outcome] ?? 'bg-gray-50 text-gray-500 border-gray-200'}
                        />
                      )}
                    </div>
                  </div>

                  {/* Talk ratio bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Rep {talkRatio}%</span>
                      <span>Prospect {prospectRatio}%</span>
                    </div>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                      <div
                        className={['h-full transition-all', ratioGood ? 'bg-emerald-500' : 'bg-red-400'].join(' ')}
                        style={{ width: `${talkRatio}%` }}
                      />
                      <div
                        className="h-full bg-blue-300"
                        style={{ width: `${prospectRatio}%` }}
                      />
                    </div>
                  </div>

                  {/* Key insight */}
                  {call.summary && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {call.summary}
                    </p>
                  )}

                  {/* Badges row: objections, pains, risk flags */}
                  <div className="flex flex-wrap items-center gap-2">
                    {objectionCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded border font-medium bg-amber-50 text-amber-700 border-amber-200">
                        {objectionCount} objection{objectionCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {painCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
                        {painCount} pain{painCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {call.questionCount !== null && (
                      <span className="text-xs px-2 py-0.5 rounded border font-medium bg-purple-50 text-[#4F3588] border-purple-200">
                        {call.questionCount} question{call.questionCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {risks.map((flag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded border font-medium bg-red-50 text-red-700 border-red-200">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
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
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-gray-400 text-sm space-y-3">
          <p className="font-medium text-gray-500">What you'll see here:</p>
          <div className="font-mono text-xs space-y-1">
            <p className="text-gray-500">Matt Chen · CS Manager · B+ this week</p>
            <p>{'🟢'} Great discovery questions — averaged 8 per call</p>
            <p>{'🟡'} Talk ratio slightly high (58%) — try pausing after questions</p>
            <p>{'📝'} This week's focus: "Let the customer finish before responding"</p>
          </div>
          <p className="text-gray-400 text-xs">
            Coaching is sent immediately after each call and summarized every Monday.
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

// ─── Email Drafts Tab Content ──────────────────────────────────────────────

const ARCHETYPE_COLOR: Record<string, string> = {
  direct_driver: 'bg-purple-50 text-[#4F3588] border-purple-200',
  analytical: 'bg-blue-50 text-blue-700 border-blue-200',
  relational: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  executive: 'bg-amber-50 text-amber-700 border-amber-200',
};

function EmailDraftsTab() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    api
      .emailDrafts()
      .then(setDrafts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (draft: EmailDraft) => {
    navigator.clipboard.writeText(draft.emailBody ?? '').then(() => {
      setCopiedId(draft.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleMarkSent = (draft: EmailDraft) => {
    api.updateDraftStatus(draft.id, 'sent').then(() => {
      setDrafts((prev) =>
        prev.map((d) => (d.id === draft.id ? { ...d, status: 'sent' } : d)),
      );
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading email drafts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load email drafts: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drafts.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-gray-400 text-sm space-y-3">
          <p className="font-medium text-gray-500">What you'll see here:</p>
          <div className="font-mono text-xs space-y-1">
            <p className="text-gray-500">To: Tom Rivera (Greenscape) · analytical style</p>
            <p className="text-gray-500">From: QBR March 24</p>
            <p className="mt-2">Hey Tom,</p>
            <p className="mt-1">The sensor alert issue you raised — we've patched it in v3.2 rolling out Friday.</p>
            <p>I'll send the updated pricing for the scheduling module by EOD tomorrow.</p>
            <p className="mt-1">Does Thursday at 2 work for a quick 15-min walkthrough?</p>
          </div>
          <p className="text-gray-400 text-xs">
            Follow-up drafts are generated automatically after external Zoom calls.
          </p>
        </div>
      ) : (
        drafts.map((draft) => {
          const dateStr = draft.createdAt
            ? new Date(draft.createdAt * 1000).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : '';

          return (
            <div key={draft.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    To: {draft.recipientName ?? 'Unknown'}{' '}
                    {draft.recipientCompany && (
                      <span className="text-gray-500">({draft.recipientCompany})</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    From: {draft.meetingTitle ?? 'Meeting'}
                    {dateStr && ` · ${dateStr}`}
                    {draft.repName && ` · ${draft.repName}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {draft.archetype && (
                    <span
                      className={[
                        'text-xs px-2 py-0.5 rounded border font-medium',
                        ARCHETYPE_COLOR[draft.archetype] ?? 'bg-gray-50 text-gray-500 border-gray-200',
                      ].join(' ')}
                    >
                      {draft.archetype.replace(/_/g, ' ')}
                    </span>
                  )}
                  {draft.status === 'sent' && (
                    <span className="text-xs px-2 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
                      Sent &#10003;
                    </span>
                  )}
                </div>
              </div>

              {/* Email body */}
              <div className="px-5 pb-4">
                <div className="font-mono text-sm bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap border border-gray-100">
                  {draft.emailBody ?? ''}
                </div>
              </div>

              {/* Actions */}
              {draft.status !== 'sent' && (
                <div className="px-5 pb-4 flex items-center justify-end gap-3">
                  <button
                    onClick={() => handleCopy(draft)}
                    className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {copiedId === draft.id ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button
                    onClick={() => handleMarkSent(draft)}
                    className="text-sm px-4 py-2 rounded-lg bg-[#4F3588] text-white hover:bg-[#3d2a6a] transition-colors"
                  >
                    Mark as Sent
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── SOPs Tab Content ───────────────────────────────────────────────────────

function SOPsTab() {
  const [sops, setSops] = useState<SOP[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .sops()
      .then(setSops)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading SOPs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Failed to load SOPs: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sops.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-gray-400 text-sm space-y-3">
          <p className="font-medium text-gray-500">What you'll see here:</p>
          <div className="font-mono text-xs space-y-1">
            <p>{'📄'} Customer Onboarding Checklist · Published</p>
            <p>{'📄'} Handling Pricing Objections · Draft</p>
            <p>{'📄'} Irrigation System Troubleshooting · Published</p>
          </div>
          <p className="text-gray-400 text-xs">
            Playbooks are automatically created when topics appear 3+ times in calls and messages.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sops.map((sop) => (
                <tr key={sop.id} className="hover:bg-purple-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 font-medium">{sop.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'text-xs px-2 py-0.5 rounded border font-medium',
                        sop.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200',
                      ].join(' ')}
                    >
                      {sop.status ?? 'draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(sop.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <p className="text-gray-500 text-sm mt-1">Every call analyzed. Every rep coached. Every product signal captured. Every follow-up drafted.</p>
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
      {activeTab === 'email_drafts' && <EmailDraftsTab />}
      {activeTab === 'sops' && <SOPsTab />}
    </div>
  );
}

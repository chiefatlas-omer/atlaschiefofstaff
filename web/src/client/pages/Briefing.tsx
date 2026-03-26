import React, { useEffect, useState, useRef, DragEvent, ChangeEvent } from 'react';
import { api, BriefingData } from '../lib/api';
import ActivityFeed from '../components/ActivityFeed';
import type { ActivityItem } from '../components/ActivityFeed';

// ─── Upload types ────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'sop', label: 'SOP' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'pricing_guide', label: 'Pricing Guide' },
  { value: 'process_doc', label: 'Process Doc' },
  { value: 'customer_info', label: 'Customer Info' },
  { value: 'general', label: 'General' },
];

interface UploadResult {
  success: boolean;
  docId: string;
  chunkCount: number;
  entities: { people: number; companies: number };
}

// ─── Upload Section ──────────────────────────────────────────────────────────

function UploadSection() {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('general');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    if (!file.name.endsWith('.txt')) {
      setError('Only .txt files are supported. Paste other content directly.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setContent(text);
        setError(null);
        if (!title) {
          setTitle(file.name.replace(/\.txt$/, ''));
        }
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!title.trim()) { setError('Title is required.'); return; }
    if (!content.trim()) { setError('Content is required — paste text or drop a .txt file.'); return; }

    setSubmitting(true);
    try {
      const res = await api.uploadDocument({ title: title.trim(), type, content: content.trim() });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setTitle('');
    setType('general');
    setContent('');
    setResult(null);
    setError(null);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">Upload a document</span>
        <span className="text-gray-400 text-lg leading-none">
          {expanded ? '\u2212' : '+'}
        </span>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="border-t border-gray-200 px-5 py-5">
          {/* Success state */}
          {result ? (
            <div className="space-y-3">
              <p className="text-emerald-700 font-semibold text-sm">Document ingested successfully</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Document ID</p>
                  <p className="text-gray-700 font-mono text-xs break-all">{result.docId}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Chunks Embedded</p>
                  <p className="text-gray-700 font-semibold">{result.chunkCount}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">People Detected</p>
                  <p className="text-gray-700 font-semibold">{result.entities.people}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Companies Detected</p>
                  <p className="text-gray-700 font-semibold">{result.entities.companies}</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="mt-2 text-sm text-[#4F3588] hover:text-[#5A3C9E] transition-colors"
              >
                Upload another document
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Onboarding SOP v2"
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20 transition-colors"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20 transition-colors"
                >
                  {DOC_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Content — textarea + drag-and-drop */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={[
                    'border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors mb-2',
                    isDragging
                      ? 'border-[#4F3588] bg-purple-50'
                      : 'border-gray-300 hover:border-gray-400 bg-gray-50',
                  ].join(' ')}
                >
                  <p className="text-gray-500 text-sm">
                    Drop a <span className="text-gray-700 font-medium">.txt file</span> here, or{' '}
                    <span className="text-[#4F3588]">click to browse</span>
                  </p>
                  {content && (
                    <p className="text-emerald-600 text-xs mt-1">
                      File loaded — {content.length.toLocaleString()} characters
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Or paste document content here..."
                  rows={8}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 text-sm font-mono focus:outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20 transition-colors resize-y"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#4F3588] hover:bg-[#5A3C9E] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {submitting ? 'Ingesting...' : 'Upload Document'}
                </button>
                {(title || content) && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function Briefing() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick-Ask state
  const [askQuery, setAskQuery] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  const handleAsk = () => {
    const q = askQuery.trim();
    if (!q) return;
    setAskLoading(true);
    setAskAnswer(null);
    api
      .ask(q)
      .then((res) => setAskAnswer(res.answer))
      .catch(() => setAskAnswer('Sorry, something went wrong. Please try again.'))
      .finally(() => setAskLoading(false));
  };

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

  const handleCompleteTask = async (taskId: string) => {
    try {
      await api.completeTask(taskId);
      // Refresh briefing data
      const fresh = await api.briefing();
      setData(fresh);
    } catch { /* ignore */ }
  };

  const handlePushTask = async (taskId: string) => {
    try {
      await api.pushTask(taskId, 1);
      const fresh = await api.briefing();
      setData(fresh);
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{data.greeting}</h1>
        <span className="text-gray-500 text-sm">{data.date}</span>
      </div>

      {/* ── Quick-Ask Bar ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-3"
        >
          <span className="text-gray-400 text-lg pl-1">&#128269;</span>
          <input
            type="text"
            value={askQuery}
            onChange={(e) => setAskQuery(e.target.value)}
            placeholder="Ask anything about your business..."
            className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
          />
          <button
            type="submit"
            disabled={askLoading || !askQuery.trim()}
            className="bg-[#4F3588] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#3d2a6a] disabled:opacity-50 transition-colors"
          >
            Ask
          </button>
        </form>
      </div>

      {/* ── Quick-Ask Answer ─────────────────────────────────── */}
      {askLoading && (
        <div className="bg-[#F3F1FC] rounded-xl p-4 text-gray-500 text-sm animate-pulse">
          Thinking...
        </div>
      )}
      {askAnswer && !askLoading && (
        <div className="bg-[#F3F1FC] rounded-xl p-4 text-gray-700 text-sm whitespace-pre-wrap">
          {askAnswer}
        </div>
      )}

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
                  {item.type === 'overdue_task' && item.taskId && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleCompleteTask(item.taskId!)}
                        className="text-xs font-medium px-3 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handlePushTask(item.taskId!)}
                        className="text-xs font-medium px-3 py-1 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      >
                        Push 1 day
                      </button>
                    </div>
                  )}
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

      {/* ── This Week + Streaks (side by side) ────────────────── */}
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

        {/* Streaks */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Streaks
            </h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
            <StreakItem emoji={'\uD83D\uDD25'} value={data.streaks.tasksCompleted.current} label="day task streak" />
            <StreakItem emoji={'\uD83D\uDCDE'} value={data.streaks.callsAnalyzed.current} label="day call streak" />
            <StreakItem emoji={'\u26A1'} value={data.streaks.systemActive.current} label="days active" />
          </div>
        </section>
      </div>

      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6">
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

      {/* ── Voice Assistant Download ─────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Voice Assistant
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex items-start gap-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#F3F1FC] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" fill="#4F3588"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#4F3588" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 19v4M8 23h8" stroke="#4F3588" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Atlas Voice — Talk faster than you type
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Dictate emails, ask questions, manage tasks, and get meeting briefs — all by voice.
                Average user saves 45 minutes per day by talking instead of typing.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="/downloads/atlas-voice-win.exe"
                  className="inline-flex items-center gap-2 bg-[#4F3588] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#3d2a6a] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 2.3l6.5-.9v6.3H0V2.3zm7.3-1l8.7-1.2v7.6H7.3V1.3zM16 8.8v7.5l-8.7-1.2V8.8H16zM6.5 15.4L0 14.5V8.8h6.5v6.6z"/>
                  </svg>
                  Download for Windows
                </a>
                <a
                  href="/downloads/atlas-voice-mac.dmg"
                  className="inline-flex items-center gap-2 bg-white text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.2 8.4c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.1.8 6.8.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5c.9 0 1.5-.8 2-1.7.6-1.2.9-2.3.9-2.3 0 0-1.7-.7-1.7-2.4zM10.6 3.4c.5-.6.8-1.3.7-2.1-.7 0-1.5.5-2 1.1-.4.5-.8 1.4-.7 2.1.8.1 1.5-.4 2-1.1z"/>
                  </svg>
                  Download for Mac
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Your voice hotkeys are on the top-right corner of your keyboard — Insert for voice commands, Pause for hands-free dictation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Upload Document ────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Upload Document
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <UploadSection />
      </section>
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

function StreakItem({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  const maxBar = 30; // full bar at 30 days
  const pct = Math.min(100, (value / maxBar) * 100);

  if (value === 0) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-lg opacity-30">{emoji}</span>
        <span className="text-sm text-gray-400">Start your streak today!</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-2xl font-bold text-[#4F3588]">{value}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="ml-9 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#4F3588] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

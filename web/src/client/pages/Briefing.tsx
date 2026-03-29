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
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      setError('Only .txt and .md files are supported. Paste other content directly.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setContent(text);
        setError(null);
        if (!title) {
          setTitle(file.name.replace(/\.(txt|md)$/, ''));
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
    if (!content.trim()) { setError('Content is required — paste text or drop a .txt/.md file.'); return; }

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
                    Drop a <span className="text-gray-700 font-medium">.txt or .md file</span> here, or{' '}
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
                    accept=".txt,.md"
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

      {/* ── Atlas Brain ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Atlas Brain
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          {/* Ask bar */}
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

          {/* Value prop subtitle */}
          <p className="text-xs text-gray-400">
            Your company's operating system — ask questions, draft emails, search calls, and get instant answers about your business.
          </p>

          {/* Suggested questions / recent queries as clickable chips */}
          {data.knowledgeStats && data.knowledgeStats.recentQueries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.knowledgeStats.recentQueries.slice(0, 3).map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setAskQuery(q);
                    setAskAnswer(null);
                  }}
                  className="text-xs text-[#4F3588] bg-[#F3F1FC] hover:bg-[#E8E4F5] px-3 py-1.5 rounded-full transition-colors truncate max-w-[250px]"
                  title={q}
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {["What's our onboarding process?", "Draft a follow-up for the last call", "What are our top customer pain points?"].map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setAskQuery(q);
                    setAskAnswer(null);
                  }}
                  className="text-xs text-[#4F3588] bg-[#F3F1FC] hover:bg-[#E8E4F5] px-3 py-1.5 rounded-full transition-colors truncate max-w-[250px]"
                  title={q}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Voice Assistant Download (prominent, near top) ───── */}
      <section id="voice-assistant" className="-mt-2">
        <div className="bg-gradient-to-r from-[#4F3588] to-[#6B4DAA] rounded-xl shadow-sm p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-white/15 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" fill="white"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 19v4M8 23h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold mb-0.5">
                Atlas Voice &mdash; Two keys, infinite power
              </h3>
              <p className="text-xs text-white/70">
                <strong>\</strong> (backslash) = Dictate &mdash; talk and text appears where your cursor is.
                &nbsp;&nbsp;<strong>Delete</strong> = Command &mdash; talk to Atlas Chief, get answers and actions.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <a
                href="/downloads/atlas-voice-win.exe"
                className="inline-flex items-center gap-2 bg-white text-[#4F3588] text-sm font-bold px-5 py-3 rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-black/10 animate-[pulse-glow_2s_ease-in-out_infinite]"
                style={{ animationName: 'pulse-glow' }}
              >
                <span className="text-base leading-none">{'\u2B07'}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 2.3l6.5-.9v6.3H0V2.3zm7.3-1l8.7-1.2v7.6H7.3V1.3zM16 8.8v7.5l-8.7-1.2V8.8H16zM6.5 15.4L0 14.5V8.8h6.5v6.6z"/>
                </svg>
                Download for Windows
              </a>
              <a
                href="/downloads/atlas-voice-mac.dmg"
                className="inline-flex items-center gap-2 bg-white text-[#4F3588] text-sm font-bold px-5 py-3 rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-black/10 animate-[pulse-glow_2s_ease-in-out_infinite]"
                style={{ animationName: 'pulse-glow', animationDelay: '0.3s' }}
              >
                <span className="text-base leading-none">{'\u2B07'}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.2 8.4c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.1.8 6.8.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5c.9 0 1.5-.8 2-1.7.6-1.2.9-2.3.9-2.3 0 0-1.7-.7-1.7-2.4zM10.6 3.4c.5-.6.8-1.3.7-2.1-.7 0-1.5.5-2 1.1-.4.5-.8 1.4-.7 2.1.8.1 1.5-.4 2-1.1z"/>
                </svg>
                Download for Mac
              </a>
            </div>
          </div>
        </div>
      </section>

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

      {/* ── AI Usage Score ────────────────────────────────────── */}
      {data.aiScore && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              AI Usage Score
            </h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Achievement banner for new/early users */}
          {data.aiScore.score === 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-[#4F3588] text-sm font-medium mb-4">
              🚀 Welcome to Atlas Chief! Complete milestones above to unlock your team's full AI potential.
            </div>
          )}
          {data.aiScore.score > 0 && data.aiScore.score < 30 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-[#4F3588] text-sm font-medium mb-4">
              🎉 You're getting started! Keep completing milestones to unlock Atlas Chief's full power.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {/* Score row */}
            <div className="flex items-center gap-4 mb-3">
              <span className="text-4xl font-bold text-[#4F3588]">{data.aiScore.score}</span>
              <span className="text-lg text-gray-400 font-light">/100</span>
              <span
                className={[
                  'text-xs font-semibold px-2.5 py-1 rounded-full',
                  data.aiScore.level === 'Getting Started' ? 'bg-gray-100 text-gray-600' :
                  data.aiScore.level === 'Growing' ? 'bg-blue-100 text-blue-700' :
                  data.aiScore.level === 'Good' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-purple-100 text-[#4F3588]',
                ].join(' ')}
              >
                {data.aiScore.level}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-[#F3F1FC] rounded-full overflow-hidden mb-5">
              <div
                className="h-full bg-[#4F3588] rounded-full transition-all duration-500"
                style={{ width: `${data.aiScore.score}%` }}
              />
            </div>

            {/* Milestones grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.aiScore.milestones.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="text-sm leading-none">
                    {m.completed ? '✅' : '⬜'}
                  </span>
                  <span
                    className={[
                      'text-sm',
                      m.completed ? 'text-emerald-600' : 'text-gray-400',
                    ].join(' ')}
                  >
                    {m.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Complete all milestones to unlock full AI potential
            </p>
          </div>
        </section>
      )}

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

      {/* Voice Assistant section moved to top of page */}

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
    const hint = emoji === '\uD83D\uDD25'
      ? 'Complete a task to start your streak \uD83D\uDD25'
      : emoji === '\uD83D\uDCDE'
        ? 'Analyze a call to start your streak \uD83D\uDCDE'
        : 'Start your streak today!';
    return (
      <div className="flex items-center gap-3">
        <span className="text-lg opacity-30">{emoji}</span>
        <span className="text-sm text-gray-400">{hint}</span>
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

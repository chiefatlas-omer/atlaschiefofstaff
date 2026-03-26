import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { api } from '../lib/api';
import SearchBar from '../components/SearchBar';

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

interface AnswerResult {
  question: string;
  answer: string;
  placeholder?: boolean;
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
          {expanded ? '−' : '+'}
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

// ─── Main Knowledge Page ─────────────────────────────────────────────────────

export default function Knowledge() {
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAsk(question: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.ask(question);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Knowledge</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ask questions about your company's SOPs, meetings, and decisions.
        </p>
      </div>

      {/* Search */}
      <SearchBar
        onSubmit={handleAsk}
        placeholder="e.g. What is our onboarding process?"
        loading={loading}
      />

      {/* Hint */}
      <p className="text-gray-400 text-xs">
        For full semantic search, use <code className="text-[#4F3588]">/ask</code> in Slack.
        This interface uses the basic Q&amp;A endpoint.
      </p>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Answer */}
      {result && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-3">
          <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Question</p>
          <p className="text-gray-700 text-sm">{result.question}</p>

          <div className="border-t border-gray-200 pt-3">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">
              Answer
            </p>
            <p className="text-gray-900 text-sm leading-relaxed">{result.answer}</p>
          </div>

          {result.placeholder && (
            <p className="text-amber-600 text-xs mt-2">
              Full semantic search will be available in a future phase.
            </p>
          )}
        </div>
      )}

      {/* Upload section */}
      <UploadSection />
    </div>
  );
}

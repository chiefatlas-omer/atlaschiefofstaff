import React, { useEffect, useState, useRef, useCallback } from 'react';
import { fetchApi } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'task' | 'person' | 'company' | 'meeting' | 'call' | 'document' | 'coaching';
  id: string | number;
  title: string;
  subtitle?: string;
}

const TYPE_ICON: Record<string, string> = {
  call: '\uD83D\uDCDE',
  task: '\uD83D\uDCCB',
  person: '\uD83D\uDC64',
  company: '\uD83C\uDFE2',
  document: '\uD83D\uDCC4',
  meeting: '\uD83D\uDCC5',
  coaching: '\uD83C\uDFAF',
};

const EMAIL_PATTERNS = ['generate email', 'draft email', 'write email', 'email to', 'compose email', 'draft a', 'write a follow', 'follow up email', 'follow-up email'];

// ─── Component ───────────────────────────────────────────────────────────────

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export default function CommandBar({ open, onClose, onNavigate }: CommandBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function isEmailQuery(q: string): boolean {
    const lower = q.toLowerCase();
    return EMAIL_PATTERNS.some(p => lower.includes(p));
  }

  async function handleEmailGeneration(q: string) {
    setEmailLoading(true);
    setEmailResult(null);
    try {
      const res = await fetchApi<{ answer: string; isEmail?: boolean }>('/api/ask', {
        method: 'POST',
        body: JSON.stringify({ question: q, generateEmail: true }),
      });
      setEmailResult(res.answer);
    } catch {
      setEmailResult('Failed to generate email. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  }

  function handleCopyEmail() {
    if (emailResult) {
      navigator.clipboard.writeText(emailResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setEmailResult(null);
      setEmailLoading(false);
      setCopied(false);
      setTimeout(() => inputRef.current?.focus(), 50);
      // Load default results (recent items)
      fetchResults('');
    }
  }, [open]);

  // Debounced search
  const fetchResults = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await fetchApi<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(data);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 200);
  }

  // Quick actions (shown when no query)
  const quickActions = [
    { label: 'Upload document', icon: '📄', path: '/' },
    { label: 'Search knowledge base', icon: '🔍', path: '/' },
    { label: 'View outcomes', icon: '📊', path: '/outcomes' },
  ];

  // Navigate to result
  function handleSelect(index: number) {
    if (query.trim() === '' && index >= results.length) {
      // Quick action
      const actionIndex = index - results.length;
      if (actionIndex >= 0 && actionIndex < quickActions.length) {
        onNavigate(quickActions[actionIndex].path);
        onClose();
      }
      return;
    }

    const item = results[index];
    if (!item) return;

    // Map type to page
    switch (item.type) {
      case 'task':
        onNavigate('/tasks');
        break;
      case 'call':
      case 'coaching':
        onNavigate('/intelligence');
        break;
      case 'person':
      case 'company':
      case 'meeting':
        onNavigate('/');
        break;
      case 'document':
        onNavigate('/');
        break;
      default:
        onNavigate('/');
    }
    onClose();
  }

  // Total selectable items
  const totalItems = query.trim() === ''
    ? results.length + quickActions.length
    : results.length;

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isEmailQuery(query)) {
        handleEmailGeneration(query);
      } else {
        handleSelect(selectedIndex);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[480px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search anything..."
            className="text-lg text-gray-900 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {loading && (
            <span className="text-gray-300 text-sm">...</span>
          )}
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[380px]">
          {/* Search results */}
          {results.length > 0 && (
            <div>
              <p className="px-5 pt-3 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                {query.trim() ? 'Results' : 'Recent'}
              </p>
              {results.map((item, i) => (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(i)}
                  className={[
                    'px-5 py-3 cursor-pointer flex items-center gap-3 transition-colors',
                    i === selectedIndex ? 'bg-[#F3F1FC]' : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="text-base">{TYPE_ICON[item.type] ?? '📌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 capitalize shrink-0">{item.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick actions (only when no query) */}
          {query.trim() === '' && (
            <div>
              <p className="px-5 pt-3 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Quick Actions
              </p>
              {quickActions.map((action, i) => {
                const index = results.length + i;
                return (
                  <div
                    key={action.label}
                    onClick={() => handleSelect(index)}
                    className={[
                      'px-5 py-3 cursor-pointer flex items-center gap-3 transition-colors',
                      index === selectedIndex ? 'bg-[#F3F1FC]' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <span className="text-base">{action.icon}</span>
                    <p className="text-sm text-gray-700">{action.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Email hint */}
          {query.trim() !== '' && isEmailQuery(query) && !emailResult && !emailLoading && (
            <div className="px-5 py-3 bg-purple-50 border-b border-purple-100">
              <p className="text-xs text-[#4F3588] font-medium">
                {'\u2709\uFE0F'} Press Enter to generate an email draft
              </p>
            </div>
          )}

          {/* Email loading */}
          {emailLoading && (
            <div className="px-5 py-6 text-center text-gray-400 text-sm animate-pulse">
              Generating email draft...
            </div>
          )}

          {/* Email result */}
          {emailResult && !emailLoading && (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#4F3588] uppercase tracking-wide">
                  {'\u2709\uFE0F'} Generated Email
                </p>
                <button
                  onClick={handleCopyEmail}
                  className="text-xs font-medium px-3 py-1 rounded-lg bg-[#4F3588] text-white hover:bg-[#3d2a6a] transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-[250px] overflow-y-auto">
                {emailResult}
              </div>
            </div>
          )}

          {/* No results */}
          {query.trim() !== '' && results.length === 0 && !loading && !emailResult && !emailLoading && !isEmailQuery(query) && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

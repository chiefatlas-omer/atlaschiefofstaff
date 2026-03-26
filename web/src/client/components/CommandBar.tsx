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
  call: '📞',
  task: '📋',
  person: '👤',
  company: '🏢',
  document: '📄',
  meeting: '📅',
  coaching: '🎯',
};

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
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
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
    { label: 'Upload document', icon: '📄', path: '/knowledge' },
    { label: 'Search knowledge base', icon: '🔍', path: '/knowledge' },
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
        onNavigate('/knowledge');
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
      handleSelect(selectedIndex);
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

          {/* No results */}
          {query.trim() !== '' && results.length === 0 && !loading && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No results found for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

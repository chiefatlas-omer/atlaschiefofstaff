import React, { useState } from 'react';
import { api } from '../lib/api';
import SearchBar from '../components/SearchBar';

interface AnswerResult {
  question: string;
  answer: string;
  placeholder?: boolean;
}

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
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Bot</h1>
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
        Note: For full semantic search, use <code className="text-[#4F3588]">/ask</code> in Slack.
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
    </div>
  );
}

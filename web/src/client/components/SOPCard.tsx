import React, { useState } from 'react';
import { SOP } from '../lib/api';

function statusBadge(status: string) {
  const lower = status.toLowerCase();
  if (lower === 'published' || lower === 'active') {
    return 'bg-green-900/50 text-green-300 border border-green-700';
  }
  if (lower === 'draft') {
    return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  }
  return 'bg-gray-800 text-gray-400 border border-gray-700';
}

interface SOPCardProps {
  sop: SOP;
}

export default function SOPCard({ sop }: SOPCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-100 font-semibold text-base truncate">{sop.title}</h3>
          {sop.summary && (
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{sop.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sop.format && (
            <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
              {sop.format}
            </span>
          )}
          <span
            className={[
              'text-xs px-2 py-0.5 rounded font-medium',
              statusBadge(sop.status),
            ].join(' ')}
          >
            {sop.status}
          </span>
        </div>
      </div>

      {/* Expand/collapse button */}
      {sop.content && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-purple-400 hover:text-purple-300 text-xs font-medium transition-colors mt-1"
        >
          {expanded ? 'Hide Content' : 'View Content'}
        </button>
      )}

      {/* Expanded content */}
      {expanded && sop.content && (
        <div className="mt-3 max-h-96 overflow-y-auto bg-gray-950 rounded-lg border border-gray-800 p-4">
          <pre className="text-gray-300 text-xs whitespace-pre-wrap font-mono leading-relaxed">
            {sop.content}
          </pre>
        </div>
      )}
    </div>
  );
}

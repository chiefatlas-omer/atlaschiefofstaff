import { useState } from 'react';
import type { ActivityEntry as ActivityEntryType } from '../../lib/team-types';

interface ActivityEntryProps {
  entry: ActivityEntryType;
  showApprovalActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function isRecent(timestamp: string): boolean {
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff < 3600000; // 1 hour
}

export function ActivityEntryComponent({ entry, showApprovalActions, onApprove, onReject }: ActivityEntryProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const recent = isRecent(entry.timestamp);
  const longDetail = entry.detail.length > 120;

  return (
    <div className="relative flex gap-3 pb-6">
      {/* Timeline dot */}
      <div className="relative z-10 mt-1.5 flex-shrink-0">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: recent ? '#4F3588' : '#D1D5DB' }}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{entry.employeeIcon}</span>
          <span className="text-sm font-medium text-gray-900">{entry.employeeName}</span>
          <span className="text-xs text-gray-400">{relativeTime(entry.timestamp)}</span>

          {/* Status badges */}
          {entry.approved === true && (
            <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
              Approved
            </span>
          )}
          {entry.approved === false && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-[#EF4444]">
              Changes Requested
            </span>
          )}
        </div>

        {/* Action */}
        <p className="mt-1 text-sm text-gray-700">{entry.action}</p>

        {/* Detail */}
        {entry.detail && (
          <div className="mt-0.5">
            <p className="text-xs text-gray-500">
              {longDetail && !showFullDetail
                ? entry.detail.slice(0, 120) + '...'
                : entry.detail}
            </p>
            {longDetail && (
              <button
                onClick={() => setShowFullDetail(!showFullDetail)}
                className="mt-0.5 text-xs font-medium text-[#4F3588] hover:text-[#5A3C9E]"
              >
                {showFullDetail ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Deliverable preview */}
        {entry.deliverablePreview && (
          <div className="mt-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs font-medium text-[#4F3588] hover:text-[#5A3C9E]"
            >
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
            {showPreview && (
              <div className="mt-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                  {entry.deliverablePreview}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Approval actions */}
        {showApprovalActions && entry.approved === null && (
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={onApprove}
              className="rounded-lg border border-[#22C55E] px-3 py-1 text-xs font-medium text-[#22C55E] transition-colors hover:bg-[#DCFCE7]"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
            >
              Request Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

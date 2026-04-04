import { useState } from 'react';
import type { ActivityEntry as ActivityEntryType } from '../../lib/team-types';
import { ACTIVITY_STATUS_INFO } from '../../lib/team-types';

interface ActivityEntryProps {
  entry: ActivityEntryType;
  showApprovalActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onClickEmployee?: () => void;
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

export function ActivityEntryComponent({ entry, showApprovalActions, onApprove, onReject, onClickEmployee }: ActivityEntryProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [showFailureDetail, setShowFailureDetail] = useState(false);
  const recent = isRecent(entry.timestamp);
  const longDetail = entry.detail.length > 120;
  const isFailed = entry.status === 'failure';
  const isPartial = entry.status === 'partial';
  const statusInfo = ACTIVITY_STATUS_INFO[entry.status || 'success'];

  // Determine timeline dot color: failures red, partial orange, recent purple, default gray
  const dotColor = isFailed ? '#EF4444' : isPartial ? '#F59E0B' : recent ? '#4F3588' : '#D1D5DB';

  return (
    <div className="relative flex gap-3 pb-6">
      {/* Timeline dot */}
      <div className="relative z-10 mt-1.5 flex-shrink-0">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{entry.employeeIcon}</span>
          {onClickEmployee ? (
            <button onClick={onClickEmployee} className="text-sm font-medium text-gray-900 hover:text-[#4F3588] transition-colors">
              {entry.employeeName}
            </button>
          ) : (
            <span className="text-sm font-medium text-gray-900">{entry.employeeName}</span>
          )}
          <span className="text-xs text-gray-400">{relativeTime(entry.timestamp)}</span>

          {/* Activity status badge (failure/partial) */}
          {(isFailed || isPartial) && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ color: statusInfo.color, backgroundColor: statusInfo.bgColor }}
            >
              {statusInfo.icon} {statusInfo.label}
            </span>
          )}

          {/* Approval badges */}
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

        {/* Failure detail section */}
        {(isFailed || isPartial) && entry.failureReason && (
          <div className="mt-2">
            <button
              onClick={() => setShowFailureDetail(!showFailureDetail)}
              className="text-xs font-medium"
              style={{ color: statusInfo.color }}
            >
              {showFailureDetail ? 'Hide details' : 'View failure details'}
            </button>
            {showFailureDetail && (
              <div
                className="mt-1.5 rounded-lg border p-3 space-y-1.5"
                style={{ borderColor: statusInfo.color + '30', backgroundColor: statusInfo.bgColor + '60' }}
              >
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Reason</span>
                  <p className="text-xs text-gray-700">{entry.failureReason}</p>
                </div>
                {entry.failureStep && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Failed Step</span>
                    <p className="text-xs text-gray-700">{entry.failureStep}</p>
                  </div>
                )}
                {entry.retryCount != null && entry.retryCount > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Retries</span>
                    <p className="text-xs text-gray-700">{entry.retryCount} attempt{entry.retryCount > 1 ? 's' : ''}</p>
                  </div>
                )}
                {entry.resolution && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Resolution</span>
                    <p className="text-xs text-gray-700">{entry.resolution}</p>
                  </div>
                )}
              </div>
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

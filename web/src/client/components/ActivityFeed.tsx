import React from 'react';

export interface ActivityItem {
  type:
    | 'call_analyzed'
    | 'task_created'
    | 'coaching_sent'
    | 'sop_generated'
    | 'doc_ingested'
    | 'email_drafted'
    | 'knowledge_query';
  title: string;
  subtitle?: string;
  timestamp: number; // unix seconds
}

const DOT_COLORS: Record<string, string> = {
  call_analyzed: 'bg-[#4F3588]',
  task_created: 'bg-blue-500',
  coaching_sent: 'bg-emerald-500',
  sop_generated: 'bg-amber-500',
  doc_ingested: 'bg-gray-400',
  email_drafted: 'bg-indigo-400',
  knowledge_query: 'bg-cyan-500',
};

const TYPE_ICONS: Record<string, string> = {
  call_analyzed: '\u{1F4DE}',
  task_created: '\u2705',
  coaching_sent: '\u{1F3AF}',
  sop_generated: '\u{1F4CB}',
  doc_ingested: '\u{1F4C4}',
  email_drafted: '\u2709\uFE0F',
  knowledge_query: '\u{1F4AC}',
};

function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
}

export default function ActivityFeed({ items, maxItems = 10 }: ActivityFeedProps) {
  const displayed = items.slice(0, maxItems);

  if (displayed.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-4">No recent activity yet.</p>
    );
  }

  return (
    <div className="relative">
      {displayed.map((item, i) => {
        const isLast = i === displayed.length - 1;
        const dotColor = DOT_COLORS[item.type] ?? 'bg-gray-400';
        const icon = TYPE_ICONS[item.type] ?? '';

        return (
          <div key={`${item.type}-${item.timestamp}-${i}`} className="relative flex gap-3 pb-4">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-200" />
            )}

            {/* Dot */}
            <div className="relative flex-shrink-0 mt-1">
              <div className={`w-[15px] h-[15px] rounded-full ${dotColor} ring-2 ring-white`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-900 leading-snug truncate">
                  <span className="mr-1">{icon}</span>
                  {item.title}
                </p>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
              {item.subtitle && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subtitle}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

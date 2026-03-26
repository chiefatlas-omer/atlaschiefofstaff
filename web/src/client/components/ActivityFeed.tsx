import React from 'react';

export interface ActivityItem {
  type: string;
  title: string;
  subtitle?: string;
  timestamp: number;
}

const ACTIVITY_ICON: Record<string, string> = {
  call_analyzed: '\u{1F4DE}',
  task_created: '\u{1F4CB}',
  coaching_sent: '\u{1F3AF}',
  sop_generated: '\u{1F4C4}',
  doc_ingested: '\u{1F4C4}',
  knowledge_query: '\u{1F50D}',
};

function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
}

export default function ActivityFeed({ items, maxItems = 10 }: ActivityFeedProps) {
  const visible = items.slice(0, maxItems);

  if (visible.length === 0) {
    return <p className="text-gray-400 text-sm">No recent activity.</p>;
  }

  return (
    <div className="space-y-3">
      {visible.map((item, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="text-base mt-0.5 shrink-0">
            {ACTIVITY_ICON[item.type] ?? '\u{1F4CC}'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-700 truncate">{item.title}</p>
            {item.subtitle && (
              <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
            )}
          </div>
          <span className="text-xs text-gray-300 shrink-0 mt-0.5">
            {timeAgo(item.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

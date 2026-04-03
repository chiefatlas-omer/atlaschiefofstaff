import { useMemo, useState } from 'react';
import type { ActivityEntry, ActivityStatus, Employee } from '../../lib/team-types';
import { ACTIVITY_STATUS_INFO } from '../../lib/team-types';
import { ActivityEntryComponent } from './ActivityEntry';

type StatusFilter = 'all' | 'success' | 'failures' | 'attention';

interface ActivityTabProps {
  activity: ActivityEntry[];
  employees: Employee[];
  onApprove: (activityId: string) => void;
  onReject: (activityId: string) => void;
  onPromote: (employeeId: string) => void;
}

export function ActivityTab({ activity, employees, onApprove, onReject, onPromote }: ActivityTabProps) {
  const [filterEmployee, setFilterEmployee] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');

  const pendingApprovals = useMemo(
    () => activity.filter((a) => a.needsApproval && a.approved === null),
    [activity],
  );

  const sortedActivity = useMemo(() => {
    let filtered = filterEmployee
      ? activity.filter((a) => a.employeeId === filterEmployee)
      : activity;

    // Apply status filter
    if (filterStatus === 'success') {
      filtered = filtered.filter((a) => a.status === 'success');
    } else if (filterStatus === 'failures') {
      filtered = filtered.filter((a) => a.status === 'failure' || a.status === 'partial');
    } else if (filterStatus === 'attention') {
      filtered = filtered.filter((a) => a.status === 'failure' || a.status === 'partial' || (a.needsApproval && a.approved === null));
    }

    return [...filtered].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [activity, filterEmployee, filterStatus]);

  // Count failures for the badge
  const failureCount = useMemo(
    () => activity.filter((a) => a.status === 'failure' || a.status === 'partial').length,
    [activity],
  );

  // Employees eligible for promotion: supervised with >= 12 approvals
  const promotionCandidates = useMemo(() => {
    return employees.filter(
      (e) => e.trustLevel === 'supervised' && e.approvalsCount >= 12,
    );
  }, [employees]);

  // Unique employee names for the filter bar
  const employeeNames = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon: string }>();
    for (const a of activity) {
      if (!seen.has(a.employeeId)) {
        seen.set(a.employeeId, {
          id: a.employeeId,
          name: a.employeeName,
          icon: a.employeeIcon,
        });
      }
    }
    return Array.from(seen.values());
  }, [activity]);

  return (
    <div className="space-y-8">
      {/* Approval Queue */}
      {pendingApprovals.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#EAB308]">
              Needs Your Review
            </span>
            <span className="rounded-full bg-[#FEF9C3] px-2 py-0.5 text-[11px] font-medium text-[#EAB308]">
              {pendingApprovals.length} pending
            </span>
          </div>

          <div className="space-y-3">
            {pendingApprovals.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-[#EAB308]/20 bg-[#FFFDE7]/40 p-4"
              >
                <ActivityEntryComponent
                  entry={entry}
                  showApprovalActions
                  onApprove={() => onApprove(entry.id)}
                  onReject={() => onReject(entry.id)}
                />
              </div>
            ))}
          </div>

          {/* Promotion banners */}
          {promotionCandidates.map((emp) => (
            <div
              key={emp.id}
              className="mt-3 flex items-center justify-between rounded-xl border border-[#A78BFA]/30 bg-[#F3F1FC] p-4"
            >
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-base">&#x1f389;</span>
                <span>
                  <span className="font-medium text-gray-900">{emp.name}</span> has{' '}
                  {emp.approvalsCount} clean approvals. Ready to promote to Trusted?
                </span>
              </div>
              <button
                onClick={() => onPromote(emp.id)}
                className="rounded-lg bg-[#4F3588] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
              >
                Promote
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Activity Feed */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Activity Feed</h3>

        {/* Status filter pills */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([
            { key: 'all' as StatusFilter, label: 'All', color: '#4F3588' },
            { key: 'success' as StatusFilter, label: 'Successes', color: '#22C55E' },
            { key: 'failures' as StatusFilter, label: 'Failures', color: '#EF4444' },
            { key: 'attention' as StatusFilter, label: 'Needs Attention', color: '#EAB308' },
          ]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterStatus === key
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={filterStatus === key ? { backgroundColor: color } : undefined}
            >
              {label}
              {key === 'failures' && failureCount > 0 && (
                <span className="ml-1 rounded-full bg-white/30 px-1.5 py-0.5 text-[10px]">{failureCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Employee filter bar */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterEmployee(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterEmployee === null
                ? 'bg-[#4F3588] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {employeeNames.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setFilterEmployee(emp.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterEmployee === emp.id
                  ? 'bg-[#4F3588] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="mr-1">{emp.icon}</span>
              {emp.name}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative border-l-2 border-gray-200 pl-4">
          {sortedActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No activity yet</p>
          ) : (
            sortedActivity.map((entry) => (
              <ActivityEntryComponent key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

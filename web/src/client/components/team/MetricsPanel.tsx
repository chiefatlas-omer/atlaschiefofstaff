import React, { useState, useEffect } from 'react';
import { teamApi } from '../../lib/team-api';
import type { Employee, MetricsSnapshot } from '../../lib/team-types';

// ---------------------------------------------------------------------------
// Performance Metrics Panel — shown in EmployeeProfile
// ---------------------------------------------------------------------------

interface MetricsPanelProps {
  employee: Employee;
}

export default function MetricsPanel({ employee }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<MetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamApi.metrics(employee.id)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-5 h-5 border-2 border-[#4F3588] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Aggregate current stats from the employee record
  const currentStats = [
    { label: 'Tasks Done', value: employee.deliverablesCount, color: '#22C55E' },
    { label: 'Approvals', value: employee.approvalsCount, color: '#3B82F6' },
    { label: 'Hours Used', value: employee.hoursUsed, color: '#4F3588' },
    { label: 'Hours Budget', value: employee.hoursAllocated, color: '#9CA3AF' },
  ];

  // Build a simple sparkline from the last 7 days of metrics
  const last7 = metrics.slice(0, 7).reverse();

  // Compute utilization percentage
  const utilization = employee.hoursAllocated > 0
    ? Math.round((employee.hoursUsed / employee.hoursAllocated) * 100)
    : 0;

  const utilizationColor = utilization > 90 ? '#EF4444' : utilization > 70 ? '#F59E0B' : '#22C55E';

  return (
    <div className="space-y-4">
      {/* Current stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {currentStats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{stat.label}</div>
            <div className="text-xl font-semibold text-gray-900 mt-0.5" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Utilization bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600">Budget Utilization</span>
          <span className="text-xs font-semibold" style={{ color: utilizationColor }}>
            {utilization}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(utilization, 100)}%`,
              backgroundColor: utilizationColor,
            }}
          />
        </div>
      </div>

      {/* Trend chart (last 7 snapshots) */}
      {last7.length > 1 && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-2">Tasks Completed (Last 7 Days)</div>
          <div className="flex items-end gap-1 h-16">
            {last7.map((snap, i) => {
              const maxVal = Math.max(...last7.map((s) => s.tasksCompleted), 1);
              const height = (snap.tasksCompleted / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-sm transition-all duration-300"
                    style={{
                      height: `${Math.max(height, 4)}%`,
                      backgroundColor: snap.tasksCompleted > 0 ? '#4F3588' : '#E5E7EB',
                      minHeight: '2px',
                    }}
                  />
                  <span className="text-[9px] text-gray-400">
                    {snap.date.slice(5)} {/* MM-DD */}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for metrics */}
      {metrics.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">
            Performance history builds over time as tasks are completed.
          </p>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { STATUS_INFO, DEPARTMENT_INFO, type Employee } from '../../lib/team-types';

interface PayrollTabProps {
  employees: Employee[];
  onTogglePause: (employeeId: string) => void;
  onUpdateHours: (employeeId: string, hours: number) => void;
  onSelectEmployee?: (employeeId: string) => void;
}

function usageColor(pct: number): string {
  if (pct > 85) return '#EF4444';
  if (pct > 60) return '#EAB308';
  return '#22C55E';
}

export function PayrollTab({ employees, onTogglePause, onUpdateHours, onSelectEmployee }: PayrollTabProps) {
  // Filter to AI employees only (not owner, not chief of staff)
  const aiEmployees = useMemo(
    () => employees.filter((e) => e.id !== 'owner' && !e.isChiefOfStaff),
    [employees],
  );

  const totalUsed = useMemo(() => aiEmployees.reduce((s, e) => s + e.hoursUsed, 0), [aiEmployees]);
  const totalAllocated = useMemo(() => aiEmployees.reduce((s, e) => s + e.hoursAllocated, 0), [aiEmployees]);
  const activeCount = useMemo(() => aiEmployees.filter((e) => e.status !== 'paused').length, [aiEmployees]);
  const avgUtilization = useMemo(() => {
    if (aiEmployees.length === 0) return 0;
    const sum = aiEmployees.reduce((s, e) => {
      const pct = e.hoursAllocated > 0 ? (e.hoursUsed / e.hoursAllocated) * 100 : 0;
      return s + pct;
    }, 0);
    return Math.round(sum / aiEmployees.length);
  }, [aiEmployees]);

  // Department breakdown — hours by department
  const deptBreakdown = useMemo(() => {
    const map = new Map<string, { used: number; allocated: number; label: string; color: string }>();
    for (const e of aiEmployees) {
      const existing = map.get(e.department) ?? {
        used: 0,
        allocated: 0,
        label: DEPARTMENT_INFO[e.department]?.label ?? e.department,
        color: DEPARTMENT_INFO[e.department]?.color ?? '#6B7280',
      };
      existing.used += e.hoursUsed;
      existing.allocated += e.hoursAllocated;
      map.set(e.department, existing);
    }
    return Array.from(map.entries()).map(([dept, data]) => ({ dept, ...data }));
  }, [aiEmployees]);

  // Monthly trend — compute from employee hire dates (cumulative hours allocated as team grows)
  const monthlyTrend = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const currentMonth = now.getMonth();
    // Show last 6 months up to current
    const trend: { label: string; hours: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const yearOffset = currentMonth - i < 0 ? -1 : 0;
      const monthDate = new Date(now.getFullYear() + yearOffset, monthIdx, 1);
      // Count employees hired by this month
      const activeByMonth = aiEmployees.filter((e) => {
        const hireDate = new Date(e.hireDate);
        return hireDate <= new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      });
      const hours = activeByMonth.reduce((sum, e) => sum + e.hoursAllocated, 0);
      trend.push({ label: months[monthIdx], hours });
    }
    return trend;
  }, [aiEmployees]);

  const maxTrendHours = Math.max(...monthlyTrend.map((m) => m.hours), 1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Hours"
          value={`${totalUsed} / ${totalAllocated}`}
          sub={totalAllocated > 0 ? `${Math.round((totalUsed / totalAllocated) * 100)}% used` : ''}
          progress={totalAllocated > 0 ? totalUsed / totalAllocated : 0}
        />
        <SummaryCard
          label="Active Employees"
          value={String(activeCount)}
          sub={`of ${aiEmployees.length} total`}
        />
        <SummaryCard
          label="Avg Utilization"
          value={`${avgUtilization}%`}
          sub={avgUtilization > 85 ? 'Above target' : avgUtilization > 60 ? 'On track' : 'Below target'}
          valueColor={usageColor(avgUtilization)}
        />
        <SummaryCard
          label="Departments"
          value={String(deptBreakdown.length)}
          sub={deptBreakdown.map((d) => d.label).join(', ')}
        />
      </div>

      {/* Employee Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Hours Used</th>
              <th className="px-4 py-3 text-right">Hours Allocated</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {aiEmployees.map((emp) => (
              <EmployeeRow
                key={emp.id}
                employee={emp}
                onTogglePause={() => onTogglePause(emp.id)}
                onUpdateHours={(hours) => onUpdateHours(emp.id, hours)}
                onSelect={onSelectEmployee ? () => onSelectEmployee(emp.id) : undefined}
              />
            ))}
          </tbody>
        </table>

        {aiEmployees.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">No AI employees yet</p>
        )}
      </div>

      {/* Department Breakdown */}
      {deptBreakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Hours by Department</h4>
          <div className="space-y-3">
            {deptBreakdown.map((dept) => {
              const pct = dept.allocated > 0 ? Math.round((dept.used / dept.allocated) * 100) : 0;
              return (
                <div key={dept.dept}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color: dept.color }}>{dept.label}</span>
                    <span className="text-gray-500">{dept.used} / {dept.allocated} hrs ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: dept.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Trend */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h4 className="mb-4 text-sm font-semibold text-gray-900">Team Capacity Trend</h4>
        <p className="mb-3 text-xs text-gray-500">Allocated hours as your team grows</p>
        <div className="flex items-end gap-4" style={{ height: 120 }}>
          {monthlyTrend.map((month) => {
            const heightPct = maxTrendHours > 0 ? (month.hours / maxTrendHours) * 100 : 0;
            return (
              <div key={month.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-700">{month.hours}h</span>
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: '#4F3588',
                    minHeight: 4,
                  }}
                />
                <span className="text-[11px] text-gray-400">{month.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function SummaryCard({
  label,
  value,
  sub,
  progress,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(progress * 100, 100)}%`,
              backgroundColor: usageColor(progress * 100),
            }}
          />
        </div>
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  onTogglePause,
  onUpdateHours,
  onSelect,
}: {
  employee: Employee;
  onTogglePause: () => void;
  onUpdateHours: (hours: number) => void;
  onSelect?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(employee.hoursAllocated));

  const pct = employee.hoursAllocated > 0
    ? Math.round((employee.hoursUsed / employee.hoursAllocated) * 100)
    : 0;
  const color = usageColor(pct);
  const statusInfo = STATUS_INFO[employee.status];

  function commitEdit() {
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num > 0) {
      onUpdateHours(num);
    }
    setEditing(false);
  }

  return (
    <tr className="transition-colors hover:bg-gray-50/50">
      {/* Employee */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{employee.icon}</span>
          {onSelect ? (
            <button onClick={onSelect} className="font-medium text-gray-900 hover:text-[#4F3588] transition-colors">
              {employee.name}
            </button>
          ) : (
            <span className="font-medium text-gray-900">{employee.name}</span>
          )}
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3 text-gray-600">{employee.role}</td>

      {/* Hours Used */}
      <td className="px-4 py-3 text-right font-medium text-gray-900">{employee.hoursUsed}</td>

      {/* Hours Allocated */}
      <td className="px-4 py-3 text-right">
        {editing ? (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            min={1}
            className="w-20 rounded border border-[#4F3588] px-2 py-1 text-right text-sm outline-none"
          />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-gray-900">{employee.hoursAllocated}</span>
            <button
              onClick={() => { setEditValue(String(employee.hoursAllocated)); setEditing(true); }}
              className="text-[11px] font-medium text-[#4F3588] hover:text-[#5A3C9E]"
            >
              Adjust
            </button>
          </span>
        )}
      </td>

      {/* Usage bar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            color: statusInfo.color,
            backgroundColor: statusInfo.color + '18',
          }}
        >
          {statusInfo.label}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <button
          onClick={onTogglePause}
          className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
            employee.status === 'paused'
              ? 'border-[#22C55E] text-[#22C55E] hover:bg-[#DCFCE7]'
              : 'border-gray-300 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {employee.status === 'paused' ? 'Resume' : 'Pause'}
        </button>
      </td>
    </tr>
  );
}

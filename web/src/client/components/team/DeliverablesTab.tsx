/**
 * DeliverablesTab — browse all completed AI outputs across employees.
 *
 * This is where team members come to find, copy, and download the work
 * their AI employees have produced. Think of it as the "inbox" for AI output.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { Employee, Task } from '../../lib/team-types';
import { TASK_PRIORITY_INFO } from '../../lib/team-types';
import { teamApi } from '../../lib/team-api';
import type { OutputViewerData } from './OutputViewer';

interface DeliverablesTabProps {
  employees: Employee[];
  onViewOutput: (data: OutputViewerData) => void;
}

interface Deliverable {
  task: Task;
  employee: Employee;
}

export function DeliverablesTab({ employees, onViewOutput }: DeliverablesTabProps) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load all completed tasks across all employees
  useEffect(() => {
    async function loadDeliverables() {
      setLoading(true);
      try {
        const allDeliverables: Deliverable[] = [];
        // Fetch tasks for each employee in parallel
        const results = await Promise.all(
          employees
            .filter((e) => !e.isChiefOfStaff && e.id !== 'owner')
            .map(async (emp) => {
              try {
                const tasks = await teamApi.tasks(emp.id);
                return tasks
                  .filter((t) => t.status === 'done' && t.output)
                  .map((t) => ({ task: t, employee: emp }));
              } catch {
                return [];
              }
            }),
        );
        for (const batch of results) allDeliverables.push(...batch);
        // Sort by most recent first
        allDeliverables.sort(
          (a, b) =>
            new Date(b.task.updatedAt || b.task.createdAt).getTime() -
            new Date(a.task.updatedAt || a.task.createdAt).getTime(),
        );
        setDeliverables(allDeliverables);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    loadDeliverables();
  }, [employees]);

  // Filtered + searched deliverables
  const filtered = useMemo(() => {
    let result = deliverables;
    if (filterEmployee) {
      result = result.filter((d) => d.employee.id === filterEmployee);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.task.title.toLowerCase().includes(q) ||
          (d.task.output?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [deliverables, filterEmployee, searchQuery]);

  const handleCopy = useCallback(async (task: Task) => {
    if (!task.output) return;
    try {
      await navigator.clipboard.writeText(task.output);
      setCopiedId(task.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  }, []);

  const handleView = useCallback(
    (d: Deliverable) => {
      onViewOutput({
        title: d.task.title,
        output: d.task.output!,
        employeeName: d.employee.name,
        employeeIcon: d.employee.icon,
        employeeRole: d.employee.role,
        priority: d.task.priority,
        tokensUsed: d.task.tokensUsed,
        durationMs: d.task.durationMs,
        completedAt: d.task.updatedAt || d.task.createdAt,
        taskId: d.task.id,
      });
    },
    [onViewOutput],
  );

  // Employees who have deliverables
  const employeesWithOutput = useMemo(
    () => [...new Set(deliverables.map((d) => d.employee.id))],
    [deliverables],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4F3588] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="mb-6 flex items-center gap-6">
        <div>
          <span className="text-2xl font-semibold tracking-tight text-gray-900">
            {deliverables.length}
          </span>
          <span className="ml-1.5 text-sm text-gray-500">deliverables</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div>
          <span className="text-sm font-medium text-gray-700">
            {employeesWithOutput.length}
          </span>
          <span className="ml-1 text-sm text-gray-500">
            employee{employeesWithOutput.length !== 1 ? 's' : ''} producing
          </span>
        </div>
        {deliverables.length > 0 && (
          <>
            <div className="h-4 w-px bg-gray-200" />
            <div>
              <span className="text-sm font-medium text-gray-700">
                {Math.round(
                  deliverables.reduce(
                    (sum, d) =>
                      sum + (d.task.output?.split(/\s+/).filter(Boolean).length ?? 0),
                    0,
                  ) / 1000,
                )}K
              </span>
              <span className="ml-1 text-sm text-gray-500">words total</span>
            </div>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search deliverables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
          />
        </div>

        {/* Employee filter */}
        <select
          value={filterEmployee || ''}
          onChange={(e) => setFilterEmployee(e.target.value || null)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
        >
          <option value="">All employees</option>
          {employees
            .filter((e) => employeesWithOutput.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.icon} {e.name}
              </option>
            ))}
        </select>
      </div>

      {/* Deliverables list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="mb-3 text-4xl">📄</div>
          <h3 className="text-base font-semibold text-gray-900">
            {deliverables.length === 0
              ? 'No deliverables yet'
              : 'No matching deliverables'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            {deliverables.length === 0
              ? 'Run a task for one of your AI employees and their output will appear here.'
              : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const priority = TASK_PRIORITY_INFO[d.task.priority] || TASK_PRIORITY_INFO.medium;
            const wordCount = d.task.output?.split(/\s+/).filter(Boolean).length ?? 0;
            const isCopied = copiedId === d.task.id;
            const completedDate = new Date(
              d.task.updatedAt || d.task.createdAt,
            ).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            // Preview: first 200 chars of output
            const preview = d.task.output
              ? d.task.output.replace(/^#{1,4}\s+/gm, '').slice(0, 200)
              : '';

            return (
              <div
                key={d.task.id}
                className="group rounded-xl border border-gray-100 bg-white transition-all hover:border-gray-200 hover:shadow-sm"
              >
                <div className="px-5 py-4">
                  {/* Top row: employee + date */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{d.employee.icon}</span>
                      <span className="text-xs font-medium text-gray-500">
                        {d.employee.name}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          color: priority.color,
                          backgroundColor: priority.bgColor,
                        }}
                      >
                        {priority.label}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{completedDate}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                    {d.task.title}
                  </h3>

                  {/* Preview text */}
                  {preview && (
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-500 line-clamp-2">
                      {preview}
                      {(d.task.output?.length ?? 0) > 200 && '...'}
                    </p>
                  )}

                  {/* Bottom row: meta + actions */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span>{wordCount.toLocaleString()} words</span>
                      {d.task.durationMs && (
                        <span>
                          {d.task.durationMs > 60000
                            ? `${(d.task.durationMs / 60000).toFixed(1)}m`
                            : `${(d.task.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      )}
                      {d.task.tokensUsed && (
                        <span>{d.task.tokensUsed.toLocaleString()} tokens</span>
                      )}
                    </div>

                    {/* Actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleCopy(d.task)}
                        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      >
                        {isCopied ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2.5 7.5l3 3 6-6" />
                            </svg>
                            <span className="text-[#22C55E]">Copied</span>
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
                              <path d="M9.5 4.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v5A1.5 1.5 0 003 9.5h1.5" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleView(d)}
                        className="flex items-center gap-1 rounded-md bg-[#4F3588] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
                      >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z" />
                          <circle cx="7" cy="7" r="2" />
                        </svg>
                        View
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

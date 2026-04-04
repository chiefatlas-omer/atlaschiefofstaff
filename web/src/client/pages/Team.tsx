import React, { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Employee,
  ActivityEntry,
  Routine,
  Role,
  Blueprint,
  TrustLevel,
  HireCustomization,
} from '../lib/team-types';
import { teamApi } from '../lib/team-api';

// Tab components
import OrgChart from '../components/team/OrgChart';
import EmployeeProfile from '../components/team/EmployeeProfile';
import { HireTab } from '../components/team/HireTab';
import { ActivityTab } from '../components/team/ActivityTab';
import { ScheduleTab } from '../components/team/ScheduleTab';
import { PayrollTab } from '../components/team/PayrollTab';
import { DeliverablesTab } from '../components/team/DeliverablesTab';
import OutputViewer from '../components/team/OutputViewer';
import type { OutputViewerData } from '../components/team/OutputViewer';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'org-chart', label: 'Org Chart' },
  { id: 'hire', label: 'Hire' },
  { id: 'activity', label: 'Activity' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'payroll', label: 'Payroll' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Team page — powered by real backend API
// ---------------------------------------------------------------------------
export default function Team() {
  const [activeTab, setActiveTab] = useState<TabId>('org-chart');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [executionReady, setExecutionReady] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [outputViewerData, setOutputViewerData] = useState<OutputViewerData | null>(null);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  // Orchestration engine connection status
  const [pcStatus, setPcStatus] = useState<{
    connected: boolean;
    mode: 'live' | 'local';
    version: string | null;
    agents: number;
  }>({ connected: false, mode: 'local', version: null, agents: 0 });

  // ── Load data from API on mount ─────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [emps, acts, rts, rls, bps, status] = await Promise.all([
        teamApi.employees(),
        teamApi.activity(),
        teamApi.routines(),
        teamApi.roles(),
        teamApi.blueprints(),
        teamApi.status().catch(() => null),
      ]);
      setEmployees(emps);
      setActivity(acts);
      setRoutines(rts);
      setRoles(rls);
      setBlueprints(bps);
      if (status) {
        setPcStatus({
          connected: status.paperclipConnected,
          mode: status.mode,
          version: status.paperclipVersion ?? null,
          agents: status.paperclipAgents ?? 0,
        });
        setExecutionReady(status.executionReady ?? false);
      }
    } catch (err) {
      console.error('[Team] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-seed demo data if user has no employees ─────────────────────
  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      const result = await teamApi.seed();
      setEmployees(result.employees);
      setActivity(result.activity);
      setRoutines(result.routines);
    } catch (err) {
      console.error('[Team] Seed failed:', err);
    } finally {
      setSeeding(false);
    }
  }, []);

  // ── Selected employee ───────────────────────────────────────────────
  const selectedEmployee = selectedEmployeeId
    ? employees.find((e) => e.id === selectedEmployeeId) ?? null
    : null;

  // ── Handlers — all call the API then update local state ────────────

  const handleHire = useCallback(async (data: HireCustomization) => {
    try {
      const { role, customName, standingInstructions, hoursAllocated, trustLevel, model } = data;
      const newEmp = await teamApi.hireEmployee({
        name: customName || role.name,
        role: role.name,
        department: role.department,
        departmentLabel: role.departmentLabel,
        icon: role.icon,
        skills: role.skills,
        estimatedHours: hoursAllocated,
        standingInstructions: standingInstructions || undefined,
        trustLevel,
        model,
      });
      setEmployees((prev) => [...prev, newEmp]);
      // Auto-open the new employee's profile so the user can configure them immediately
      setSelectedEmployeeId(newEmp.id);
    } catch (err) {
      console.error('[Team] Hire failed:', err);
    }
  }, []);

  const handleImportBlueprint = useCallback(async (blueprint: Blueprint) => {
    try {
      const result = await teamApi.deployBlueprint(blueprint.id);
      setEmployees((prev) => [...prev, ...result.employees]);
      setRoutines((prev) => [...prev, ...result.routines]);
      // Switch to Org Chart so user can see their new team
      setActiveTab('org-chart');
    } catch (err) {
      console.error('[Team] Blueprint deploy failed:', err);
    }
  }, []);

  const handleApprove = useCallback(async (activityId: string) => {
    try {
      const updated = await teamApi.approveActivity(activityId, true);
      setActivity((prev) =>
        prev.map((a) => (a.id === activityId ? updated : a)),
      );
      // Refresh employees to get updated approval count
      const emps = await teamApi.employees();
      setEmployees(emps);
    } catch (err) {
      console.error('[Team] Approve failed:', err);
    }
  }, []);

  const handleReject = useCallback(async (activityId: string) => {
    try {
      const updated = await teamApi.approveActivity(activityId, false);
      setActivity((prev) =>
        prev.map((a) => (a.id === activityId ? updated : a)),
      );
    } catch (err) {
      console.error('[Team] Reject failed:', err);
    }
  }, []);

  const handlePromote = useCallback(async (employeeId: string) => {
    try {
      const updated = await teamApi.promoteEmployee(employeeId);
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? updated : e)),
      );
    } catch (err) {
      console.error('[Team] Promote failed:', err);
    }
  }, []);

  const handleAddRoutine = useCallback(async (routine: Omit<Routine, 'id'>) => {
    try {
      const created = await teamApi.createRoutine(routine);
      setRoutines((prev) => [...prev, created]);
    } catch (err) {
      console.error('[Team] Add routine failed:', err);
    }
  }, []);

  const handleToggleRoutine = useCallback(async (routineId: string) => {
    try {
      const current = routines.find((r) => r.id === routineId);
      if (!current) return;
      const updated = await teamApi.updateRoutine(routineId, { enabled: !current.enabled });
      setRoutines((prev) =>
        prev.map((r) => (r.id === routineId ? updated : r)),
      );
    } catch (err) {
      console.error('[Team] Toggle routine failed:', err);
    }
  }, [routines]);

  const handleTogglePause = useCallback(async (employeeId: string) => {
    try {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return;
      const newStatus = emp.status === 'paused' ? 'idle' : 'paused';
      const updated = await teamApi.updateEmployee(employeeId, { status: newStatus });
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? updated : e)),
      );
    } catch (err) {
      console.error('[Team] Toggle pause failed:', err);
    }
  }, [employees]);

  const handleUpdateHours = useCallback(async (employeeId: string, hours: number) => {
    try {
      const updated = await teamApi.updateEmployee(employeeId, { hoursAllocated: hours });
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? updated : e)),
      );
    } catch (err) {
      console.error('[Team] Update hours failed:', err);
    }
  }, []);

  const handleUpdateTrust = useCallback(async (employeeId: string, level: TrustLevel) => {
    try {
      const updated = await teamApi.updateEmployee(employeeId, { trustLevel: level });
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? updated : e)),
      );
    } catch (err) {
      console.error('[Team] Update trust failed:', err);
    }
  }, []);

  const handleRemoveEmployee = useCallback(async (employeeId: string) => {
    try {
      await teamApi.removeEmployee(employeeId);
      setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
      setRoutines((prev) => prev.filter((r) => r.employeeId !== employeeId));
      setSelectedEmployeeId(null);
    } catch (err) {
      console.error('[Team] Remove failed:', err);
    }
  }, []);

  // ── Bulk operations ────────────────────────────────────────────────

  const handlePauseAll = useCallback(async () => {
    try {
      const updated = await teamApi.pauseAll();
      setEmployees(updated);
    } catch (err) { console.error('[Team] Pause all failed:', err); }
  }, []);

  const handleResumeAll = useCallback(async () => {
    try {
      const updated = await teamApi.resumeAll();
      setEmployees(updated);
    } catch (err) { console.error('[Team] Resume all failed:', err); }
  }, []);

  const handleResetTeam = useCallback(async () => {
    if (!confirm('This will delete all AI team data. Are you sure?')) return;
    try {
      await teamApi.resetTeam();
      setEmployees([]);
      setActivity([]);
      setRoutines([]);
    } catch (err) { console.error('[Team] Reset failed:', err); }
  }, []);

  // ── Derived state for bulk buttons ────────────────────────────────
  const hasNonPausedEmployees = employees.some((e) => e.status !== 'paused');
  const hasPausedEmployees = employees.some((e) => e.status === 'paused');

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My AI Team</h1>
          <p className="text-sm text-gray-500 mt-1">Loading your team...</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#4F3588] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Empty state — no employees yet ─────────────────────────────────
  if (employees.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My AI Team</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your AI Team</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">🧠</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No team members yet</h2>
          <p className="text-gray-500 mb-6 max-w-md">
            Get started by loading a demo team to explore the feature, or head to the Hire tab to build your own.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-5 py-2.5 bg-[#4F3588] text-white text-sm font-medium rounded-lg hover:bg-[#5A3C9E] transition-colors disabled:opacity-50"
            >
              {seeding ? 'Setting up...' : 'Load Demo Team'}
            </button>
            <button
              onClick={() => setActiveTab('hire')}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Hire Your First Employee
            </button>
          </div>
        </div>
        {/* Still show Hire tab if they click the button */}
        {activeTab === 'hire' && (
          <HireTab
            roles={roles}
            blueprints={blueprints}
            employees={employees}
            onHire={handleHire}
            onImportBlueprint={handleImportBlueprint}
          />
        )}
      </div>
    );
  }

  // ── Tab renderer ───────────────────────────────────────────────────
  function renderTab() {
    switch (activeTab) {
      case 'org-chart':
        return (
          <OrgChart
            employees={employees}
            onSelectEmployee={setSelectedEmployeeId}
            selectedEmployeeId={selectedEmployeeId}
          />
        );
      case 'hire':
        return (
          <HireTab
            roles={roles}
            blueprints={blueprints}
            employees={employees}
            onHire={handleHire}
            onImportBlueprint={handleImportBlueprint}
          />
        );
      case 'activity':
        return (
          <ActivityTab
            activity={activity}
            employees={employees}
            onApprove={handleApprove}
            onReject={handleReject}
            onPromote={handlePromote}
            onSelectEmployee={setSelectedEmployeeId}
          />
        );
      case 'deliverables':
        return (
          <DeliverablesTab
            employees={employees}
            onViewOutput={setOutputViewerData}
          />
        );
      case 'schedule':
        return (
          <ScheduleTab
            routines={routines}
            employees={employees}
            onAddRoutine={handleAddRoutine}
            onToggleRoutine={handleToggleRoutine}
          />
        );
      case 'payroll':
        return (
          <PayrollTab
            employees={employees}
            onTogglePause={handleTogglePause}
            onUpdateHours={handleUpdateHours}
            onSelectEmployee={setSelectedEmployeeId}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My AI Team</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your AI Team</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {hasNonPausedEmployees && (
              <button
                onClick={handlePauseAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pause All
              </button>
            )}
            {hasPausedEmployees && (
              <button
                onClick={handleResumeAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Resume All
              </button>
            )}
            {/* More menu */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className="flex items-center justify-center w-7 h-7 text-gray-400 rounded-md hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <button
                    onClick={() => { setShowMoreMenu(false); handleResetTeam(); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Reset Team...
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Orchestration status */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: pcStatus.connected ? '#22C55E' : '#9CA3AF' }}
            />
            <span className="text-xs font-medium text-gray-700">
              {pcStatus.connected ? 'Orchestration Active' : 'Local Mode'}
            </span>
            {pcStatus.connected && pcStatus.version && (
              <span className="text-[10px] text-gray-400">v{pcStatus.version}</span>
            )}
            {pcStatus.connected && pcStatus.agents > 0 && (
              <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]">
                {pcStatus.agents} agent{pcStatus.agents !== 1 ? 's' : ''}
              </span>
            )}
            {executionReady && (
              <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]">
                AI Ready
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Team tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-[#4F3588] text-[#4F3588]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content with fade-in animation */}
      <div key={activeTab} className="animate-[fadeInUp_0.25s_ease-out]">
        {renderTab()}
      </div>

      {/* Employee Profile slide-out */}
      {selectedEmployee && (
        <EmployeeProfile
          employee={selectedEmployee}
          onClose={() => setSelectedEmployeeId(null)}
          onUpdateTrust={handleUpdateTrust}
          onTogglePause={handleTogglePause}
          onRemove={handleRemoveEmployee}
          onTaskRun={() => teamApi.activity().then(setActivity).catch(() => {})}
          onViewOutput={setOutputViewerData}
        />
      )}

      {/* Full output viewer panel */}
      <OutputViewer
        data={outputViewerData}
        onClose={() => setOutputViewerData(null)}
      />
    </div>
  );
}

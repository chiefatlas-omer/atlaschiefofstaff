import { fetchApi } from './api';
import type { Employee, Role, Blueprint, ActivityEntry, Routine, Task, JournalEntry, MetricsSnapshot, TaskRunResult } from './team-types';

// ---------------------------------------------------------------------------
// AI Team API client — talks to /api/team/* backend routes
// ---------------------------------------------------------------------------

export const teamApi = {
  // -- Employees --
  employees: () => fetchApi<Employee[]>('/api/team/employees'),

  hireEmployee: (data: {
    name: string;
    role: string;
    department: string;
    departmentLabel: string;
    icon: string;
    skills: string[];
    estimatedHours: number;
    standingInstructions?: string;
    trustLevel?: string;
    model?: string;
  }) =>
    fetchApi<Employee>('/api/team/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEmployee: (id: string, data: Partial<Employee>) =>
    fetchApi<Employee>(`/api/team/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  removeEmployee: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/team/employees/${id}`, {
      method: 'DELETE',
    }),

  promoteEmployee: (id: string) =>
    fetchApi<Employee>(`/api/team/employees/${id}/promote`, {
      method: 'POST',
    }),

  // -- Activity --
  activity: (employeeId?: string) =>
    fetchApi<ActivityEntry[]>(
      employeeId
        ? `/api/team/activity?employeeId=${encodeURIComponent(employeeId)}`
        : '/api/team/activity',
    ),

  approveActivity: (id: string, approved: boolean) =>
    fetchApi<ActivityEntry>(`/api/team/activity/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ approved }),
    }),

  // -- Routines --
  routines: (employeeId?: string) =>
    fetchApi<Routine[]>(
      employeeId
        ? `/api/team/routines?employeeId=${encodeURIComponent(employeeId)}`
        : '/api/team/routines',
    ),

  createRoutine: (data: Omit<Routine, 'id'>) =>
    fetchApi<Routine>('/api/team/routines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRoutine: (id: string, data: Partial<Routine>) =>
    fetchApi<Routine>(`/api/team/routines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteRoutine: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/team/routines/${id}`, {
      method: 'DELETE',
    }),

  // -- Tasks --
  tasks: (employeeId: string) =>
    fetchApi<Task[]>(`/api/team/employees/${employeeId}/tasks`),

  createTask: (employeeId: string, data: { title: string; description?: string; priority?: string }) =>
    fetchApi<Task>(`/api/team/employees/${employeeId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (taskId: string, data: Partial<Task>) =>
    fetchApi<Task>(`/api/team/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTask: (taskId: string) =>
    fetchApi<{ success: boolean }>(`/api/team/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  runTask: (taskId: string, context?: string) =>
    fetchApi<TaskRunResult>(`/api/team/tasks/${taskId}/run`, {
      method: 'POST',
      body: JSON.stringify({ context }),
    }),

  // -- Journal --
  journal: (employeeId: string, type?: string) =>
    fetchApi<JournalEntry[]>(
      type
        ? `/api/team/employees/${employeeId}/journal?type=${encodeURIComponent(type)}`
        : `/api/team/employees/${employeeId}/journal`,
    ),

  createJournalEntry: (employeeId: string, data: { date: string; type: string; title: string; content: string; tags?: string[] }) =>
    fetchApi<JournalEntry>(`/api/team/employees/${employeeId}/journal`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // -- Static catalogs --
  roles: () => fetchApi<Role[]>('/api/team/roles'),
  blueprints: () => fetchApi<Blueprint[]>('/api/team/blueprints'),

  // -- Deploy & Seed --
  deployBlueprint: (blueprintId: string) =>
    fetchApi<{ employees: Employee[]; routines: Routine[] }>(
      `/api/team/blueprints/${blueprintId}/deploy`,
      { method: 'POST' },
    ),

  seed: () =>
    fetchApi<{ employees: Employee[]; activity: ActivityEntry[]; routines: Routine[] }>(
      '/api/team/seed',
      { method: 'POST' },
    ),

  // -- Training Materials --
  addTrainingMaterial: (employeeId: string, fileName: string) =>
    fetchApi<Employee>(`/api/team/employees/${employeeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ addTrainingMaterial: fileName }),
    }),

  removeTrainingMaterial: (employeeId: string, fileName: string) =>
    fetchApi<Employee>(`/api/team/employees/${employeeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ removeTrainingMaterial: fileName }),
    }),

  // -- Bulk operations --
  pauseAll: () =>
    fetchApi<Employee[]>('/api/team/bulk/pause-all', { method: 'POST' }),

  resumeAll: () =>
    fetchApi<Employee[]>('/api/team/bulk/resume-all', { method: 'POST' }),

  resetTeam: () =>
    fetchApi<{ success: boolean }>('/api/team/bulk/reset', { method: 'DELETE' }),

  // -- Metrics --
  metrics: (employeeId?: string) =>
    fetchApi<MetricsSnapshot[]>(
      employeeId
        ? `/api/team/metrics/${encodeURIComponent(employeeId)}`
        : '/api/team/metrics',
    ),

  captureMetrics: () =>
    fetchApi<{ date: string; snapshots: any[] }>('/api/team/metrics/snapshot', {
      method: 'POST',
    }),

  // -- Orchestration status --
  status: () =>
    fetchApi<{
      paperclipConnected: boolean;
      companyId: string | null;
      mode: 'live' | 'local';
      paperclipVersion?: string | null;
      paperclipAgents?: number;
      executionReady?: boolean;
    }>('/api/team/status'),
};

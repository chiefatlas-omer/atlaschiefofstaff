// Trust levels - progressive autonomy
export type TrustLevel = 'supervised' | 'trusted' | 'autonomous';

// AI model selection — per-employee quality/speed tradeoff
export type AgentModel = 'sonnet' | 'opus';

export const AGENT_MODEL_INFO: Record<AgentModel, { label: string; description: string; color: string; bgColor: string }> = {
  sonnet: { label: 'Sonnet', description: 'Fast and efficient — great for routine tasks', color: '#3B82F6', bgColor: '#DBEAFE' },
  opus: { label: 'Opus', description: 'Maximum quality — best for complex, high-stakes work', color: '#4F3588', bgColor: '#F3F1FC' },
};

// Employee status
export type EmployeeStatus = 'working' | 'idle' | 'paused';

// Department
export type Department = 'sales_marketing' | 'operations' | 'customer_service';

// Soul — personality profile for each employee
export interface Soul {
  personality: string;
  workingStyle: string;
  decisionFramework: string;
  strengths: string[];
  growthAreas: string[];
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: Department;
  departmentLabel: string;
  status: EmployeeStatus;
  trustLevel: TrustLevel;
  reportsTo: string | null; // employee id or null for top-level
  icon: string; // emoji
  skills: string[];
  trainingMaterials: string[]; // file names
  standingInstructions: string;
  hoursUsed: number;
  hoursAllocated: number;
  approvalsCount: number; // number of approved deliverables
  deliverablesCount: number;
  hireDate: string; // ISO date string
  isChiefOfStaff: boolean;
  soul?: Soul;
  model?: AgentModel;
}

export interface Role {
  id: string;
  name: string;
  department: Department;
  departmentLabel: string;
  icon: string;
  description: string;
  skills: string[];
  estimatedHours: number;
  responsibilities: string[];
  sampleTasks: string[];
}

// Data passed from the RoleDetailPanel when hiring with customizations
export interface HireCustomization {
  role: Role;
  customName: string;
  standingInstructions: string;
  hoursAllocated: number;
  trustLevel: TrustLevel;
  model: AgentModel;
}

export interface Blueprint {
  id: string;
  name: string;
  icon: string;
  industry: string;
  teamSize: number;
  roles: string[]; // role names preview
  description: string;
}

// Activity status
export type ActivityStatus = 'success' | 'failure' | 'partial' | 'pending';

export interface ActivityEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeIcon: string;
  action: string;
  detail: string;
  timestamp: string; // ISO
  needsApproval: boolean;
  approved: boolean | null; // null = pending
  deliverablePreview?: string;
  status: ActivityStatus;
  failureReason?: string;
  failureStep?: string;
  retryCount?: number;
  resolution?: string;
}

export interface Routine {
  id: string;
  employeeId: string;
  name: string;
  description: string;
  days: string[]; // 'mon', 'tue', etc.
  time: string; // '09:00'
  enabled: boolean;
}

// Task priority
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Task status
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled' | 'failed';

export interface Task {
  id: string;
  employeeId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  output?: string; // AI-generated result
  tokensUsed?: number;
  durationMs?: number;
  failureReason?: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
}

// Performance metrics snapshot
export interface MetricsSnapshot {
  id: string;
  employeeId: string;
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  approvalsReceived: number;
  rejectionsReceived: number;
  hoursUsed: number;
  journalEntries: number;
  failureCount: number;
}

// Task run result from the backend
export interface TaskRunResult {
  task: Task;
  activity: ActivityEntry;
  needsApproval: boolean;
}

// Journal entry types
export type JournalEntryType = 'work_log' | 'learning' | 'failure' | 'insight';

export interface JournalEntry {
  id: string;
  employeeId: string;
  date: string; // ISO date
  type: JournalEntryType;
  title: string;
  content: string;
  tags: string[];
}

export const JOURNAL_TYPE_INFO: Record<JournalEntryType, { label: string; icon: string; color: string; bgColor: string }> = {
  work_log: { label: 'Work Log', icon: '📝', color: '#4F3588', bgColor: '#F3F1FC' },
  learning: { label: 'Learning', icon: '💡', color: '#F59E0B', bgColor: '#FEF3C7' },
  failure: { label: 'Issue', icon: '⚠️', color: '#EF4444', bgColor: '#FEE2E2' },
  insight: { label: 'Insight', icon: '🔍', color: '#3B82F6', bgColor: '#DBEAFE' },
};

export const ACTIVITY_STATUS_INFO: Record<ActivityStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  success: { label: 'Completed', color: '#22C55E', bgColor: '#DCFCE7', icon: '✓' },
  failure: { label: 'Failed', color: '#EF4444', bgColor: '#FEE2E2', icon: '✕' },
  partial: { label: 'Partial', color: '#F59E0B', bgColor: '#FEF3C7', icon: '◐' },
  pending: { label: 'Pending', color: '#6B7280', bgColor: '#F3F4F6', icon: '○' },
};

export const TASK_PRIORITY_INFO: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: '#6B7280', bgColor: '#F3F4F6' },
  medium: { label: 'Medium', color: '#3B82F6', bgColor: '#DBEAFE' },
  high: { label: 'High', color: '#F59E0B', bgColor: '#FEF3C7' },
  urgent: { label: 'Urgent', color: '#EF4444', bgColor: '#FEE2E2' },
};

export const TASK_STATUS_INFO: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  todo: { label: 'To Do', color: '#6B7280', bgColor: '#F3F4F6' },
  in_progress: { label: 'Running', color: '#3B82F6', bgColor: '#DBEAFE' },
  done: { label: 'Done', color: '#22C55E', bgColor: '#DCFCE7' },
  failed: { label: 'Failed', color: '#EF4444', bgColor: '#FEE2E2' },
  cancelled: { label: 'Cancelled', color: '#9CA3AF', bgColor: '#F3F4F6' },
};

// Department display info
export const DEPARTMENT_INFO: Record<Department, { label: string; color: string; bgColor: string }> = {
  sales_marketing: { label: 'Sales & Marketing', color: '#4F3588', bgColor: '#F3F1FC' },
  operations: { label: 'Operations', color: '#EA580C', bgColor: '#FFF7ED' },
  customer_service: { label: 'Customer Service', color: '#16A34A', bgColor: '#F0FDF4' },
};

export const TRUST_LEVEL_INFO: Record<TrustLevel, { label: string; color: string; bgColor: string; description: string }> = {
  supervised: { label: 'Supervised', color: '#EAB308', bgColor: '#FEF9C3', description: 'Every deliverable needs your approval' },
  trusted: { label: 'Trusted', color: '#3B82F6', bgColor: '#DBEAFE', description: 'Only important work needs approval' },
  autonomous: { label: 'Autonomous', color: '#22C55E', bgColor: '#DCFCE7', description: 'Works independently, reports results' },
};

export const STATUS_INFO: Record<EmployeeStatus, { label: string; color: string }> = {
  working: { label: 'Working', color: '#22C55E' },
  idle: { label: 'Idle', color: '#9CA3AF' },
  paused: { label: 'Paused', color: '#EF4444' },
};

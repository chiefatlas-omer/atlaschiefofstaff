// Trust levels - progressive autonomy
export type TrustLevel = 'supervised' | 'trusted' | 'autonomous';

// Employee status
export type EmployeeStatus = 'working' | 'idle' | 'paused';

// Department
export type Department = 'sales_marketing' | 'operations' | 'customer_service';

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

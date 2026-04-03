/**
 * Paperclip Bridge — translates business-friendly "My Team" operations into
 * Paperclip control-plane API calls.
 *
 * Paperclip runs as a sidecar on localhost:3100.  If it's unavailable the
 * bridge returns null so callers can fall back to the local SQLite store.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAPERCLIP_URL = process.env.PAPERCLIP_URL || 'http://127.0.0.1:3100';
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || '';

// Cents-to-hours conversion.  Default: $0.50/hr (so 100 cents = 2 hours).
const CENTS_PER_HOUR = Number(process.env.PAPERCLIP_CENTS_PER_HOUR) || 50;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface FetchOpts {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function pcFetch<T = any>(path: string, opts: FetchOpts = {}): Promise<T | null> {
  const url = new URL(path, PAPERCLIP_URL);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PAPERCLIP_API_KEY) headers['Authorization'] = `Bearer ${PAPERCLIP_API_KEY}`;

  try {
    const res = await fetch(url.toString(), {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      console.error(`[paperclip] ${opts.method || 'GET'} ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    // Paperclip not running — that's fine, caller falls back to local DB
    return null;
  }
}

// ---------------------------------------------------------------------------
// Health check — is Paperclip reachable?
// ---------------------------------------------------------------------------

let _alive: boolean | null = null;
let _aliveCheckedAt = 0;

export async function isPaperclipAlive(): Promise<boolean> {
  if (_alive !== null && Date.now() - _aliveCheckedAt < 30_000) return _alive;
  try {
    const r = await fetch(`${PAPERCLIP_URL}/api/companies`, {
      headers: PAPERCLIP_API_KEY ? { Authorization: `Bearer ${PAPERCLIP_API_KEY}` } : {},
      signal: AbortSignal.timeout(2000),
    });
    _alive = r.ok;
  } catch {
    _alive = false;
  }
  _aliveCheckedAt = Date.now();
  return _alive;
}

// ---------------------------------------------------------------------------
// Vocabulary translation helpers
// ---------------------------------------------------------------------------

/** Paperclip agent status → friendly employee status */
function toEmployeeStatus(agentStatus: string): string {
  const map: Record<string, string> = {
    running: 'working',
    idle: 'idle',
    paused: 'paused',
    error: 'paused',
    pending_approval: 'training',
  };
  return map[agentStatus] || 'idle';
}

/** Friendly status → Paperclip agent status */
function fromEmployeeStatus(status: string): string {
  const map: Record<string, string> = {
    working: 'running',
    idle: 'idle',
    paused: 'paused',
    training: 'idle',
  };
  return map[status] || 'idle';
}

/** Convert Paperclip budget cents → work hours */
function centsToHours(cents: number): number {
  return Math.round(cents / CENTS_PER_HOUR);
}

/** Convert work hours → Paperclip budget cents */
function hoursToCents(hours: number): number {
  return hours * CENTS_PER_HOUR;
}

/** Paperclip role string → department mapping */
function roleToDepartment(role: string): { department: string; departmentLabel: string } {
  const map: Record<string, { department: string; departmentLabel: string }> = {
    ceo: { department: 'operations', departmentLabel: 'Operations' },
    manager: { department: 'operations', departmentLabel: 'Operations' },
    engineer: { department: 'operations', departmentLabel: 'Operations' },
    researcher: { department: 'sales_marketing', departmentLabel: 'Sales & Marketing' },
    writer: { department: 'sales_marketing', departmentLabel: 'Sales & Marketing' },
    analyst: { department: 'operations', departmentLabel: 'Operations' },
    designer: { department: 'sales_marketing', departmentLabel: 'Sales & Marketing' },
    support: { department: 'customer_service', departmentLabel: 'Customer Service' },
  };
  return map[role] || { department: 'operations', departmentLabel: 'Operations' };
}

// ---------------------------------------------------------------------------
// Paperclip agent → Employee DTO
// ---------------------------------------------------------------------------

interface PaperclipAgent {
  id: string;
  name: string;
  role: string;
  title?: string;
  companyId: string;
  reportsTo?: string;
  capabilities?: string;
  status: string;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
  chainOfCommand?: Array<{ id: string; name: string; role: string; title: string }>;
}

function agentToEmployee(agent: PaperclipAgent) {
  const dept = roleToDepartment(agent.role);
  const isCos = agent.role === 'ceo';
  return {
    id: agent.id,
    name: agent.title || agent.name,
    role: agent.title || agent.name,
    department: dept.department,
    departmentLabel: dept.departmentLabel,
    status: toEmployeeStatus(agent.status),
    trustLevel: isCos ? 'autonomous' : 'supervised',
    reportsTo: agent.reportsTo || null,
    icon: isCos ? '🧠' : '👤',
    skills: agent.capabilities ? agent.capabilities.split(',').map((s: string) => s.trim()) : [],
    trainingMaterials: [],
    standingInstructions: '',
    hoursUsed: centsToHours(agent.spentMonthlyCents || 0),
    hoursAllocated: centsToHours(agent.budgetMonthlyCents || 0),
    approvalsCount: 0,
    deliverablesCount: 0,
    hireDate: null,
    isChiefOfStaff: isCos,
  };
}

// ---------------------------------------------------------------------------
// Bridge methods — each returns null if Paperclip is down
// ---------------------------------------------------------------------------

export interface BridgeEmployee extends ReturnType<typeof agentToEmployee> {}

/**
 * List all AI employees for a company.
 */
export async function listEmployees(companyId: string): Promise<BridgeEmployee[] | null> {
  const agents = await pcFetch<PaperclipAgent[]>(`/api/companies/${companyId}/agents`);
  if (!agents) return null;
  return agents.map(agentToEmployee);
}

/**
 * Get a single employee by agent ID.
 */
export async function getEmployee(agentId: string): Promise<BridgeEmployee | null> {
  const agent = await pcFetch<PaperclipAgent>(`/api/agents/${agentId}`);
  if (!agent) return null;
  return agentToEmployee(agent);
}

/**
 * Hire a new AI employee — maps to Paperclip agent-hire request.
 */
export async function hireEmployee(
  companyId: string,
  opts: {
    name: string;
    role: string;
    capabilities?: string;
    hoursAllocated?: number;
    reportsTo?: string;
  },
): Promise<BridgeEmployee | null> {
  const result = await pcFetch<PaperclipAgent>(`/api/companies/${companyId}/agent-hires`, {
    method: 'POST',
    body: {
      name: opts.name.replace(/\s+/g, ''),
      role: 'engineer', // Paperclip role type
      title: opts.name,
      reportsTo: opts.reportsTo || undefined,
      capabilities: opts.capabilities || opts.role,
      budgetMonthlyCents: hoursToCents(opts.hoursAllocated || 20),
    },
  });
  if (!result) return null;
  return agentToEmployee(result);
}

/**
 * Update employee status or budget.
 */
export async function updateEmployee(
  agentId: string,
  updates: { status?: string; hoursAllocated?: number },
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (updates.status) body.status = fromEmployeeStatus(updates.status);
  if (updates.hoursAllocated !== undefined) body.budgetMonthlyCents = hoursToCents(updates.hoursAllocated);

  const result = await pcFetch(`/api/agents/${agentId}`, { method: 'PATCH', body });
  return result !== null;
}

/**
 * Get activity feed for a company — maps Paperclip activity log to our format.
 */
export async function listActivity(companyId: string): Promise<any[] | null> {
  const items = await pcFetch<any[]>(`/api/companies/${companyId}/activity`);
  if (!items) return null;
  return items.map((item: any) => ({
    id: item.id,
    employeeId: item.agentId || item.actorAgentId,
    employeeName: item.agentName || item.actorName || 'Unknown',
    employeeIcon: '👤',
    action: item.description || item.type || 'Activity',
    detail: item.detail || item.metadata?.detail || '',
    timestamp: item.createdAt || item.timestamp,
    needsApproval: false,
    approved: null,
    deliverablePreview: null,
  }));
}

/**
 * Get company dashboard — health overview.
 */
export async function getDashboard(companyId: string): Promise<any | null> {
  return pcFetch(`/api/companies/${companyId}/dashboard`);
}

/**
 * Get cost breakdown by agent → convert to hours for payroll view.
 */
export async function getPayroll(companyId: string): Promise<any[] | null> {
  const costs = await pcFetch<any[]>(`/api/companies/${companyId}/costs/by-agent`);
  if (!costs) return null;
  return costs.map((c: any) => ({
    agentId: c.agentId,
    agentName: c.agentName,
    hoursUsed: centsToHours(c.totalCents || 0),
    budgetHours: centsToHours(c.budgetMonthlyCents || 0),
  }));
}

/**
 * Create a task (issue) for an employee.
 */
export async function createTask(
  companyId: string,
  opts: { title: string; assigneeAgentId: string; parentId?: string; priority?: string },
): Promise<any | null> {
  return pcFetch(`/api/companies/${companyId}/issues`, {
    method: 'POST',
    body: {
      title: opts.title,
      assigneeAgentId: opts.assigneeAgentId,
      parentId: opts.parentId,
      priority: opts.priority || 'medium',
      status: 'todo',
    },
  });
}

/**
 * List tasks assigned to an employee.
 */
export async function listTasks(
  companyId: string,
  agentId: string,
): Promise<any[] | null> {
  return pcFetch(`/api/companies/${companyId}/issues`, {
    params: { assigneeAgentId: agentId },
  });
}

/**
 * Get the org chart tree from Paperclip.
 */
export async function getOrgChart(companyId: string): Promise<any | null> {
  return pcFetch(`/api/companies/${companyId}/org`);
}

/**
 * List pending approvals for review queue.
 */
export async function listApprovals(companyId: string): Promise<any[] | null> {
  return pcFetch(`/api/companies/${companyId}/approvals`, {
    params: { status: 'pending' },
  });
}

/**
 * Get all companies — used to find the user's company ID.
 */
export async function listCompanies(): Promise<any[] | null> {
  return pcFetch('/api/companies');
}

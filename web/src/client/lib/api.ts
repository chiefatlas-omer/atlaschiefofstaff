// ---- TypeScript interfaces ----

export interface DashboardData {
  tasks: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
  };
  meetings: {
    total: number;
    recentThirtyDays: number;
  };
  sops: {
    total: number;
    published: number;
  };
  decisions: {
    total: number;
    recentThirtyDays: number;
  };
  knowledgeBot: {
    entries: number;
    interactions: number;
    correctAnswers: number;
  };
  topics: {
    total: number;
    sopGenerated: number;
  };
}

export interface Task {
  id: number;
  description: string;
  owner: string | null;
  status: 'DETECTED' | 'CONFIRMED' | 'OVERDUE' | 'ESCALATED' | 'COMPLETED' | 'DISMISSED';
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  sourceMessageTs: string | null;
  channelId: string | null;
  notes: string | null;
}

export interface TaskStats {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  escalated: number;
}

export interface SOP {
  id: number;
  title: string;
  type: string;
  status: string;
  summary: string | null;
  content: string | null;
  format: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Person {
  id: number;
  name: string;
  slackId: string | null;
  email: string | null;
  role: string | null;
  company: string | null;
  createdAt: number;
}

export interface Company {
  id: number;
  name: string;
  domain: string | null;
  industry: string | null;
  createdAt: number;
}

export interface Meeting {
  id: number;
  title: string;
  date: number;
  attendees: string | null;
  summary: string | null;
  decisions: string | null;
  followUps: string | null;
  createdAt: number;
}

export interface Decision {
  id: number;
  description: string;
  owner: string | null;
  context: string | null;
  outcome: string | null;
  createdAt: number;
}

// ---- Base fetch ----

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---- Typed API methods ----

export const api = {
  dashboard: () => fetchApi<DashboardData>('/api/dashboard'),
  tasks: () => fetchApi<Task[]>('/api/tasks'),
  taskStats: () => fetchApi<TaskStats>('/api/tasks/stats'),
  sops: () => fetchApi<SOP[]>('/api/sops'),
  people: () => fetchApi<Person[]>('/api/people'),
  companies: () => fetchApi<Company[]>('/api/companies'),
  meetings: () => fetchApi<Meeting[]>('/api/meetings'),
  decisions: () => fetchApi<Decision[]>('/api/decisions'),
  ask: (question: string) =>
    fetchApi<{ answer: string; question: string; placeholder?: boolean }>('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
};

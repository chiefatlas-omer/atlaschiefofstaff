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

export interface CallAnalysis {
  id: number;
  meetingId: string | null;
  zoomMeetingId: string | null;
  title: string | null;
  date: number | null;
  duration: number | null;
  repSlackId: string | null;
  repName: string | null;
  businessName: string | null;
  businessType: string | null;
  businessStage: string | null;
  estimatedRevenue: string | null;
  employeeCount: string | null;
  objections: string[] | null;
  pains: string[] | null;
  desires: string[] | null;
  awarenessLevel: string | null;
  talkListenRatio: number | null;
  questionCount: number | null;
  openQuestionCount: number | null;
  nextSteps: string[] | null;
  outcome: string | null;
  riskFlags: string[] | null;
  summary: string | null;
  createdAt: number;
}

export interface DigestData {
  periodStart: number;
  periodEnd: number;
  totalCalls: number;
  outcomeBreakdown: Record<string, number>;
  awarenessBreakdown: Record<string, number>;
  calls: CallAnalysis[];
}

export interface ProductSignal {
  id: number;
  type: string;
  description: string;
  category: string | null;
  severity: string | null;
  verbatimQuote: string | null;
  businessName: string | null;
  businessRevenue: string | null;
  callAnalysisId: number | null;
  meetingId: string | null;
  reportedBy: string | null;
  createdAt: number;
}

export interface ProductIntelData {
  signals: ProductSignal[];
  typeBreakdown: Record<string, number>;
}

export interface OutcomeWeekData {
  meetingsPrepped: number;
  followUpsDrafted: number;
  tasksCompleted: number;
  tasksCreated: number;
  knowledgeQueries: number;
  productSignals: number;
}

export interface OutcomeData {
  timeSaved: {
    hours: number;
    minutes: number;
    roiDollars: number;
  };
  thisWeek: OutcomeWeekData;
  lastWeek: OutcomeWeekData;
  wow: {
    meetingsPrepped: number | null;
    followUpsDrafted: number | null;
    tasksCompleted: number | null;
    knowledgeQueries: number | null;
    productSignals: number | null;
  };
  taskManagement: {
    totalCreated: number;
    totalOpen: number;
    totalCompleted: number;
    completedThisMonth: number;
    overduePreventedThisMonth: number;
    completionRatePct: number;
  };
  callIntelligence: {
    callsAnalyzedThisMonth: number;
    followUpsDraftedThisMonth: number;
    coachingSessionsThisMonth: number;
    totalCallsAnalyzed: number;
  };
  knowledgeBase: {
    queriesAnsweredThisMonth: number;
    docsIngestedThisMonth: number;
    knowledgeEntriesThisMonth: number;
    sopsGeneratedThisMonth: number;
    totalSops: number;
    totalKnowledgeEntries: number;
  };
  productIntelligence: {
    signalsCapturedThisMonth: number;
    featureRequests: number;
    bugReports: number;
    churnReasons: number;
    totalSignals: number;
  };
}

export interface CoachingFlag {
  flag: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  observation: string;
  suggestion: string;
}

export interface CoachingSnapshot {
  id: number;
  repSlackId: string;
  repName: string | null;
  weekStart: number | null;
  callCount: number | null;
  avgTalkRatio: number | null;
  avgQuestionCount: number | null;
  avgOpenQuestionRatio: number | null;
  topObjections: Array<{ text: string; count: number }> | null;
  outcomeBreakdown: Record<string, number> | null;
  coachingFlags: CoachingFlag[] | null;
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
  calls: () => fetchApi<CallAnalysis[]>('/api/analytics/calls'),
  salesDigest: () => fetchApi<DigestData>('/api/analytics/digest'),
  productSignals: () => fetchApi<ProductIntelData>('/api/analytics/product'),
  coaching: () => fetchApi<CoachingSnapshot[]>('/api/analytics/coaching'),
  outcomes: () => fetchApi<OutcomeData>('/api/analytics/outcomes'),
  uploadDocument: (data: { title: string; type: string; content: string }) =>
    fetchApi<{ success: boolean; docId: string; chunkCount: number; entities: { people: number; companies: number } }>(
      '/api/knowledge/upload',
      { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } },
    ),
};

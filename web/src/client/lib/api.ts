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
    meetingsPrepped: number;
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
  id: string;
  slackUserId: string;
  slackUserName: string | null;
  description: string;
  rawMessageText: string | null;
  sourceChannelId: string | null;
  sourceMessageTs: string | null;
  sourceThreadTs: string | null;
  botReplyTs: string | null;
  status: 'DETECTED' | 'CONFIRMED' | 'OVERDUE' | 'ESCALATED' | 'COMPLETED' | 'DISMISSED';
  confidence: 'high' | 'medium' | null;
  team: 'team_a' | 'team_b' | null;
  deadlineText: string | null;
  deadline: string | null;
  completedAt: string | null;
  lastReminderAt: string | null;
  escalatedAt: string | null;
  source: 'slack' | 'zoom' | 'manual' | 'desktop';
  zoomMeetingId: string | null;
  createdAt: string;
  updatedAt: string;
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
  id: string;
  name: string;
  slackUserId: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  companyId: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  revenue: number | null;
  employeeCount: number | null;
  website: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Meeting {
  id: string;
  title: string;
  date: number | null;
  duration: number | null;
  source: string;
  zoomMeetingId: string | null;
  calendarEventId: string | null;
  transcriptText: string | null;
  summary: string | null;
  meetingType: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Decision {
  id: string;
  what: string;
  context: string | null;
  decidedBy: string | null;
  meetingId: string | null;
  sourceType: string;
  sourceRef: string | null;
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
  avgTalkRatio: number | null;
  avgQuestionsPerCall: number | null;
  coachingFlagCount: number;
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

export interface AiScoreMilestone {
  label: string;
  completed: boolean;
}

export interface AiScore {
  score: number;
  maxScore: number;
  level: 'Getting Started' | 'Growing' | 'Good' | 'Power User';
  milestones: AiScoreMilestone[];
}

export interface BriefingData {
  greeting: string;
  date: string;
  needsAttention: Array<{
    type: 'overdue_task' | 'risk_flag' | 'unprepped_meeting';
    title: string;
    subtitle: string;
    severity: 'high' | 'medium';
    taskId?: string;
    callId?: number;
    meetingId?: string;
  }>;
  todaysMeetings: Array<{
    id: string;
    title: string;
    time: string;
    hasPrep: boolean;
  }>;
  weekSummary: {
    callsAnalyzed: number;
    followUpsSent: number;
    tasksCompleted: number;
    hoursSaved: number;
    roiDollars: number;
  };
  streaks: {
    tasksCompleted: { current: number; best: number };
    callsAnalyzed: { current: number; best: number };
    systemActive: { current: number; best: number };
  };
  recentActivity: Array<{
    type: string;
    title: string;
    subtitle?: string;
    timestamp: number;
  }>;
  knowledgeStats?: {
    entries: number;
    callTranscripts: number;
    documents: number;
    recentQueries: string[];
  };
  aiScore?: AiScore;
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
  briefing: () => fetchApi<BriefingData>('/api/briefing'),
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
      '/api/upload',
      { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } },
    ),
  completeTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/tasks/${id}/complete`, { method: 'POST' }),
  pushTask: (id: string, days: number) =>
    fetchApi<{ success: boolean; newDeadline: string }>(`/api/tasks/${id}/push`, {
      method: 'POST',
      body: JSON.stringify({ days }),
      headers: { 'Content-Type': 'application/json' },
    }),
  dismissTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/tasks/${id}/dismiss`, { method: 'POST' }),
  search: (q: string) =>
    fetchApi<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  leaderboard: () => fetchApi<LeaderboardEntry[]>('/api/analytics/leaderboard'),
  emailDrafts: () => fetchApi<EmailDraft[]>('/api/email-drafts'),
  updateDraftStatus: (id: number, status: string) =>
    fetchApi<{ success: boolean }>('/api/email-drafts/' + id + '/status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  teamMembers: () => fetchApi<TeamMember[]>('/api/team'),
  addTeamMember: (data: { slackUserId: string; displayName: string; team: string; coachingRole?: string }) =>
    fetchApi<TeamMember>('/api/team', { method: 'POST', body: JSON.stringify(data) }),
  updateTeamMember: (id: number, data: { coachingRole?: string | null; team?: string; displayName?: string }) =>
    fetchApi<TeamMember>(`/api/team/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTeamMember: (id: number) =>
    fetchApi<{ success: boolean }>(`/api/team/${id}`, { method: 'DELETE' }),
  slackUsers: () => fetchApi<SlackUser[]>('/api/slack-users'),
  escalationTargets: () => fetchApi<EscalationTarget[]>('/api/escalation-targets'),
  addEscalationTarget: (data: { slackUserId: string; displayName: string; role: string }) =>
    fetchApi<EscalationTarget>('/api/escalation-targets', { method: 'POST', body: JSON.stringify(data) }),
  deleteEscalationTarget: (id: number) =>
    fetchApi<{ success: boolean }>(`/api/escalation-targets/${id}`, { method: 'DELETE' }),
};

export interface EmailDraft {
  id: number;
  recipientName: string | null;
  recipientCompany: string | null;
  recipientEmail: string | null;
  archetype: string | null;
  emailBody: string | null;
  meetingTitle: string | null;
  callAnalysisId: number | null;
  repSlackId: string | null;
  repName: string | null;
  status: string | null;
  createdAt: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  tasksCompleted: number;
  callsAnalyzed: number;
  latestGrade: string | null;
}

// ---- Search result type ----

export interface SearchResult {
  type: 'task' | 'person' | 'company' | 'meeting' | 'call' | 'document' | 'coaching';
  id: string | number;
  title: string;
  subtitle?: string;
}

export interface TeamMember {
  id: number;
  slackUserId: string;
  displayName: string | null;
  team: 'team_a' | 'team_b';
  coachingRole: 'sales' | 'cs' | 'na' | null;
  createdAt: number;
}

export interface SlackUser {
  slackUserId: string;
  displayName: string;
  email: string | null;
  avatar: string | null;
  title: string | null;
}

export interface EscalationTarget {
  id: number;
  slackUserId: string;
  displayName: string | null;
  role: 'owner' | 'manager';
  createdAt: number;
}

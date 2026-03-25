export enum AppState {
  IDLE = 'idle',
  LISTENING = 'listening',
  PROCESSING = 'processing',
  ERROR = 'error',
}

export interface Task {
  id: string;
  slackUserId: string;
  slackUserName: string | null;
  description: string;
  status: string;
  deadline: Date | null;
  deadlineText: string | null;
  source: string;
  createdAt: Date;
}

export const IPC = {
  STATUS_CHANGE: 'status:change',
  VOICE_MODE: 'voice:mode',         // 'command' or 'dictation'
  TRANSCRIPT: 'voice:transcript',
  AUDIO_DATA: 'voice:audio-data',
  DICTATION_DATA: 'voice:dictation-data',
  TASKS_UPDATE: 'tasks:update',
  TASKS_GET: 'tasks:get',
  ERROR: 'app:error',
  // Knowledge Query
  KNOWLEDGE_RESPONSE: 'knowledge:response',
  // Meeting Briefing
  BRIEFING_SHOW: 'briefing:show',
  BRIEFING_DISMISS: 'briefing:dismiss',
  // Follow-up
  FOLLOWUP_SHOW: 'followup:show',
  FOLLOWUP_SEND: 'followup:send',
  FOLLOWUP_COPY: 'followup:copy',
  FOLLOWUP_DISMISS: 'followup:dismiss',
  // Window control
  SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
} as const;

export interface MeetingBrief {
  meetingTitle: string;
  startTime: string;
  attendees: Array<{ name: string; email: string; slackId?: string }>;
  openTasks: Task[];
  suggestedTalkingPoints: string[];
}

export interface FollowUpDraft {
  to: string[];
  subject: string;
  body: string;
  meetingTitle: string;
}

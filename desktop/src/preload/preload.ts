import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channel names (can't import from ../shared/types in preload context)
const IPC = {
  STATUS_CHANGE: 'status:change',
  TRANSCRIPT: 'voice:transcript',
  AUDIO_DATA: 'voice:audio-data',
  TASKS_UPDATE: 'tasks:update',
  TASKS_GET: 'tasks:get',
  ERROR: 'app:error',
  VOICE_MODE: 'voice:mode',
  PARTIAL_TRANSCRIPT: 'voice:partial-transcript',
  PARTIAL_AUDIO: 'voice:partial-audio',
  STREAM_START: 'voice:stream-start',
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
  // Dictation completed
  DICTATION_DONE: 'voice:dictation-done',
  // Bot API
  BOT_TASKS: 'bot:tasks',
  BOT_EMAIL: 'bot:email',
  BOT_KNOWLEDGE: 'bot:knowledge',
  BOT_COPY: 'bot:copy',
} as const;

contextBridge.exposeInMainWorld('chiefOfStaff', {
  // Main -> Renderer events
  onStatusChange: (cb: (state: string) => void) => {
    ipcRenderer.on(IPC.STATUS_CHANGE, (_event, state) => cb(state));
  },
  onTranscript: (cb: (text: string) => void) => {
    ipcRenderer.on(IPC.TRANSCRIPT, (_event, text) => cb(text));
  },
  onTasksUpdate: (cb: (tasks: any[]) => void) => {
    ipcRenderer.on(IPC.TASKS_UPDATE, (_event, tasks) => cb(tasks));
  },
  onError: (cb: (message: string) => void) => {
    ipcRenderer.on(IPC.ERROR, (_event, message) => cb(message));
  },
  onDictationDone: (cb: () => void) => {
    ipcRenderer.on(IPC.DICTATION_DONE, () => cb());
  },
  onStartDictation: (cb: () => void) => {
    ipcRenderer.on('start-dictation', () => cb());
  },
  onVoiceMode: (cb: (mode: string) => void) => {
    ipcRenderer.on(IPC.VOICE_MODE, (_event, mode) => cb(mode));
  },
  onPartialTranscript: (cb: (text: string) => void) => {
    ipcRenderer.on(IPC.PARTIAL_TRANSCRIPT, (_event, text) => cb(text));
  },

  // Renderer -> Main commands
  sendAudioData: (buffer: ArrayBuffer) => {
    ipcRenderer.invoke(IPC.AUDIO_DATA, buffer);
  },
  sendPartialAudio: (buffer: ArrayBuffer) => {
    ipcRenderer.invoke(IPC.PARTIAL_AUDIO, buffer);
  },
  startStream: (sampleRate: number) => {
    ipcRenderer.invoke(IPC.STREAM_START, sampleRate);
  },
  getTasks: () => ipcRenderer.invoke(IPC.TASKS_GET),

  // Knowledge Response
  onKnowledgeResponse: (cb: (answer: string) => void) => {
    ipcRenderer.on(IPC.KNOWLEDGE_RESPONSE, (_event, answer) => cb(answer));
  },
  // Briefing
  onBriefingShow: (cb: (brief: any) => void) => {
    ipcRenderer.on(IPC.BRIEFING_SHOW, (_event, brief) => cb(brief));
  },
  dismissBriefing: () => {
    ipcRenderer.invoke(IPC.BRIEFING_DISMISS);
  },
  // Follow-up
  onFollowUpShow: (cb: (draft: any) => void) => {
    ipcRenderer.on(IPC.FOLLOWUP_SHOW, (_event, draft) => cb(draft));
  },
  sendFollowUp: (draft: any) => ipcRenderer.invoke(IPC.FOLLOWUP_SEND, draft),
  copyFollowUp: (text: string) => ipcRenderer.invoke(IPC.FOLLOWUP_COPY, text),
  dismissFollowUp: () => {
    ipcRenderer.invoke(IPC.FOLLOWUP_DISMISS);
  },
  // Window control
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.invoke(IPC.SET_IGNORE_MOUSE, ignore);
  },

  // Bot API events
  onBotTasks: (cb: (tasks: any[]) => void) => {
    ipcRenderer.on(IPC.BOT_TASKS, (_event, tasks) => cb(tasks));
  },
  onBotEmail: (cb: (response: any) => void) => {
    ipcRenderer.on(IPC.BOT_EMAIL, (_event, response) => cb(response));
  },
  onBotKnowledge: (cb: (answer: string) => void) => {
    ipcRenderer.on(IPC.BOT_KNOWLEDGE, (_event, answer) => cb(answer));
  },
  botCopy: (text: string) => ipcRenderer.invoke(IPC.BOT_COPY, text),
});

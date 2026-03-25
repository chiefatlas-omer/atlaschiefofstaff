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
  DICTATION_DATA: 'voice:dictation-data',
  // Computer Use
  COMPUTER_USE_STATUS: 'computer-use:status',
  COMPUTER_USE_RESULT: 'computer-use:result',
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

  // Voice mode
  onVoiceMode: (cb: (mode: string) => void) => {
    ipcRenderer.on(IPC.VOICE_MODE, (_event, mode) => cb(mode));
  },

  // Renderer -> Main commands
  sendAudioData: (buffer: ArrayBuffer) => {
    ipcRenderer.invoke(IPC.AUDIO_DATA, buffer);
  },
  sendDictationData: (buffer: ArrayBuffer) => {
    ipcRenderer.invoke(IPC.DICTATION_DATA, buffer);
  },
  getTasks: () => ipcRenderer.invoke(IPC.TASKS_GET),

  // Computer Use
  onComputerUseStatus: (cb: (status: string) => void) => {
    ipcRenderer.on(IPC.COMPUTER_USE_STATUS, (_event, status) => cb(status));
  },
  onComputerUseResult: (cb: (result: string) => void) => {
    ipcRenderer.on(IPC.COMPUTER_USE_RESULT, (_event, result) => cb(result));
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
});

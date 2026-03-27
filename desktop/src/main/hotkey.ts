import { globalShortcut, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';

let isListening = false;
let currentMode: 'dictation' | 'command' | null = null;
let mainWindow: BrowserWindow | null = null;

export function getVoiceMode(): 'dictation' | 'command' | null {
  return currentMode;
}

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // ── Two keys, two clear modes ──────────────────────────────
  // Backslash (\) = DICTATION — talk, text appears where cursor is
  // Insert       = COMMAND   — talk TO Atlas Chief, get answers/actions

  // Register Insert key for COMMAND mode via Electron globalShortcut
  const ok = globalShortcut.register('Insert', () => {
    console.log('[HOTKEY] Insert pressed → COMMAND mode, isListening:', isListening);
    toggleRecording('command');
  });
  if (ok) {
    console.log('[HOTKEY] Registered: Insert → command mode');
  } else {
    console.warn('[HOTKEY] Failed to register Insert key');
  }

  // Register Backslash via uiohook-napi for DICTATION mode
  // (Electron can't register '\' as a globalShortcut)
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const BACKSLASH_KEYCODE = UiohookKey?.Backslash ?? 43;
    uIOhook.on('keydown', (e: any) => {
      if (e.keycode === BACKSLASH_KEYCODE) {
        console.log('[HOTKEY] Backslash pressed → DICTATION mode, isListening:', isListening);
        toggleRecording('dictation');
      }
    });
    uIOhook.start();
    console.log('[HOTKEY] uIOhook started — Backslash → dictation mode');
  } catch (err) {
    console.warn('[HOTKEY] uIOhook not available — dictation mode requires uiohook-napi.');
    // Fallback: register Ctrl+Shift+K for dictation
    const fallbackOk = globalShortcut.register('CommandOrControl+Shift+K', () => {
      console.log('[HOTKEY] Ctrl+Shift+K pressed → DICTATION fallback');
      toggleRecording('dictation');
    });
    if (fallbackOk) console.log('[HOTKEY] Fallback registered: Ctrl+Shift+K → dictation');
  }
}

function toggleRecording(mode: 'dictation' | 'command') {
  if (!isListening) {
    isListening = true;
    currentMode = mode;
    console.log(`[HOTKEY] → startListening (${mode} mode)`);
    mainWindow?.webContents.send(IPC.VOICE_MODE, mode);
    mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'listening');
  } else {
    isListening = false;
    console.log(`[HOTKEY] → stopListening (was ${currentMode} mode)`);
    mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'processing');
    // currentMode stays set so the IPC handler knows which path to take
  }
}

export function cleanup() {
  globalShortcut.unregisterAll();
}

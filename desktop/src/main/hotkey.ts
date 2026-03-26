import { globalShortcut, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';

let isListening = false;
let mainWindow: BrowserWindow | null = null;

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // Backslash = THE one key for everything (voice command + dictation)
  // Electron doesn't support '\' as a direct accelerator, so we use uiohook-napi below.
  // Insert = fallback; Ctrl+Shift+K = secondary fallback
  const shortcuts = ['Insert', 'CommandOrControl+Shift+K'];
  for (const shortcut of shortcuts) {
    const ok = globalShortcut.register(shortcut, () => {
      console.log(`[HOTKEY] ${shortcut} pressed, isListening:`, isListening);
      toggleRecording();
    });
    if (ok) {
      console.log(`[HOTKEY] Registered: ${shortcut}`);
      break;
    } else {
      console.warn(`[HOTKEY] Failed: ${shortcut}`);
    }
  }

  // uiohook-napi: listen for Backslash key (keycode 43) as primary trigger
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const BACKSLASH_KEYCODE = UiohookKey?.Backslash ?? 43;
    uIOhook.on('keydown', (e: any) => {
      if (e.keycode === BACKSLASH_KEYCODE) {
        console.log('[HOTKEY] Backslash pressed via uiohook, isListening:', isListening);
        toggleRecording();
      }
    });
    uIOhook.start();
    console.log('[HOTKEY] uIOhook started — Backslash key mapped.');
  } catch (err) {
    console.warn('[HOTKEY] uIOhook not available — use Insert or Ctrl+Shift+K.');
  }
}

function toggleRecording() {
  if (!isListening) {
    isListening = true;
    console.log('[HOTKEY] → startListening');
    mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'listening');
  } else {
    isListening = false;
    console.log('[HOTKEY] → stopListening');
    mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'processing');
  }
}

export function cleanup() {
  globalShortcut.unregisterAll();
}

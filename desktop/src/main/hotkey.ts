import { globalShortcut, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';

let isListening = false;
let currentMode: 'command' | 'dictation' = 'command';
let mainWindow: BrowserWindow | null = null;

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // Insert = voice command mode (AI detects intent); Ctrl+Shift+K as fallback
  const commandShortcuts = ['Insert', 'CommandOrControl+Shift+K'];
  for (const shortcut of commandShortcuts) {
    const ok = globalShortcut.register(shortcut, () => {
      console.log(`[HOTKEY] ${shortcut} pressed (command mode), isListening:`, isListening);
      toggleRecording('command');
    });
    if (ok) {
      console.log(`[HOTKEY] ✓ Command mode: ${shortcut}`);
      break;
    } else {
      console.warn(`[HOTKEY] ✗ Failed: ${shortcut}`);
    }
  }

  // Backslash = explicit dictation mode (transcribe + AI polish + paste)
  // Electron doesn't support '\' as a direct accelerator, so we use F6 as the
  // globalShortcut registration and also listen for backslash via uiohook-napi below.
  // Ctrl+Shift+D remains as a fallback.
  const dictationShortcuts = ['F6', 'CommandOrControl+Shift+D'];
  for (const shortcut of dictationShortcuts) {
    const ok = globalShortcut.register(shortcut, () => {
      console.log(`[HOTKEY] ${shortcut} pressed (dictation mode), isListening:`, isListening);
      toggleRecording('dictation');
    });
    if (ok) {
      console.log(`[HOTKEY] ✓ Dictation mode: ${shortcut}`);
      break;
    } else {
      console.warn(`[HOTKEY] ✗ Failed: ${shortcut}`);
    }
  }

  // uiohook-napi: listen for Backslash key (keycode 43) as primary dictation trigger
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const BACKSLASH_KEYCODE = UiohookKey?.Backslash ?? 43;
    uIOhook.on('keydown', (e: any) => {
      if (e.keycode === BACKSLASH_KEYCODE) {
        console.log('[HOTKEY] Backslash pressed via uiohook (dictation mode), isListening:', isListening);
        toggleRecording('dictation');
      }
    });
    uIOhook.start();
    console.log('[HOTKEY] uIOhook started — Backslash key mapped to dictation mode.');
  } catch (err) {
    console.warn('[HOTKEY] uIOhook not available — use F6 or Ctrl+Shift+D for dictation.');
  }
}

function toggleRecording(mode: 'command' | 'dictation') {
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
  }
}

export function cleanup() {
  globalShortcut.unregisterAll();
}

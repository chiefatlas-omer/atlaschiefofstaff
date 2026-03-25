import { globalShortcut, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';

let isListening = false;
let currentMode: 'command' | 'dictation' = 'command';
let mainWindow: BrowserWindow | null = null;

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // Alt+A = voice command mode (AI actions)
  const commandShortcuts = ['Alt+A', 'CommandOrControl+Shift+K'];
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

  // Alt+D = dictation mode (types what you say)
  const dictationShortcuts = ['Alt+D', 'CommandOrControl+Shift+D'];
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

  // Optional: uiohook-napi for Fn key
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', (_e: any) => {});
    uIOhook.start();
    console.log('uIOhook started.');
  } catch (err) {
    console.warn('uIOhook not available on this platform.');
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

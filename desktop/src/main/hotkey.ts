import { globalShortcut, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';

let isListening = false;
let currentMode: 'dictation' | 'command' | null = null;
let mainWindow: BrowserWindow | null = null;

export function getVoiceMode(): 'dictation' | 'command' | null {
  return currentMode;
}

/**
 * Send a Backspace keystroke to the focused app to eat the '\' character
 * that leaked through before uiohook could suppress it.
 */
function eatBackslash() {
  setTimeout(() => {
    try {
      const { execSync } = require('child_process');
      execSync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')"`,
        { timeout: 2000 }
      );
      console.log('[HOTKEY] Ate leaked backslash character');
    } catch (err) {
      console.warn('[HOTKEY] Failed to eat backslash:', err);
    }
  }, 50); // small delay to ensure the '\' has been typed first
}

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // ── Two keys, two clear modes ──────────────────────────────
  // Backslash (\) = DICTATION — talk, text appears where cursor is
  // Insert       = COMMAND   — talk TO Atlas Chief, get answers/actions

  // Register Insert key for COMMAND mode via Electron globalShortcut
  // (globalShortcut consumes the key — no leaking)
  const ok = globalShortcut.register('Delete', () => {
    console.log('[HOTKEY] Delete pressed → COMMAND mode, isListening:', isListening);
    toggleRecording('command');
  });
  if (ok) {
    console.log('[HOTKEY] Registered: Delete → command mode');
  } else {
    console.warn('[HOTKEY] Failed to register Delete key');
  }

  // Register Backslash via uiohook-napi for DICTATION mode
  // (Electron can't register '\' as a globalShortcut)
  // NOTE: uiohook can't suppress the key, so we send Backspace to eat it
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const BACKSLASH_KEYCODE = UiohookKey?.Backslash ?? 43;
    uIOhook.on('keydown', (e: any) => {
      if (e.keycode === BACKSLASH_KEYCODE) {
        console.log('[HOTKEY] Backslash pressed → DICTATION mode, isListening:', isListening);
        eatBackslash(); // Remove the '\' that leaked to the focused app (both on start AND stop)
        toggleRecording('dictation');
      }
    });
    uIOhook.start();
    console.log('[HOTKEY] uIOhook started — Backslash → dictation mode');
  } catch (err) {
    console.warn('[HOTKEY] uIOhook not available — dictation mode requires uiohook-napi.');
    const fallbackOk = globalShortcut.register('CommandOrControl+Shift+K', () => {
      console.log('[HOTKEY] Ctrl+Shift+K pressed → DICTATION fallback');
      toggleRecording('dictation');
    });
    if (fallbackOk) console.log('[HOTKEY] Fallback registered: Ctrl+Shift+K → dictation');
  }
}

export function toggleRecording(mode: 'dictation' | 'command') {
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

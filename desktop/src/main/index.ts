import { app, BrowserWindow, screen, dialog } from 'electron';
import path from 'path';
import { createTray } from './tray';
import { initHotkeys, cleanup } from './hotkey';
import { registerIpcHandlers } from './ipc-handlers';
import { GoogleAuth } from './auth/google-auth';
import { CalendarClient } from './calendar/google-calendar';
import { MeetingScheduler } from './calendar/scheduler';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // focusable: false — removed because it prevents all interaction on Windows
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Needs getUserMedia access for mic capture
    },
  });

  // Click-through: ignore mouse events on transparent areas
  // On Windows, { forward: true } is not supported — we toggle fully via IPC
  if (process.platform === 'darwin') {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(true);
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open DevTools only in dev (when running with `electron .`, not packaged)
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.setSkipTaskbar(true);

  createTray(mainWindow);
  initHotkeys(mainWindow);
  registerIpcHandlers(mainWindow);

  // Initialize Google Calendar integration (if authenticated)
  try {
    const googleAuth = new GoogleAuth();
    if (googleAuth.isAuthenticated()) {
      const calendar = new CalendarClient(googleAuth);
      const scheduler = new MeetingScheduler();
      scheduler.start(mainWindow, calendar);
      console.log('Meeting scheduler started.');
    } else {
      console.log('Google not connected. Meeting prep disabled.');
    }
  } catch (err) {
    console.warn('Google auth init failed (config missing?). Meeting prep disabled.', err);
  }

  // Prevent window from being closed, just hide
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

(app as any).isQuitting = false;

app.on('will-quit', () => {
  cleanup();
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.whenReady().then(() => {
  createWindow();

  // Auto-update: check for updates silently on launch
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Update downloaded: v${info.version}. Will install on next restart.`);
    // Notify user via system tray notification
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });
  autoUpdater.on('error', (err) => {
    console.warn('Auto-update check failed (non-fatal):', err.message);
  });
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

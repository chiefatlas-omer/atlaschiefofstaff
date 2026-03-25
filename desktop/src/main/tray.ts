import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray-icon.png');

  // Use a fallback if icon doesn't exist
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a 16x16 placeholder icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Connect Google Account',
      click: async () => {
        try {
          const { GoogleAuth } = require('./auth/google-auth');
          const { CalendarClient } = require('./calendar/google-calendar');
          const { MeetingScheduler } = require('./calendar/scheduler');
          const auth = new GoogleAuth();
          await auth.startAuthFlow();
          // Start meeting scheduler after successful auth
          const calendar = new CalendarClient(auth);
          const scheduler = new MeetingScheduler();
          scheduler.start(mainWindow, calendar);
          console.log('Google connected — meeting scheduler started.');
        } catch (err: any) {
          console.error('Google auth failed:', err);
        }
      },
    },
    { type: 'separator' as const },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Atlas Chief of Staff');
  tray.setContextMenu(contextMenu);

  return tray;
}

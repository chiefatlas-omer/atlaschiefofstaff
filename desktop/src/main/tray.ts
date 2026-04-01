import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray-icon.png');

  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create Atlas bolt logo programmatically as a data URL PNG
    // Electron can render SVG → nativeImage via data URL
    const svgData = `<svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#4F3588"/>
      <path d="M55 20L35 52H48L42 80L68 45H53L55 20Z" fill="white"/>
    </svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`;
    icon = nativeImage.createFromDataURL(dataUrl);
    icon = icon.resize({ width: 16, height: 16 });
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

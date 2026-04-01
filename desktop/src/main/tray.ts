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
    // Create Atlas bolt logo as 16x16 RGBA pixel data
    const size = 16;
    const buf = Buffer.alloc(size * size * 4, 0); // RGBA, transparent

    // Draw purple circle with white lightning bolt
    const cx = 7.5, cy = 7.5, r = 7;
    const purple = [79, 53, 136, 255]; // #4F3588
    const white = [255, 255, 255, 255];

    // Bolt shape points (scaled to 16x16 from 100x100 viewbox)
    // Original: M55,20 L35,52 H48 L42,80 L68,45 H53 L55,20
    const boltPolygon = [
      [8.8, 3.2], [5.6, 8.3], [7.7, 8.3], [6.7, 12.8], [10.9, 7.2], [8.5, 7.2], [8.8, 3.2]
    ];

    function pointInPolygon(px: number, py: number, poly: number[][]): boolean {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          const idx = (y * size + x) * 4;
          const color = pointInPolygon(x, y, boltPolygon) ? white : purple;
          buf[idx] = color[0]; buf[idx + 1] = color[1]; buf[idx + 2] = color[2]; buf[idx + 3] = color[3];
        }
      }
    }

    icon = nativeImage.createFromBitmap(buf, { width: size, height: size });
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

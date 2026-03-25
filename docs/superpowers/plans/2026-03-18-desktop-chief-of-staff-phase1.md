# Desktop Chief of Staff — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron desktop app MVP — press Fn key, see waveform, speak, get transcript, view tasks from shared SQLite DB.

**Architecture:** Electron app with transparent overlay. Main process handles hotkey detection (uiohook-napi), IPC coordination, and SQLite access. Renderer captures mic audio (getUserMedia), drives waveform canvas, and sends audio buffers to main for Whisper STT. Preload script bridges via contextBridge.

**Tech Stack:** Electron 33, TypeScript, uiohook-napi, OpenAI Whisper API, better-sqlite3, drizzle-orm, Web Audio API (canvas waveform)

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-chief-of-staff-design.md`

---

## File Structure

**Important build notes:**
- Preload script inlines IPC constants (no imports from shared/) since sandboxed preloads can't `require` external modules
- Renderer files use CommonJS `require()` after tsc compilation — loaded via `<script>` tag (works because `sandbox: false` grants Node.js in renderer). For production, consider esbuild bundling.
- `sandbox: false` is required because renderer needs `getUserMedia` for mic access

```
desktop/
├── package.json                         # Electron + deps
├── .gitignore                           # node_modules/, dist/, .env
├── tsconfig.json                        # TypeScript config (CommonJS for Electron main)
├── .env.example                         # Required env vars
├── src/
│   ├── main/
│   │   ├── index.ts                     # Electron app entry: BrowserWindow, tray, init
│   │   ├── config.ts                    # Env var loader (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
│   │   ├── hotkey.ts                    # uiohook-napi Fn key + globalShortcut fallback
│   │   ├── tray.ts                      # System tray icon + context menu
│   │   ├── ipc-handlers.ts             # Register all ipcMain.handle channels
│   │   ├── voice/
│   │   │   └── whisper-client.ts        # Send audio buffer to OpenAI Whisper API, return text
│   │   └── db/
│   │       ├── connection.ts            # SQLite connection (shared DB, WAL, busy_timeout)
│   │       ├── schema.ts               # Drizzle schema (copy from bot, updated)
│   │       └── task-bridge.ts           # getTasksByUser, getAllOpenTasks, getOverdueTasks
│   ├── renderer/
│   │   ├── index.html                   # Overlay HTML shell
│   │   ├── styles.css                   # Transparent overlay styles
│   │   ├── app.ts                       # Main renderer logic, state machine, IPC listeners
│   │   └── components/
│   │       ├── waveform.ts              # Canvas waveform visualizer (Whispr Flow style)
│   │       ├── status-indicator.ts      # State dot (idle/listening/processing/error)
│   │       └── transcript-bubble.ts     # Speech bubble showing transcribed text
│   ├── preload/
│   │   └── preload.ts                   # contextBridge API: onStatusChange, onTranscript, etc.
│   └── shared/
│       └── types.ts                     # AppState enum, Task interface, IPC channel names
└── assets/
    └── icons/
        └── tray-icon.png               # 16x16 tray icon (placeholder)
```

---

## Task 0: Bot Schema Migration (Prerequisite)

**Files:**
- Modify: `bot/src/db/schema.ts:9-10,23`
- Modify: `bot/src/db/migrate.ts:11-12`
- Modify: `bot/src/tasks/task-service.ts:12-13,18`

- [ ] **Step 1: Update Drizzle schema — make Slack fields nullable, add 'desktop' source**

In `bot/src/db/schema.ts`, change lines 9-10 from `.notNull()` to optional, and line 23 to include `'desktop'`:

```typescript
// line 9: remove .notNull()
sourceChannelId: text('source_channel_id'),
// line 10: remove .notNull()
sourceMessageTs: text('source_message_ts'),
// line 23: add 'desktop' to enum
source: text('source', { enum: ['slack', 'zoom', 'manual', 'desktop'] }).notNull().default('slack'),
```

- [ ] **Step 2: Update migrate.ts — make columns nullable in CREATE TABLE**

In `bot/src/db/migrate.ts`, change lines 11-12:

```sql
source_channel_id TEXT,
source_message_ts TEXT,
```

- [ ] **Step 3: Add ALTER TABLE migration for existing databases**

Add after the CREATE TABLE block in `bot/src/db/migrate.ts`:

```typescript
// Migration: make source_channel_id and source_message_ts nullable
// SQLite doesn't support ALTER COLUMN, but columns created as NOT NULL
// with existing data need a migration. Since SQLite allows inserting NULL
// into TEXT NOT NULL columns when using ALTER TABLE ADD, we create a new
// table and copy data. For simplicity, just recreate if the columns are NOT NULL.
try {
  // Test if columns accept null by checking table info
  const tableInfo = sqlite.pragma('table_info(tasks)') as Array<{ name: string; notnull: number }>;
  const channelCol = tableInfo.find((c: { name: string }) => c.name === 'source_channel_id');
  if (channelCol && channelCol.notnull === 1) {
    console.log('Migrating tasks table: making source_channel_id and source_message_ts nullable...');
    sqlite.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        slack_user_id TEXT NOT NULL,
        slack_user_name TEXT,
        description TEXT NOT NULL,
        raw_message_text TEXT,
        source_channel_id TEXT,
        source_message_ts TEXT,
        source_thread_ts TEXT,
        bot_reply_ts TEXT,
        status TEXT NOT NULL DEFAULT 'DETECTED',
        confidence TEXT,
        team TEXT,
        deadline_text TEXT,
        deadline INTEGER,
        completed_at INTEGER,
        last_reminder_at INTEGER,
        escalated_at INTEGER,
        source TEXT NOT NULL DEFAULT 'slack',
        zoom_meeting_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO tasks_new SELECT * FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(slack_user_id, status);
    `);
    console.log('Migration complete.');
  }
} catch (e) {
  console.log('Migration check skipped (table may not exist yet).');
}
```

- [ ] **Step 4: Update CreateTaskInput interface — make Slack fields optional**

In `bot/src/tasks/task-service.ts`, update the interface:

```typescript
export interface CreateTaskInput {
  slackUserId: string;
  slackUserName?: string;
  description: string;
  rawMessageText?: string;
  sourceChannelId?: string;    // was required
  sourceMessageTs?: string;    // was required
  sourceThreadTs?: string;
  botReplyTs?: string;
  confidence: 'high' | 'medium';
  deadlineText?: string | null;
  source?: 'slack' | 'zoom' | 'manual' | 'desktop';  // added 'desktop'
  zoomMeetingId?: string;
}
```

And in the `createTask` function, update the insert to handle optional fields:

```typescript
sourceChannelId: input.sourceChannelId || null,
sourceMessageTs: input.sourceMessageTs || null,
```

- [ ] **Step 5: Run migration on existing database**

```bash
cd bot && npm run db:migrate
```

Expected: "Database migrated successfully." (with possible "Migrating tasks table..." if existing data)

- [ ] **Step 6: Verify bot still works**

```bash
cd bot && npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add bot/src/db/schema.ts bot/src/db/migrate.ts bot/src/tasks/task-service.ts
git commit -m "feat(bot): make source_channel_id/source_message_ts nullable, add desktop source

Prerequisite for desktop app: voice-created tasks have no Slack channel context."
```

---

## Task 1: Electron Project Scaffold

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/.env.example`
- Create: `desktop/src/shared/types.ts`

- [ ] **Step 1: Create desktop/package.json**

```json
{
  "name": "atlas-chief-of-staff-desktop",
  "version": "0.1.0",
  "description": "AI Chief of Staff desktop app — voice-controlled computer automation",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "tsc && electron .",
    "build": "tsc",
    "start": "electron .",
    "watch": "tsc --watch"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "better-sqlite3": "^12.8.0",
    "dotenv": "^17.3.1",
    "drizzle-orm": "^0.45.1",
    "openai": "^4.85.0",
    "uiohook-napi": "^1.5.4"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "electron": "^33.3.1",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create desktop/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create desktop/.env.example**

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SLACK_USER_ID=U0XXXXXXX
CHIEF_DB_PATH=../bot/data/chiefofstaff.db
```

- [ ] **Step 4: Create desktop/src/shared/types.ts**

```typescript
export enum AppState {
  IDLE = 'idle',
  LISTENING = 'listening',
  PROCESSING = 'processing',
  ERROR = 'error',
}

export interface Task {
  id: string;
  slackUserId: string;
  slackUserName: string | null;
  description: string;
  status: string;
  deadline: Date | null;
  deadlineText: string | null;
  source: string;
  createdAt: Date;
}

export const IPC = {
  STATUS_CHANGE: 'status:change',
  TRANSCRIPT: 'voice:transcript',
  AUDIO_DATA: 'voice:audio-data',
  START_RECORDING: 'voice:start-recording',
  STOP_RECORDING: 'voice:stop-recording',
  TASKS_UPDATE: 'tasks:update',
  TASKS_GET: 'tasks:get',
  ERROR: 'app:error',
} as const;
```

- [ ] **Step 5: Install dependencies**

```bash
cd desktop && npm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd desktop && npx tsc --noEmit --pretty
```

Expected: No errors (empty project compiles).

- [ ] **Step 7: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): scaffold Electron project with deps and types"
```

---

## Task 2: Electron Main Process — Window + Tray

**Files:**
- Create: `desktop/src/main/index.ts`
- Create: `desktop/src/main/config.ts`
- Create: `desktop/src/main/tray.ts`
- Create: `desktop/assets/icons/tray-icon.png`

- [ ] **Step 1: Create desktop/src/main/config.ts**

```typescript
import dotenv from 'dotenv';
import path from 'path';

// __dirname is dist/main/ after compilation, so .env is 3 levels up at desktop/
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

export const config = {
  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },
  slackUserId: requireEnv('SLACK_USER_ID'),
  db: {
    path: optionalEnv('CHIEF_DB_PATH', path.resolve(__dirname, '..', '..', '..', 'bot', 'data', 'chiefofstaff.db')),
  },
};
```

- [ ] **Step 2: Create placeholder tray icon**

Create a 16x16 PNG at `desktop/assets/icons/tray-icon.png`. For now, generate a simple one:

```bash
cd desktop && mkdir -p assets/icons
```

Then create a minimal placeholder (we'll replace with real icon later). Use any 16x16 PNG or create one programmatically.

- [ ] **Step 3: Create desktop/src/main/tray.ts**

```typescript
import { Tray, Menu, app, BrowserWindow } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray-icon.png');
  tray = new Tray(iconPath);

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
    { type: 'separator' },
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
```

- [ ] **Step 4: Create desktop/src/main/index.ts**

```typescript
import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { createTray } from './tray';

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
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Needs getUserMedia access for mic capture
    },
  });

  // Click-through: ignore mouse events on transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Don't show in taskbar
  mainWindow.setSkipTaskbar(true);

  // Create system tray
  createTray(mainWindow);

  // Prevent window from being closed, just hide
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// Extend app type to include isQuitting
(app as any).isQuitting = false;

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 5: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit --pretty
```

Expected: May show errors for missing preload/renderer files — that's fine, we'll create them next.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/ desktop/assets/
git commit -m "feat(desktop): Electron main process with transparent window + tray"
```

---

## Task 3: Preload Script + Renderer Shell

**Files:**
- Create: `desktop/src/preload/preload.ts`
- Create: `desktop/src/renderer/index.html`
- Create: `desktop/src/renderer/styles.css`
- Create: `desktop/src/renderer/app.ts`

- [ ] **Step 1: Create desktop/src/preload/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channel names (can't import from shared/types in preload context)
const IPC = {
  STATUS_CHANGE: 'status:change',
  TRANSCRIPT: 'voice:transcript',
  AUDIO_DATA: 'voice:audio-data',
  TASKS_UPDATE: 'tasks:update',
  TASKS_GET: 'tasks:get',
  ERROR: 'app:error',
} as const;

contextBridge.exposeInMainWorld('chiefOfStaff', {
  // Main → Renderer events
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

  // Renderer → Main commands
  sendAudioData: (buffer: ArrayBuffer) => {
    ipcRenderer.invoke(IPC.AUDIO_DATA, buffer);
  },
  getTasks: () => ipcRenderer.invoke(IPC.TASKS_GET),
});
```

- [ ] **Step 2: Create desktop/src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atlas Chief of Staff</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Status indicator (idle dot) -->
  <div id="status-dot" class="status-dot idle"></div>

  <!-- Waveform container (centered, shown during listening) -->
  <div id="waveform-container" class="waveform-container hidden">
    <canvas id="waveform-canvas" width="400" height="120"></canvas>
    <div class="waveform-label">Listening...</div>
  </div>

  <!-- Transcript bubble -->
  <div id="transcript-bubble" class="transcript-bubble hidden">
    <span id="transcript-text"></span>
  </div>

  <!-- Error message -->
  <div id="error-message" class="error-message hidden">
    <span id="error-text"></span>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create desktop/src/renderer/styles.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  width: 100vw;
  height: 100vh;
  position: relative;
}

/* Idle status dot — bottom right corner */
.status-dot {
  position: fixed;
  bottom: 40px;
  right: 40px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: all 0.3s ease;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.status-dot.idle {
  background: rgba(255, 255, 255, 0.3);
}

.status-dot.listening {
  background: #4A90D9;
  box-shadow: 0 0 12px rgba(74, 144, 217, 0.6);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-dot.processing {
  background: #F5A623;
  animation: spin 1s linear infinite;
}

.status-dot.error {
  background: #E74C3C;
  box-shadow: 0 0 12px rgba(231, 76, 60, 0.6);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Waveform container — centered pill */
.waveform-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 20, 40, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 60px;
  padding: 30px 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.waveform-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* Transcript bubble */
.transcript-bubble {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 20, 40, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 20px 30px;
  color: white;
  font-size: 16px;
  max-width: 500px;
  text-align: center;
  -webkit-app-region: no-drag;
}

/* Error message */
.error-message {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(231, 76, 60, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 16px 24px;
  color: white;
  font-size: 14px;
  -webkit-app-region: no-drag;
}

.hidden {
  display: none;
}
```

- [ ] **Step 4: Create desktop/src/renderer/app.ts**

```typescript
declare global {
  interface Window {
    chiefOfStaff: {
      onStatusChange: (cb: (state: string) => void) => void;
      onTranscript: (cb: (text: string) => void) => void;
      onTasksUpdate: (cb: (tasks: any[]) => void) => void;
      onError: (cb: (message: string) => void) => void;
      sendAudioData: (buffer: ArrayBuffer) => void;
      getTasks: () => Promise<any[]>;
    };
  }
}

const statusDot = document.getElementById('status-dot')!;
const waveformContainer = document.getElementById('waveform-container')!;
const transcriptBubble = document.getElementById('transcript-bubble')!;
const transcriptText = document.getElementById('transcript-text')!;
const errorMessage = document.getElementById('error-message')!;
const errorText = document.getElementById('error-text')!;

// State management
function setState(state: string) {
  statusDot.className = `status-dot ${state}`;

  // Show/hide waveform
  if (state === 'listening') {
    waveformContainer.classList.remove('hidden');
    transcriptBubble.classList.add('hidden');
    errorMessage.classList.add('hidden');
  } else {
    waveformContainer.classList.add('hidden');
  }

  if (state === 'idle') {
    transcriptBubble.classList.add('hidden');
    errorMessage.classList.add('hidden');
  }
}

// Note: onStatusChange listener is added in Task 5 (waveform integration).
// It calls setState() plus manages waveform start/stop and MediaRecorder.

// Listen for transcripts
window.chiefOfStaff.onTranscript((text) => {
  transcriptText.textContent = text;
  transcriptBubble.classList.remove('hidden');
  waveformContainer.classList.add('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    transcriptBubble.classList.add('hidden');
  }, 5000);
});

// Listen for errors
window.chiefOfStaff.onError((message) => {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  setState('error');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorMessage.classList.add('hidden');
    setState('idle');
  }, 5000);
});

// Initial state
setState('idle');
console.log('Atlas Chief of Staff renderer loaded.');
```

- [ ] **Step 5: Compile and test the Electron app launches**

```bash
cd desktop && npx tsc && npx electron .
```

Expected: A transparent window appears covering the screen. A small translucent dot is visible in the bottom-right corner. A system tray icon appears. App can be quit via tray → Quit.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/preload/ desktop/src/renderer/
git commit -m "feat(desktop): preload bridge + renderer overlay shell with status dot"
```

---

## Task 4: Hotkey Detection (Fn key + Fallback)

**Files:**
- Create: `desktop/src/main/hotkey.ts`
- Modify: `desktop/src/main/index.ts`

- [ ] **Step 1: Create desktop/src/main/hotkey.ts**

```typescript
import { globalShortcut, BrowserWindow } from 'electron';
import { UiohookKey, uIOhook } from 'uiohook-napi';
import { IPC } from '../shared/types';

let isListening = false;
let mainWindow: BrowserWindow | null = null;

export function initHotkeys(window: BrowserWindow) {
  mainWindow = window;

  // Fallback: Ctrl+Shift+K (Windows/Linux) / Cmd+Shift+K (macOS)
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (!isListening) {
      startListening();
    } else {
      stopListening();
    }
  });

  // Primary: Fn key via uiohook-napi
  // Fn key doesn't have a universal keycode — it varies by manufacturer.
  // On many keyboards, Fn is handled entirely in hardware and never reaches the OS.
  // We'll attempt to detect it, but the Ctrl+Shift+K fallback is the reliable path.
  try {
    uIOhook.on('keydown', (e) => {
      // Some keyboards send Fn as a specific key code
      // Common codes: 0x00 or manufacturer-specific
      // For now, we rely on the Ctrl+Shift+K fallback
    });

    uIOhook.on('keyup', (e) => {
      // Mirror keydown logic
    });

    uIOhook.start();
  } catch (err) {
    console.warn('uIOhook initialization failed, using keyboard shortcut only:', err);
  }
}

function startListening() {
  isListening = true;
  // Renderer reacts to status change to start mic capture + waveform
  mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'listening');
}

function stopListening() {
  isListening = false;
  // Renderer reacts to status change to stop recording + send audio to main
  mainWindow?.webContents.send(IPC.STATUS_CHANGE, 'processing');
}

export function cleanup() {
  globalShortcut.unregisterAll();
  try {
    uIOhook.stop();
  } catch {}
}
```

- [ ] **Step 2: Wire hotkeys into main/index.ts**

Add to `desktop/src/main/index.ts` after `createTray(mainWindow)`:

```typescript
import { initHotkeys, cleanup } from './hotkey';

// Inside createWindow(), after createTray:
initHotkeys(mainWindow);

// Add cleanup on quit:
app.on('will-quit', () => {
  cleanup();
});
```

- [ ] **Step 3: Compile and test hotkey**

```bash
cd desktop && npx tsc && npx electron .
```

Test: Press `Ctrl+Shift+K` → status dot should turn blue (listening state). Press again → dot should turn yellow (processing state).

- [ ] **Step 4: Commit**

```bash
git add desktop/src/main/hotkey.ts desktop/src/main/index.ts
git commit -m "feat(desktop): global hotkey Ctrl+Shift+K with uiohook-napi scaffold"
```

---

## Task 5: Waveform Visualizer

**Files:**
- Create: `desktop/src/renderer/components/waveform.ts`
- Modify: `desktop/src/renderer/app.ts`

- [ ] **Step 1: Create desktop/src/renderer/components/waveform.ts**

```typescript
export class WaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array | null = null;
  private barCount = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  async start(): Promise<MediaStream> {
    this.audioContext = new AudioContext();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.draw();
    return this.stream;
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw = (): void => {
    this.animationId = requestAnimationFrame(this.draw);

    if (!this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    const barWidth = width / this.barCount;
    const gap = 2;
    const centerY = height / 2;

    for (let i = 0; i < this.barCount; i++) {
      // Sample from frequency data
      const dataIndex = Math.floor((i / this.barCount) * this.dataArray.length);
      const value = this.dataArray[dataIndex] / 255;

      // Min bar height for idle ripple effect
      const minHeight = 4;
      const barHeight = Math.max(minHeight, value * (height * 0.8));

      const x = i * barWidth + gap / 2;
      const barActualWidth = barWidth - gap;

      // Blue to purple gradient per bar
      const hue = 220 + (i / this.barCount) * 60; // 220 (blue) to 280 (purple)
      const saturation = 70 + value * 30;
      const lightness = 50 + value * 20;

      this.ctx.beginPath();
      this.ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      this.ctx.roundRect(
        x,
        centerY - barHeight / 2,
        barActualWidth,
        barHeight,
        barActualWidth / 2,
      );
      this.ctx.fill();
    }
  };

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }
}
```

- [ ] **Step 2: Integrate waveform into app.ts**

In `desktop/src/renderer/app.ts`, replace the placeholder comment from Task 3 ("Note: onStatusChange listener is added in Task 5") with:

```typescript
import { WaveformVisualizer } from './components/waveform';

const waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const waveform = new WaveformVisualizer(waveformCanvas);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

// Handle recording start (triggered by hotkey via IPC)
window.chiefOfStaff.onStatusChange(async (state) => {
  setState(state);

  if (state === 'listening') {
    try {
      const stream = await waveform.start();

      // Set up MediaRecorder to capture audio for Whisper
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const buffer = await audioBlob.arrayBuffer();
        window.chiefOfStaff.sendAudioData(buffer);
      };

      mediaRecorder.start();
    } catch (err) {
      console.error('Failed to start audio capture:', err);
    }
  } else if (state === 'processing') {
    // Stop recording, send audio to main
    waveform.stop();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }
});
```

- [ ] **Step 3: Compile and test waveform**

```bash
cd desktop && npx tsc && npx electron .
```

Test: Press `Ctrl+Shift+K` → waveform pill appears centered → bars react to mic input → press again → waveform disappears, "Processing..." state shows briefly.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/
git commit -m "feat(desktop): Whispr Flow waveform visualizer with live mic input"
```

---

## Task 6: Whisper STT Integration

**Files:**
- Create: `desktop/src/main/voice/whisper-client.ts`
- Create: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/main/index.ts`

- [ ] **Step 1: Create desktop/src/main/voice/whisper-client.ts**

```typescript
import OpenAI from 'openai';
import { config } from '../config';
import fs from 'fs';
import path from 'path';
import os from 'os';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Write buffer to temp file (Whisper API needs a file)
  const tempPath = path.join(os.tmpdir(), `atlas-cos-${Date.now()}.webm`);

  try {
    fs.writeFileSync(tempPath, audioBuffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en',
    });

    return transcription.text;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}
```

- [ ] **Step 2: Create desktop/src/main/ipc-handlers.ts**

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import { transcribeAudio } from './voice/whisper-client';

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // Receive audio data from renderer, transcribe with Whisper
  ipcMain.handle(IPC.AUDIO_DATA, async (_event, audioBuffer: ArrayBuffer) => {
    try {
      const buffer = Buffer.from(audioBuffer);

      if (buffer.length < 1000) {
        mainWindow.webContents.send(IPC.ERROR, 'Audio too short. Try speaking longer.');
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        return;
      }

      const transcript = await transcribeAudio(buffer);

      if (!transcript || transcript.trim().length === 0) {
        mainWindow.webContents.send(IPC.ERROR, "Couldn't understand audio, try again.");
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        return;
      }

      // Send transcript to renderer for display
      mainWindow.webContents.send(IPC.TRANSCRIPT, transcript);

      // Basic intent classification (Phase 1: TASK_QUERY vs GENERAL)
      const lower = transcript.toLowerCase();
      const isTaskQuery = ['task', 'to do', 'todo', 'overdue', 'what do i need',
        'my plate', 'show me', 'pending', 'open items'].some(kw => lower.includes(kw));

      if (isTaskQuery) {
        const tasks = getMyTasks();
        mainWindow.webContents.send(IPC.TASKS_UPDATE, tasks);
      }

      // Return to idle after delay
      setTimeout(() => {
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
      }, 5000);
    } catch (err: any) {
      console.error('Whisper transcription failed:', err);
      mainWindow.webContents.send(IPC.ERROR, 'Failed to transcribe audio. Check your API key.');
      mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
    }
  });
}
```

- [ ] **Step 3: Wire IPC handlers into main/index.ts**

Add to `desktop/src/main/index.ts`:

```typescript
import { registerIpcHandlers } from './ipc-handlers';

// Inside createWindow(), after initHotkeys:
registerIpcHandlers(mainWindow);
```

- [ ] **Step 4: Create .env file with real API keys for testing**

```bash
cd desktop && cp .env.example .env
# Then edit .env with your actual OPENAI_API_KEY and other keys
```

- [ ] **Step 5: Compile and test full voice pipeline**

```bash
cd desktop && npx tsc && npx electron .
```

Test: Press `Ctrl+Shift+K` → waveform appears → speak "Hello world" → press `Ctrl+Shift+K` again → processing state → transcript "Hello world" appears in bubble → fades after 5s → returns to idle.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/voice/ desktop/src/main/ipc-handlers.ts desktop/src/main/index.ts
git commit -m "feat(desktop): Whisper STT integration — voice to transcript pipeline"
```

---

## Task 7: SQLite Connection + Task Display

**Files:**
- Create: `desktop/src/main/db/connection.ts`
- Create: `desktop/src/main/db/schema.ts`
- Create: `desktop/src/main/db/task-bridge.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Create desktop/src/main/db/schema.ts**

Copy from `bot/src/db/schema.ts` with the nullable changes applied:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  slackUserId: text('slack_user_id').notNull(),
  slackUserName: text('slack_user_name'),
  description: text('description').notNull(),
  rawMessageText: text('raw_message_text'),
  sourceChannelId: text('source_channel_id'),       // nullable for desktop
  sourceMessageTs: text('source_message_ts'),       // nullable for desktop
  sourceThreadTs: text('source_thread_ts'),
  botReplyTs: text('bot_reply_ts'),
  status: text('status', {
    enum: ['DETECTED', 'CONFIRMED', 'COMPLETED', 'OVERDUE', 'ESCALATED', 'DISMISSED'],
  }).notNull().default('DETECTED'),
  confidence: text('confidence', { enum: ['high', 'medium'] }),
  team: text('team', { enum: ['team_a', 'team_b'] }),
  deadlineText: text('deadline_text'),
  deadline: integer('deadline', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  lastReminderAt: integer('last_reminder_at', { mode: 'timestamp' }),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  source: text('source', { enum: ['slack', 'zoom', 'manual', 'desktop'] }).notNull().default('slack'),
  zoomMeetingId: text('zoom_meeting_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('idx_tasks_status_deadline').on(table.status, table.deadline),
  index('idx_tasks_user_status').on(table.slackUserId, table.status),
]);
```

- [ ] **Step 2: Create desktop/src/main/db/connection.ts**

```typescript
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import * as schema from './schema';

const dbPath = path.resolve(config.db.path);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  throw new Error(
    `Database not found at ${dbPath}. Make sure the bot has been set up and the CHIEF_DB_PATH env var is correct.`
  );
}

const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };
```

- [ ] **Step 3: Create desktop/src/main/db/task-bridge.ts**

```typescript
import { db } from './connection';
import { tasks } from './schema';
import { eq, and, lte, inArray } from 'drizzle-orm';
import { config } from '../config';

export function getMyTasks() {
  return db.select().from(tasks)
    .where(and(
      eq(tasks.slackUserId, config.slackUserId),
      inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']),
    ))
    .all();
}

export function getAllOpenTasks() {
  return db.select().from(tasks)
    .where(inArray(tasks.status, ['DETECTED', 'CONFIRMED', 'OVERDUE', 'ESCALATED']))
    .all();
}

export function getOverdueTasks() {
  const now = new Date();
  return db.select().from(tasks)
    .where(and(
      inArray(tasks.status, ['CONFIRMED', 'OVERDUE']),
      lte(tasks.deadline, now),
    ))
    .all();
}
```

- [ ] **Step 4: Add tasks:get IPC handler**

Add to `desktop/src/main/ipc-handlers.ts`:

```typescript
import { getMyTasks } from './db/task-bridge';

// Inside registerIpcHandlers, add:
ipcMain.handle(IPC.TASKS_GET, async () => {
  try {
    return getMyTasks();
  } catch (err: any) {
    console.error('Failed to get tasks:', err);
    return [];
  }
});
```

- [ ] **Step 5: Compile and test task loading**

```bash
cd desktop && npx tsc && npx electron .
```

Test: Open DevTools (tray or keyboard shortcut), run in console:
```javascript
window.chiefOfStaff.getTasks().then(console.log)
```
Expected: Array of tasks from the bot's SQLite database (or empty array if no tasks exist for the configured `SLACK_USER_ID`).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/db/
git commit -m "feat(desktop): SQLite connection to shared bot DB + task bridge"
```

---

## Task 8: End-to-End Integration Test

**Files:**
- Modify: `desktop/src/main/index.ts` (minor: add devtools in dev mode)

- [ ] **Step 1: Add DevTools toggle for development**

In `desktop/src/main/index.ts`, after `mainWindow.loadFile(...)`:

```typescript
// Open DevTools in development
if (process.env.NODE_ENV !== 'production') {
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}
```

- [ ] **Step 2: Full end-to-end test**

```bash
cd desktop && npx tsc && npx electron .
```

Run through the complete flow:
1. App launches → transparent overlay with dot in bottom-right
2. System tray icon appears
3. Press `Ctrl+Shift+K` → waveform visualizer appears, centered, bars react to mic
4. Speak "Show me my tasks"
5. Press `Ctrl+Shift+K` again → waveform stops, processing state
6. Whisper transcribes → transcript bubble shows "Show me my tasks"
7. After 5 seconds → returns to idle
8. In DevTools console: `window.chiefOfStaff.getTasks()` returns task array

- [ ] **Step 3: Commit final integration**

```bash
git add desktop/
git commit -m "feat(desktop): Phase 1 MVP complete — voice pipeline + waveform + task bridge"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Bot schema migration applied (`source_channel_id` and `source_message_ts` are nullable)
- [ ] Bot still compiles and runs (`cd bot && npm run build`)
- [ ] Desktop app launches with transparent overlay (both Windows and macOS)
- [ ] Status dot visible in bottom-right corner
- [ ] System tray icon + context menu works
- [ ] `Ctrl+Shift+K` toggles listening/processing states
- [ ] Waveform visualizer appears centered with flowing bars on mic input
- [ ] Bars react to voice volume (tall when speaking, small ripples when quiet)
- [ ] Blue-to-purple gradient visible on waveform bars
- [ ] Whisper transcription works — spoken words appear in transcript bubble
- [ ] Transcript bubble auto-dismisses after 5 seconds
- [ ] Error state shows red message when Whisper fails (test: very short audio)
- [ ] `getTasks()` returns tasks from shared SQLite database
- [ ] Tray → Quit exits the app cleanly

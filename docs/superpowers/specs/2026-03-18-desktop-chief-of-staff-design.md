# Atlas Chief of Staff — Desktop App Design Spec

**Date:** 2026-03-18
**Author:** Claude + Omer
**Status:** Draft

---

## 1. Problem Statement

Atlas Growth's CEO (Omer) spends significant time context-switching between apps — moving CRM items in GoHighLevel, drafting emails, managing tasks across Slack and Trello, researching competitors. The existing AI Chief of Staff Slack bot handles task tracking reactively, but can't take action on the computer.

**Goal:** Build a cross-platform desktop app where Omer presses the Fn key, speaks a command, and Claude autonomously controls the computer to execute it — clicking, typing, navigating across any application.

**Competitor:** heylemon.ai (Mac-only, voice-to-text generation). Atlas CoS differentiates with **full computer control**, not just text generation.

---

## 2. Target Users

Internal Atlas Growth team (Omer, Mark, Ehsan) for V1. Productize for knowledge workers/executives in V2.

---

## 3. Core User Experience

### 3.1 Activation
- **Primary:** Press and hold Fn key (push-to-talk)
- **Fallback:** `Ctrl+Shift+K` (Windows) / `Cmd+Shift+K` (macOS) for keyboards where Fn is intercepted by firmware
- **Technical:** `uiohook-napi` for OS-level Fn key detection; Electron `globalShortcut` for fallback combo

### 3.2 Voice Input + Waveform
When activated, a centered overlay appears with a **Whispr Flow-style waveform visualizer**:
- Canvas-based, 60fps animation
- Bars react to microphone input amplitude in real-time
- Blue-to-purple gradient (Atlas brand colors)
- Floating pill-shaped container, centered on screen
- Disappears when key released

### 3.3 Processing
- Audio sent to OpenAI Whisper API for speech-to-text
- Transcript shown in a speech bubble overlay
- Intent classified: `COMPUTER_CONTROL`, `TASK_QUERY`, `TASK_CREATE`, `TASK_COMPLETE`, `RESEARCH`, `BRIEFING`, `GENERAL`

### 3.4 Computer Use Execution
For `COMPUTER_CONTROL` intents:
1. Take full-screen screenshot via `screenshot-desktop`
2. Resize to ≤1568px (Claude API limit)
3. Send to Claude with `computer_20250124` tool definition
4. Claude returns actions: click, type, scroll, key press
5. `nut.js` executes the action on the real desktop
6. Smart wait: 500ms minimum, then compare consecutive screenshots for stability (up to 3s for page loads/app launches)
7. Take new screenshot, send back to Claude
8. Loop until Claude signals completion (max 25 iterations)
9. Play completion sound, show "Done" in overlay

**Cancellation:** User presses `Escape` at any time during execution → current action completes → loop stops immediately → overlay shows "Cancelled" state. `Escape` is registered as a global shortcut during execution only.

**Error handling:**
- API timeout/failure → retry once after 2s → if still failing, show "Error: could not reach AI" in overlay, return to idle
- Mid-loop API failure → stop loop, show partial progress in action feed, overlay enters Error state (red dot + error message)
- Whisper failure → show "Couldn't understand audio, try again" in overlay

### 3.5 UI Error State
| State | Visual | Location |
|-------|--------|----------|
| Error | Red dot + error message | Centered, auto-dismiss after 5s |

### 3.5 Task Management
For task intents, the app reads/writes the **same SQLite database** as the existing Slack bot:
- `TASK_QUERY` → show open/overdue tasks in slide-out panel
- `TASK_CREATE` → Claude extracts description + deadline, inserts into DB
- `TASK_COMPLETE` → fuzzy-match voice description against open tasks, mark complete

---

## 4. Architecture

### 4.1 Framework
Electron (cross-platform Mac + Windows). Chosen for: TypeScript ecosystem compatibility with existing bot, mature packaging, battle-tested transparent window support.

### 4.2 Process Model
- **Main process:** Node.js — hotkey detection, microphone recording, API calls (Whisper, Claude), screen capture, mouse/keyboard control, SQLite access
- **Renderer process:** DOM — transparent overlay UI, waveform canvas, task panel, action feed
- **Preload script:** `contextBridge` — typed IPC API between main and renderer
- **Security:** Renderer: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. Main process is unsandboxed (required for native modules: uiohook-napi, nut.js, better-sqlite3, screenshot-desktop).

### 4.3 Key Modules

| Module | File | Responsibility |
|--------|------|---------------|
| App entry | `src/main/index.ts` | Window creation, tray, init |
| Hotkey | `src/main/hotkey.ts` | Fn key via uiohook-napi + fallback |
| Voice recorder | `src/main/voice/recorder.ts` | Mic capture, amplitude streaming |
| Whisper client | `src/main/voice/whisper-client.ts` | STT via OpenAI API |
| Claude client | `src/main/ai/claude-client.ts` | Computer Use API calls |
| Intent classifier | `src/main/ai/intent-classifier.ts` | Route voice to handler |
| Screen capture | `src/main/screen-capture.ts` | screenshot-desktop wrapper |
| Input control | `src/main/input-control.ts` | nut.js mouse/keyboard |
| Computer Use loop | `src/main/computer-use-loop.ts` | Orchestration: screenshot → Claude → execute → repeat |
| DB connection | `src/main/db/connection.ts` | SQLite (shared with bot) |
| Task bridge | `src/main/db/task-bridge.ts` | Task CRUD operations |
| Waveform | `src/renderer/components/waveform.ts` | Canvas audio visualizer |
| Task panel | `src/renderer/components/task-panel.ts` | Slide-out task list |
| Action feed | `src/renderer/components/action-feed.ts` | Claude action log |

### 4.4 Database Strategy
- Path via `CHIEF_DB_PATH` env var (default for dev: `../bot/data/chiefofstaff.db`; must be absolute path for packaged builds)
- WAL mode for concurrent access; `busy_timeout = 5000`
- Desktop does NOT run migrations — bot owns schema
- **Prerequisite migration:** Bot schema must be updated before desktop Phase 1:
  - Add `'desktop'` to `source` column enum: `['slack', 'zoom', 'manual', 'desktop']`
  - Make `sourceChannelId` and `sourceMessageTs` nullable (these are Slack-specific; desktop has no channel/message context)
- Voice-created tasks use `source: 'desktop'`, with `sourceChannelId: null`, `sourceMessageTs: null`
- Bot's cron jobs (reminders, escalations) automatically include desktop tasks

---

## 5. UI Design

### 5.1 Window Properties
Transparent, frameless, always-on-top, click-through overlay covering the full screen.

```
transparent: true
frame: false
alwaysOnTop: true
skipTaskbar: true
focusable: false
setIgnoreMouseEvents(true, { forward: true })  // except on overlay elements
```

### 5.2 States

| State | Visual | Location |
|-------|--------|----------|
| Idle | Translucent orb (16px) | Bottom-right corner |
| Listening | Waveform visualizer + "Listening..." | Centered |
| Processing | Frozen waveform → spinner + transcript | Centered |
| Executing | Action feed log | Right side, 200px wide |
| Task view | Task list panel | Right side, 320px wide |

### 5.3 Waveform Visualizer Detail
- **Audio capture split:** Renderer captures mic via `navigator.mediaDevices.getUserMedia()` (Web API, only available in renderer). Renderer uses Web Audio API `AnalyserNode` to drive the waveform canvas locally. Raw audio buffer is sent to main process via IPC for Whisper upload.
- Canvas draws bars proportional to volume — tall when speaking, small ripples when quiet
- Blue-to-purple gradient, 60fps `requestAnimationFrame` loop
- Pill-shaped container with subtle backdrop blur
- **Note:** `forward: true` in `setIgnoreMouseEvents` is macOS-only. On Windows, use hit-test regions or toggle `setIgnoreMouseEvents` per-element via mouse position tracking.

### 5.4 Cross-Platform
- **macOS:** Native transparency. Requires Accessibility + Microphone permissions. Entitlements in `entitlements.mac.plist`.
- **Windows:** `backgroundColor: '#00000000'`. Mic prompt on first use. No special permissions for nut.js.

---

## 6. Dependencies

| Package | Purpose |
|---------|---------|
| `electron` ^33.x | App framework |
| `electron-builder` ^25.x | Packaging (DMG + NSIS) |
| `@anthropic-ai/sdk` ^0.78.x | Claude API + Computer Use (match bot version) |
| `@nut-tree/nut-js` ^4.x | Mouse/keyboard control |
| `uiohook-napi` ^1.x | OS-level Fn key detection |
| `screenshot-desktop` ^1.x | Full-screen capture |
| `better-sqlite3` ^12.x | SQLite driver (match bot version) |
| `drizzle-orm` ^0.45.x | ORM (must match bot version for schema compat) |
| `openai` ^4.x | Whisper STT |
| `electron-log` ^5.x | Structured logging (file + console) |
| `electron-store` ^10.x | Settings persistence for packaged app |
| `dotenv` ^16.x | Env config (dev only; packaged app uses electron-store) |

---

## 7. Integration with Existing Bot

The desktop app and Slack bot are **peers sharing a database**, not client-server:
- Both read/write `chiefofstaff.db`
- Desktop creates tasks with `source: 'desktop'`, bot creates with `source: 'slack'` or `source: 'zoom'`
- Bot's scheduled jobs (8am/4pm reminders, 9am/5pm escalations, Friday digest) include all tasks regardless of source
- Desktop does NOT import `@slack/bolt` — it has no Slack dependency
- User identity: `SLACK_USER_ID` env var maps desktop user to Slack user

---

## 8. Phased Build Order

### Phase 0: Bot Schema Migration (Prerequisite)
Update bot's Drizzle schema: add `'desktop'` to `source` enum, make `sourceChannelId` and `sourceMessageTs` nullable. Run migration.

### Phase 1: Voice Pipeline MVP
Electron shell + Fn key hotkey + mic recording + waveform visualizer + Whisper STT + transcript overlay + basic intent classifier (TASK_QUERY vs GENERAL) + SQLite task display. Test on Mac + Windows.

### Phase 2: Computer Use
Screen capture + nut.js + Claude Computer Use loop + action feed UI + full intent classifier (all intents) + Escape cancellation.

### Phase 3: Voice Task CRUD
Create/complete/dismiss tasks via voice. Full task panel with filters.

### Phase 4: Packaging
electron-builder (Mac DMG arm64+x64, Windows NSIS). Icons, sounds, auto-start, settings.

### Phase 5: Proactive Layer
Daily briefing, calendar integration, CRM read, decision memory, Google Drive/Notion read, Gmail context.

### Phase 6: Advanced
Wake word ("Hey Atlas"), org context graph, strategic alignment, war room mode, exec prep packs, board reporting.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Fn key not detectable on some keyboards | Fallback to Ctrl+Shift+K / Cmd+Shift+K |
| Claude Computer Use imprecision | Max 25 iterations safety limit; user can interrupt with Escape |
| SQLite write contention | WAL mode + busy_timeout; desktop mostly reads |
| nut.js needs Accessibility on macOS | First-run permission prompt + docs |
| Native module rebuild for Electron | electron-builder handles via electron-rebuild |
| Debugging Computer Use failures | `electron-log` captures all actions + screenshots to `~/Library/Logs/Atlas Chief of Staff/` (Mac) or `%APPDATA%/Atlas Chief of Staff/logs/` (Windows) |
| API key management in packaged app | `electron-store` for settings persistence; `dotenv` for dev only |

---

## 10. Success Criteria

- Press Fn → waveform appears → speak → Claude executes action on screen → task confirmed
- Works on both macOS and Windows
- Tasks created via voice appear in Slack `/tasks` command
- Under 3 seconds from voice stop to first action execution
- Waveform feels responsive and polished (60fps, reacts to voice)

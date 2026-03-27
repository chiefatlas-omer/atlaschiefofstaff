import { ipcMain, BrowserWindow, clipboard } from 'electron';
import { IPC } from '../shared/types';
import { transcribeAudio } from './voice/whisper-client';
import { postProcess, smartProcess, formatDictation } from './voice/post-processor';
import { getMyTasks } from './db/task-bridge';
import { logVoiceInteraction } from './db/voice-logger';
import { sqlite } from './db/connection';
import { getVoiceMode } from './hotkey';

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // Rolling context window for continuity across consecutive transcription chunks.
  let transcriptionContext = '';

  // Unified audio handler — single flow for both command and dictation
  ipcMain.handle(IPC.AUDIO_DATA, async (_event, audioBuffer: ArrayBuffer) => {
    console.log('[AUDIO] Received audio data, size:', audioBuffer?.byteLength || 0, 'bytes');
    try {
      const buffer = Buffer.from(audioBuffer);
      console.log('[AUDIO] Buffer size:', buffer.length, 'bytes');

      if (buffer.length < 1000) {
        console.log('[AUDIO] Too short, rejecting');
        mainWindow.webContents.send(IPC.ERROR, 'Audio too short. Try speaking longer.');
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        return;
      }

      console.log('[AUDIO] Sending to Whisper... (context length:', transcriptionContext.length, ')');
      const rawTranscript = await transcribeAudio(buffer, {
        previousTranscript: transcriptionContext,
        highQualityRetry: true,
      });
      console.log('[AUDIO] Whisper result:', rawTranscript);

      if (!rawTranscript || rawTranscript.trim().length === 0) {
        mainWindow.webContents.send(IPC.ERROR, "Couldn't understand audio, try again.");
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        return;
      }

      // Apply post-processing (capitalisation, number formatting, misheard corrections)
      const transcript = postProcess(rawTranscript, { stripFillers: false });
      console.log('[AUDIO] Post-processed:', transcript);

      // If post-processing filtered the text (e.g. Whisper hallucination), ignore it
      if (!transcript || transcript.trim().length === 0) {
        console.log('[AUDIO] Empty after post-processing (filtered hallucination), ignoring.');
        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        return;
      }

      // Update rolling context window
      transcriptionContext = transcript.slice(-200);

      // Mode-based routing — no AI classification needed, user already chose
      const mode = getVoiceMode();
      console.log('[AUDIO] Voice mode:', mode);

      if (mode === 'dictation') {
        // ── Dictation flow: format and paste text into active app ──
        const finalText = formatDictation(transcript);
        console.log('[DICTATION] Formatted output:', finalText.substring(0, 100));
        mainWindow.webContents.send(IPC.TRANSCRIPT, finalText);

        // Save current clipboard, paste transcript, restore clipboard
        const savedClipboard = clipboard.readText();
        clipboard.writeText(finalText);

        // Simulate Ctrl+V to paste into focused app
        await new Promise(r => setTimeout(r, 200));

        try {
          const { execSync } = require('child_process');
          execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { timeout: 3000 });
          console.log('[DICTATION] Pasted via PowerShell SendKeys');
        } catch (psErr) {
          console.error('[DICTATION] Paste failed, text is in clipboard:', psErr);
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Copied to clipboard \u2014 Ctrl+V to paste');
        }

        // Restore original clipboard after a brief delay
        setTimeout(() => {
          clipboard.writeText(savedClipboard);
        }, 500);

        mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
      } else if (mode === 'command') {
        // ── Command flow: detect intent via regex fast-path, then route ──
        const result = await smartProcess(transcript);
        const intent = result.intent || 'GENERAL';
        mainWindow.webContents.send(IPC.TRANSCRIPT, transcript);

        if (intent === 'TASK_QUERY') {
          const tasks = getMyTasks();
          mainWindow.webContents.send(IPC.TASKS_UPDATE, tasks);
        } else if (intent === 'MEETING_PREP') {
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Checking your calendar...');
          try {
            const { GoogleAuth } = require('./auth/google-auth');
            const { CalendarClient } = require('./calendar/google-calendar');
            const { generateMeetingBrief } = require('./calendar/meeting-prep');
            const auth = new GoogleAuth();
            if (auth.isAuthenticated()) {
              const calendar = new CalendarClient(auth);
              const meetings = await calendar.getUpcomingMeetings(120); // next 2 hours
              if (meetings.length > 0) {
                const brief = await generateMeetingBrief(meetings[0]);
                mainWindow.webContents.send(IPC.BRIEFING_SHOW, brief);
              } else {
                mainWindow.webContents.send(IPC.TRANSCRIPT, 'No upcoming meetings found.');
              }
            } else {
              mainWindow.webContents.send(IPC.ERROR, 'Google not connected. Use tray menu to connect.');
            }
          } catch (err: any) {
            mainWindow.webContents.send(IPC.ERROR, 'Meeting prep failed: ' + err.message);
          }
          mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        } else if (intent === 'KNOWLEDGE_QUERY') {
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Searching knowledge base...');
          try {
            const rows = sqlite.prepare(
              'SELECT content, source_type FROM knowledge_entries WHERE embedding IS NOT NULL ORDER BY created_at DESC LIMIT 20'
            ).all() as Array<{ content: string; source_type: string }>;

            if (rows.length === 0) {
              mainWindow.webContents.send(IPC.TRANSCRIPT, "I don't have enough information to answer that yet.");
            } else {
              const context = rows.map((r, i) => `[${i + 1}] (${r.source_type}) ${r.content}`).join('\n\n');
              const Anthropic = require('@anthropic-ai/sdk');
              const ai = new Anthropic.default();
              const aiResponse = await ai.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 512,
                system: 'Answer based ONLY on context. Be concise \u2014 voice response. Cite as [N].',
                messages: [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${transcript}` }],
              });
              const answer = (aiResponse.content[0] as any).text?.trim() || 'No answer found.';
              mainWindow.webContents.send(IPC.KNOWLEDGE_RESPONSE, answer);
            }
          } catch (err: any) {
            mainWindow.webContents.send(IPC.ERROR, 'Knowledge query failed: ' + err.message);
          }
          mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        }

        // Log voice interaction to knowledge graph (non-blocking)
        logVoiceInteraction({
          transcript,
          response: intent === 'TASK_QUERY' ? 'Showed task panel' : intent === 'MEETING_PREP' ? 'Showed meeting briefing' : intent === 'KNOWLEDGE_QUERY' ? 'Showed knowledge response' : transcript,
          intent,
          userId: process.env.SLACK_USER_ID,
        });

        // Return to idle after delay (only for quick intents)
        if (intent === 'TASK_QUERY' || intent === 'GENERAL') {
          setTimeout(() => {
            mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
          }, 5000);
        }
      }
    } catch (err: any) {
      console.error('Whisper transcription failed:', err);
      mainWindow.webContents.send(IPC.ERROR, 'Failed to transcribe audio. Check your API key.');
      mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
    }
  });

  // Get tasks for the current user
  ipcMain.handle(IPC.TASKS_GET, async () => {
    try {
      return getMyTasks();
    } catch (err: any) {
      console.error('Failed to get tasks:', err);
      return [];
    }
  });

  // Follow-up: Send email via Gmail
  ipcMain.handle(IPC.FOLLOWUP_SEND, async (_event, draft: any) => {
    try {
      const { GoogleAuth } = require('./auth/google-auth');
      const { GmailClient } = require('./email/gmail-client');
      const auth = new GoogleAuth();
      const gmail = new GmailClient(auth);
      await gmail.sendEmail(draft.to, draft.subject, draft.body);
      mainWindow.webContents.send(IPC.TRANSCRIPT, 'Follow-up email sent!');
      mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
    } catch (err: any) {
      mainWindow.webContents.send(IPC.ERROR, 'Failed to send email: ' + err.message);
      mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
    }
  });

  // Follow-up: Copy to clipboard
  ipcMain.handle(IPC.FOLLOWUP_COPY, async (_event, text: string) => {
    clipboard.writeText(text);
  });

  // Follow-up: Dismiss (no-op, renderer handles UI)
  ipcMain.handle(IPC.FOLLOWUP_DISMISS, async () => {});

  // Briefing: Dismiss (no-op, renderer handles UI)
  ipcMain.handle(IPC.BRIEFING_DISMISS, async () => {});

  // Window control: toggle click-through for interactive panels
  ipcMain.handle(IPC.SET_IGNORE_MOUSE, async (_event, ignore: boolean) => {
    if (mainWindow) {
      if (process.platform === 'darwin') {
        mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
      } else {
        mainWindow.setIgnoreMouseEvents(ignore);
      }
    }
  });
}

import { ipcMain, BrowserWindow, clipboard } from 'electron';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { IPC } from '../shared/types';
import { transcribeAudio } from './voice/whisper-client';
import { postProcess, smartProcess, formatDictation } from './voice/post-processor';
import { DeepgramStream, isDeepgramAvailable } from './voice/deepgram-stream';
import { getMyTasks } from './db/task-bridge';
import { logVoiceInteraction } from './db/voice-logger';
import { sqlite } from './db/connection';
import { getVoiceMode } from './hotkey';
import { fetchTasks, askKnowledgeBot } from './bot-api';

// Debug log file for voice pipeline
const logPath = path.join(process.env.USERPROFILE || '', '.atlas-chief', 'voice-debug.log');
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logPath, line); } catch {}
  console.log(msg);
}

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  debugLog('[IPC] Handlers registered. Deepgram available: ' + isDeepgramAvailable());

  // Rolling context window for continuity across consecutive transcription chunks.
  let transcriptionContext = '';

  // ── Deepgram streaming session ──
  let activeStream: DeepgramStream | null = null;
  let streamingActive = false;

  // ── Legacy live transcription session state (fallback when no Deepgram key) ──
  let liveTranscriptParts: string[] = [];
  let liveSessionActive = false;

  // ── Inline dictation paste state ──
  let lastPastedText = '';

  /**
   * Delete previously pasted text from the focused app and paste new text in its place.
   * Uses PowerShell SendKeys to send Backspace keystrokes, then Ctrl+V to paste.
   */
  async function pasteIntoApp(newText: string) {
    const oldLen = lastPastedText.length;

    if (oldLen > 0) {
      try {
        const bsKeys = '{BACKSPACE ' + oldLen + '}';
        execSync(
          `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${bsKeys}')"`,
          { timeout: 3000 },
        );
      } catch (bsErr) {
        console.warn('[DICTATION] Failed to send backspaces:', bsErr);
      }
    }

    const savedClipboard = clipboard.readText();
    clipboard.writeText(newText);
    await new Promise(r => setTimeout(r, 50));

    try {
      execSync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
        { timeout: 3000 },
      );
    } catch (psErr) {
      console.error('[DICTATION] Paste failed:', psErr);
    }

    setTimeout(() => { clipboard.writeText(savedClipboard); }, 300);
    lastPastedText = newText;
  }

  // ── Deepgram streaming: start session when first audio chunk arrives ──
  async function startDeepgramStream(): Promise<boolean> {
    if (!isDeepgramAvailable()) return false;

    lastPastedText = '';
    streamingActive = true;

    activeStream = new DeepgramStream({
      onInterim: (text) => {
        // Word-by-word: paste interim text as user speaks
        const processed = postProcess(text, { stripFillers: false });
        if (processed.trim()) {
          pasteIntoApp(processed);
          mainWindow.webContents.send(IPC.PARTIAL_TRANSCRIPT, processed);
        }
      },
      onFinal: (text) => {
        // Sentence finalized — paste the updated full text
        const processed = postProcess(text, { stripFillers: false });
        if (processed.trim()) {
          pasteIntoApp(processed);
          mainWindow.webContents.send(IPC.PARTIAL_TRANSCRIPT, processed);
        }
      },
      onError: (err) => {
        console.error('[DEEPGRAM] Stream error:', err);
      },
      onClose: () => {
        console.log('[DEEPGRAM] Stream closed');
        streamingActive = false;
      },
    });

    const connected = await activeStream.start();
    if (!connected) {
      console.warn('[DEEPGRAM] Failed to connect, falling back to chunk-based transcription');
      activeStream = null;
      streamingActive = false;
    }
    return connected;
  }

  // Handler to start Deepgram streaming with the correct sample rate
  ipcMain.handle(IPC.STREAM_START, async (_event, sampleRate: number) => {
    debugLog('[STREAM] Start requested, sampleRate: ' + sampleRate + ' deepgramAvailable: ' + isDeepgramAvailable() + ' streamingActive: ' + streamingActive);
    if (isDeepgramAvailable() && !streamingActive) {
      lastPastedText = '';
      streamingActive = true;

      activeStream = new DeepgramStream({
        onInterim: (text) => {
          debugLog('[DEEPGRAM] Interim: ' + text.substring(0, 80));
          const processed = postProcess(text, { stripFillers: false });
          if (processed.trim()) {
            pasteIntoApp(processed);
            mainWindow.webContents.send(IPC.PARTIAL_TRANSCRIPT, processed);
          }
        },
        onFinal: (text) => {
          debugLog('[DEEPGRAM] Final: ' + text.substring(0, 80));
          const processed = postProcess(text, { stripFillers: false });
          if (processed.trim()) {
            pasteIntoApp(processed);
            mainWindow.webContents.send(IPC.PARTIAL_TRANSCRIPT, processed);
          }
        },
        onError: (err) => {
          debugLog('[DEEPGRAM] Stream error: ' + err.message);
        },
        onClose: () => {
          debugLog('[DEEPGRAM] Stream closed');
          streamingActive = false;
        },
      });

      debugLog('[DEEPGRAM] Attempting connection...');
      const connected = await activeStream.start(sampleRate);
      debugLog('[DEEPGRAM] Connection result: ' + connected);
      if (!connected) {
        debugLog('[DEEPGRAM] Failed to connect, will use chunk-based fallback');
        activeStream = null;
        streamingActive = false;
      }
    }
  });

  // Handler for partial audio chunks during live dictation transcription
  ipcMain.handle(IPC.PARTIAL_AUDIO, async (_event, audioBuffer: ArrayBuffer) => {
    try {
      const buffer = Buffer.from(audioBuffer);
      if (buffer.length < 500) return;

      // ── Deepgram streaming path: forward raw PCM to WebSocket ──
      if (activeStream && streamingActive) {
        activeStream.sendAudio(buffer);
        return; // Deepgram handles transcription — skip Whisper
      }
      debugLog('[PARTIAL_AUDIO] Using legacy Whisper path, streamingActive: ' + streamingActive);


      // ── Legacy fallback: chunk-based Whisper transcription ──
      if (!liveSessionActive) {
        lastPastedText = '';
      }
      liveSessionActive = true;

      const rawTranscript = await transcribeAudio(buffer, {
        previousTranscript: liveTranscriptParts.join(' '),
        highQualityRetry: false,
      });

      if (rawTranscript && rawTranscript.trim().length > 0) {
        const cleaned = postProcess(rawTranscript, { stripFillers: false });
        if (cleaned && cleaned.trim().length > 0) {
          liveTranscriptParts.push(cleaned);
          const accumulated = liveTranscriptParts.join(' ');
          await pasteIntoApp(accumulated);
          mainWindow.webContents.send(IPC.PARTIAL_TRANSCRIPT, accumulated);
        }
      }
    } catch (err) {
      console.warn('[PARTIAL_AUDIO] Chunk transcription failed:', err);
    }
  });

  // Unified audio handler — single flow for both command and dictation
  ipcMain.handle(IPC.AUDIO_DATA, async (_event, audioBuffer: ArrayBuffer) => {
    debugLog('[AUDIO] Received audio data, size: ' + (audioBuffer?.byteLength || 0) + ' bytes');
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
        let combinedTranscript = transcript;

        // If Deepgram streaming was active, prefer its accumulated results
        if (streamingActive && activeStream) {
          const streamText = activeStream.getFinalTranscript() || activeStream.getFullTranscript();
          activeStream.stop();
          activeStream = null;
          streamingActive = false;

          if (streamText.trim().length > 0) {
            // Deepgram already pasted progressive text — now do a final polish
            // Use Whisper (Groq) result if it's higher quality, otherwise keep Deepgram's
            if (transcript.length > streamText.length * 0.8) {
              combinedTranscript = transcript; // Whisper/Groq captured more
            } else {
              combinedTranscript = streamText; // Deepgram was more complete
            }
          }
        } else if (liveSessionActive && liveTranscriptParts.length > 0) {
          // Legacy fallback: combine partial results
          const partialText = liveTranscriptParts.join(' ');
          if (partialText.length > transcript.length * 1.2) {
            combinedTranscript = partialText;
          }
        }

        const finalText = formatDictation(postProcess(combinedTranscript, { stripFillers: false }));
        console.log('[DICTATION] Final output:', finalText.substring(0, 100));

        // Wait for hotkey backslash cleanup
        await new Promise(r => setTimeout(r, 200));

        await pasteIntoApp(finalText);

        // Reset all session state
        liveTranscriptParts = [];
        liveSessionActive = false;
        lastPastedText = '';

        // Signal renderer to flash checkmark and auto-hide
        mainWindow.webContents.send(IPC.DICTATION_DONE);
      } else if (mode === 'command') {
        // ── Command flow: detect intent via regex fast-path, then route ──
        const result = await smartProcess(transcript);
        let intent = result.intent || 'GENERAL';
        mainWindow.webContents.send(IPC.TRANSCRIPT, transcript);

        // Check for email/draft intent (override general if detected)
        const emailPattern = /\b(email|draft|write|compose|send a message|write up)\b/i;
        const isEmailRequest = emailPattern.test(transcript.toLowerCase());
        if (isEmailRequest && intent !== 'TASK_QUERY' && intent !== 'MEETING_PREP') {
          intent = 'EMAIL_DRAFT';
        }

        if (intent === 'TASK_QUERY') {
          // ── Tasks: try live bot API first, fall back to local DB ──
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Fetching tasks...');
          try {
            const botTasks = await fetchTasks();
            mainWindow.webContents.send(IPC.BOT_TASKS, botTasks);
          } catch (botErr: any) {
            console.warn('[COMMAND] Bot API tasks failed, falling back to local DB:', botErr.message);
            const tasks = getMyTasks();
            mainWindow.webContents.send(IPC.TASKS_UPDATE, tasks);
          }
        } else if (intent === 'EMAIL_DRAFT') {
          // ── Email draft: ask knowledge bot with generateEmail=true ──
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Drafting email...');
          try {
            const response = await askKnowledgeBot(transcript, true);
            mainWindow.webContents.send(IPC.BOT_EMAIL, response);
          } catch (err: any) {
            mainWindow.webContents.send(IPC.ERROR, 'Email draft failed: ' + err.message);
          }
          mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
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
        } else {
          // ── Knowledge / General: ask bot API, fall back to local knowledge ──
          mainWindow.webContents.send(IPC.TRANSCRIPT, 'Thinking...');
          try {
            const response = await askKnowledgeBot(transcript);
            const answer = (response as any).answer || JSON.stringify(response);
            mainWindow.webContents.send(IPC.BOT_KNOWLEDGE, answer);
          } catch (botErr: any) {
            console.warn('[COMMAND] Bot API ask failed, falling back to local knowledge:', botErr.message);
            // Local fallback: query local knowledge DB
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
            } catch (localErr: any) {
              mainWindow.webContents.send(IPC.ERROR, 'Knowledge query failed: ' + localErr.message);
            }
          }
          mainWindow.webContents.send(IPC.STATUS_CHANGE, 'idle');
        }

        // Log voice interaction to knowledge graph (non-blocking)
        logVoiceInteraction({
          transcript,
          response: intent === 'TASK_QUERY' ? 'Showed task panel (bot API)' : intent === 'MEETING_PREP' ? 'Showed meeting briefing' : intent === 'EMAIL_DRAFT' ? 'Drafted email via bot API' : 'Bot API knowledge response',
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
      // Reset live session and paste state on error
      liveTranscriptParts = [];
      liveSessionActive = false;
      lastPastedText = '';
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

  // Bot: Copy text to clipboard
  ipcMain.handle(IPC.BOT_COPY, async (_event, text: string) => {
    clipboard.writeText(text);
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

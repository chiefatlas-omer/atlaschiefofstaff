export {};

declare global {
  interface Window {
    chiefOfStaff: {
      onStatusChange: (cb: (state: string) => void) => void;
      onTranscript: (cb: (text: string) => void) => void;
      onTasksUpdate: (cb: (tasks: any[]) => void) => void;
      onError: (cb: (message: string) => void) => void;
      onDictationDone: (cb: () => void) => void;
      sendAudioData: (buffer: ArrayBuffer) => void;
      getTasks: () => Promise<any[]>;
      // Knowledge
      onKnowledgeResponse: (cb: (answer: string) => void) => void;
      // Briefing
      onBriefingShow: (cb: (brief: any) => void) => void;
      dismissBriefing: () => void;
      // Follow-up
      onFollowUpShow: (cb: (draft: any) => void) => void;
      sendFollowUp: (draft: any) => void;
      copyFollowUp: (text: string) => void;
      dismissFollowUp: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      // Bot API
      onBotTasks: (cb: (tasks: any[]) => void) => void;
      onBotEmail: (cb: (response: any) => void) => void;
      onBotKnowledge: (cb: (answer: string) => void) => void;
      botCopy: (text: string) => void;
    };
  }
}

const statusDot = document.getElementById('status-dot')!;
const waveformContainer = document.getElementById('waveform-container')!;
const transcriptBubble = document.getElementById('transcript-bubble')!;
const transcriptText = document.getElementById('transcript-text')!;
const errorMessage = document.getElementById('error-message')!;
const errorText = document.getElementById('error-text')!;
const taskPanel = document.getElementById('task-panel')!;
const taskList = document.getElementById('task-list')!;

// ── Briefing Panel ──
const briefingPanel = document.getElementById('briefing-panel')!;
const briefingTitle = document.getElementById('briefing-title')!;
const briefingTime = document.getElementById('briefing-time')!;
const briefingAttendees = document.getElementById('briefing-attendees')!;
const briefingTasks = document.getElementById('briefing-tasks')!;
const briefingTalkingPoints = document.getElementById('briefing-talking-points')!;
const briefingDismiss = document.getElementById('briefing-dismiss')!;

// ── Knowledge Panel ──
const knowledgePanel = document.getElementById('knowledge-panel')!;
const knowledgeText = document.getElementById('knowledge-text')!;

// ── Follow-up Panel ──
const followupPanel = document.getElementById('followup-panel')!;
const followupRecipients = document.getElementById('followup-recipients')!;
const followupSubject = document.getElementById('followup-subject') as HTMLInputElement;
const followupBody = document.getElementById('followup-body')!;
const followupSendBtn = document.getElementById('followup-send-btn')!;
const followupCopyBtn = document.getElementById('followup-copy-btn')!;
const followupDismissBtn = document.getElementById('followup-dismiss-btn')!;
const followupDismissAction = document.getElementById('followup-dismiss-action')!;

// Click-through toggle: disable click-through when interactive panels are showing
function updateClickThrough() {
  const anyPanelVisible = !briefingPanel.classList.contains('hidden') ||
    !followupPanel.classList.contains('hidden') ||
    !taskPanel.classList.contains('hidden');
  window.chiefOfStaff.setIgnoreMouseEvents(!anyPanelVisible);
}

// State management
function setState(state: string) {
  statusDot.className = `status-dot ${state}`;

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

// Waveform visualizer — loaded via script tag in index.html, accessed via window global
const waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const waveform = new (window as any).WaveformVisualizer(waveformCanvas);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

// ── VAD / chunk-boundary constants ──────────────────────────────────────────
/** RMS energy below this level is considered silence (0–255 scale from AnalyserNode byte data) */
const VAD_SILENCE_THRESHOLD = 8;
/** Consecutive silent frames needed before we treat it as a natural break point */
const VAD_SILENCE_FRAMES = 45; // ~1.5 s at 60fps analyser ticks
/** Minimum audio duration to bother sending to Whisper (ms) */
const MIN_CHUNK_MS = 1000;

// VAD state
let vadAnalyser: AnalyserNode | null = null;
let vadAudioContext: AudioContext | null = null;
let vadAnimFrame: number | null = null;
let silentFrameCount = 0;
let recordingStartTime = 0;

function stopVad() {
  if (vadAnimFrame !== null) {
    cancelAnimationFrame(vadAnimFrame);
    vadAnimFrame = null;
  }
  if (vadAudioContext) {
    vadAudioContext.close().catch(() => {});
    vadAudioContext = null;
  }
  vadAnalyser = null;
  silentFrameCount = 0;
}

function startVad(stream: MediaStream) {
  stopVad();
  try {
    vadAudioContext = new AudioContext();
    vadAnalyser = vadAudioContext.createAnalyser();
    vadAnalyser.fftSize = 512;
    const source = vadAudioContext.createMediaStreamSource(stream);
    source.connect(vadAnalyser);
    const dataArray = new Uint8Array(vadAnalyser.frequencyBinCount);
    silentFrameCount = 0;

    function tick() {
      if (!vadAnalyser) return;
      vadAnalyser.getByteTimeDomainData(dataArray);

      // Compute RMS energy (centred on 128 for unsigned byte data)
      let sumSq = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] - 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / dataArray.length);

      if (rms < VAD_SILENCE_THRESHOLD) {
        silentFrameCount++;
      } else {
        silentFrameCount = 0;
      }

      // Natural break: enough silence AND minimum duration met
      const elapsed = Date.now() - recordingStartTime;
      if (
        silentFrameCount >= VAD_SILENCE_FRAMES &&
        elapsed >= MIN_CHUNK_MS &&
        mediaRecorder &&
        mediaRecorder.state === 'recording'
      ) {
        console.log('[VAD] Silence break detected at', elapsed, 'ms');
        silentFrameCount = 0;
      }

      vadAnimFrame = requestAnimationFrame(tick);
    }

    vadAnimFrame = requestAnimationFrame(tick);
    console.log('[VAD] Started');
  } catch (err) {
    console.warn('[VAD] Could not start analyser:', err);
  }
}

/** Send accumulated chunks to the unified audio handler */
async function flushAudioChunks(chunks: Blob[]) {
  if (chunks.length === 0) return;
  const audioBlob = new Blob(chunks, { type: 'audio/webm' });
  console.log('[RECORDER] Blob size:', audioBlob.size, 'bytes');

  // Enforce minimum chunk size guard
  if (audioBlob.size < 2000) {
    console.log('[RECORDER] Chunk too small, discarding');
    return;
  }

  const buffer = await audioBlob.arrayBuffer();
  console.log('[RECORDER] Sending to unified audio handler');
  window.chiefOfStaff.sendAudioData(buffer);
}

// Main status change handler — manages UI state, waveform, and recording
window.chiefOfStaff.onStatusChange(async (state: string) => {
  setState(state);

  if (state === 'listening') {
    try {
      const stream = await waveform.start();
      recordingStartTime = Date.now();

      // Set up MediaRecorder to capture audio for Whisper
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[RECORDER] Stopped. Chunks:', audioChunks.length);
        const chunksCopy = [...audioChunks];
        audioChunks = [];
        await flushAudioChunks(chunksCopy);
      };

      // Start VAD alongside recorder
      startVad(stream);
      mediaRecorder.start();
      console.log('[RECORDER] Started recording');
    } catch (err) {
      console.error('[RECORDER] Failed to start audio capture:', err);
    }
  } else if (state === 'processing') {
    console.log('[RECORDER] Processing state — stopping recorder');
    stopVad();
    waveform.stop();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }
});

// Listen for transcripts (command mode only — dictation skips this)
window.chiefOfStaff.onTranscript((text) => {
  transcriptText.textContent = text;
  transcriptBubble.classList.remove('hidden');
  waveformContainer.classList.add('hidden');

  setTimeout(() => {
    transcriptBubble.classList.add('hidden');
  }, 5000);
});

// Dictation done — no visual feedback, just return to idle instantly
window.chiefOfStaff.onDictationDone(() => {
  waveformContainer.classList.add('hidden');
  setState('idle');
});

// Listen for errors
window.chiefOfStaff.onError((message) => {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  setState('error');

  setTimeout(() => {
    errorMessage.classList.add('hidden');
    setState('idle');
  }, 5000);
});

// Listen for task updates
window.chiefOfStaff.onTasksUpdate((tasks: any[]) => {
  taskPanel.classList.remove('hidden');
  updateClickThrough();
  taskList.innerHTML = '';

  if (tasks.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'task-item';
    const emptyDesc = document.createElement('div');
    emptyDesc.className = 'task-description';
    emptyDesc.style.color = 'rgba(255,255,255,0.5)';
    emptyDesc.textContent = 'No open tasks';
    emptyItem.appendChild(emptyDesc);
    taskList.appendChild(emptyItem);
  } else {
    tasks.forEach((task: any) => {
      const isOverdue = task.status === 'OVERDUE' || task.status === 'ESCALATED';
      const div = document.createElement('div');
      div.className = `task-item ${isOverdue ? 'task-status-overdue' : 'task-status-confirmed'}`;
      const descDiv = document.createElement('div');
      descDiv.className = 'task-description';
      descDiv.textContent = task.description;
      const metaDiv = document.createElement('div');
      metaDiv.className = 'task-meta';
      metaDiv.textContent = `${task.status} \u00B7 ${task.deadlineText || 'No deadline'}`;
      div.appendChild(descDiv);
      div.appendChild(metaDiv);
      taskList.appendChild(div);
    });
  }

  // Auto-hide after 10 seconds
  setTimeout(() => {
    taskPanel.classList.add('hidden');
    updateClickThrough();
  }, 10000);
});

// ── Briefing Panel Events ──
let briefingAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

window.chiefOfStaff.onBriefingShow((brief: any) => {
  briefingTitle.textContent = brief.meetingTitle;
  briefingTime.textContent = new Date(brief.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Attendees
  briefingAttendees.innerHTML = '';
  (brief.attendees || []).forEach((a: any) => {
    const div = document.createElement('div');
    div.className = 'briefing-attendee';
    const nameNode = document.createTextNode(a.name);
    const emailSpan = document.createElement('span');
    emailSpan.className = 'briefing-attendee-email';
    emailSpan.textContent = a.email;
    div.appendChild(nameNode);
    div.appendChild(emailSpan);
    briefingAttendees.appendChild(div);
  });

  // Tasks
  briefingTasks.innerHTML = '';
  if (brief.openTasks && brief.openTasks.length > 0) {
    brief.openTasks.forEach((task: any) => {
      const div = document.createElement('div');
      div.className = 'briefing-task-item';
      div.textContent = task.description;
      briefingTasks.appendChild(div);
    });
  } else {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.color = 'rgba(255,255,255,0.4)';
    emptyDiv.style.fontSize = '13px';
    emptyDiv.textContent = 'No related tasks';
    briefingTasks.appendChild(emptyDiv);
  }

  // Talking points
  briefingTalkingPoints.innerHTML = '';
  (brief.suggestedTalkingPoints || []).forEach((point: string) => {
    const div = document.createElement('div');
    div.className = 'briefing-talking-point';
    div.textContent = point;
    briefingTalkingPoints.appendChild(div);
  });

  briefingPanel.classList.remove('hidden');
  updateClickThrough();

  // Auto-hide after 60s
  if (briefingAutoHideTimer) clearTimeout(briefingAutoHideTimer);
  briefingAutoHideTimer = setTimeout(() => {
    briefingPanel.classList.add('hidden');
    updateClickThrough();
  }, 60000);
});

briefingDismiss.addEventListener('click', () => {
  briefingPanel.classList.add('hidden');
  updateClickThrough();
  if (briefingAutoHideTimer) clearTimeout(briefingAutoHideTimer);
  window.chiefOfStaff.dismissBriefing();
});

// ── Follow-up Panel Events ──
let currentFollowUpDraft: any = null;

window.chiefOfStaff.onFollowUpShow((draft: any) => {
  currentFollowUpDraft = draft;
  followupRecipients.textContent = 'To: ' + (draft.to || []).join(', ');
  followupSubject.value = draft.subject || '';
  // Sanitize follow-up body HTML (strip script tags — accepted risk for internal tool)
  const sanitized = (draft.body || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  followupBody.innerHTML = sanitized;
  followupPanel.classList.remove('hidden');
  updateClickThrough();
});

followupSendBtn.addEventListener('click', () => {
  if (currentFollowUpDraft) {
    const updatedDraft = {
      ...currentFollowUpDraft,
      subject: followupSubject.value,
      body: followupBody.innerHTML,
    };
    window.chiefOfStaff.sendFollowUp(updatedDraft);
    followupPanel.classList.add('hidden');
    updateClickThrough();
  }
});

followupCopyBtn.addEventListener('click', () => {
  const text = followupBody.innerText || followupBody.textContent || '';
  window.chiefOfStaff.copyFollowUp(text);
  followupCopyBtn.textContent = 'Copied!';
  setTimeout(() => { followupCopyBtn.textContent = 'Copy'; }, 2000);
});

const dismissFollowUp = () => {
  followupPanel.classList.add('hidden');
  updateClickThrough();
  currentFollowUpDraft = null;
  window.chiefOfStaff.dismissFollowUp();
};

followupDismissBtn.addEventListener('click', dismissFollowUp);
followupDismissAction.addEventListener('click', dismissFollowUp);

// ── Knowledge Response ──
let knowledgeAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

window.chiefOfStaff.onKnowledgeResponse((answer: string) => {
  knowledgeText.textContent = answer;
  knowledgePanel.classList.remove('hidden');

  if (knowledgeAutoHideTimer) clearTimeout(knowledgeAutoHideTimer);
  knowledgeAutoHideTimer = setTimeout(() => {
    knowledgePanel.classList.add('hidden');
  }, 15000);
});

// ── Bot API: Tasks from live bot ──
window.chiefOfStaff.onBotTasks((tasks: any[]) => {
  taskPanel.classList.remove('hidden');
  updateClickThrough();
  taskList.innerHTML = '';

  if (!tasks || tasks.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'task-item';
    const emptyDesc = document.createElement('div');
    emptyDesc.className = 'task-description';
    emptyDesc.style.color = 'rgba(255,255,255,0.5)';
    emptyDesc.textContent = 'No open tasks';
    emptyItem.appendChild(emptyDesc);
    taskList.appendChild(emptyItem);
  } else {
    tasks.forEach((task: any) => {
      const isOverdue = task.status === 'OVERDUE' || task.status === 'ESCALATED';
      const div = document.createElement('div');
      div.className = `task-item ${isOverdue ? 'task-status-overdue' : 'task-status-confirmed'}`;
      const descDiv = document.createElement('div');
      descDiv.className = 'task-description';
      descDiv.textContent = task.description;
      const metaDiv = document.createElement('div');
      metaDiv.className = 'task-meta';
      const deadline = task.deadlineText || task.deadline || 'No deadline';
      const owner = task.owner ? ` \u00B7 ${task.owner}` : '';
      metaDiv.textContent = `${task.status}${owner} \u00B7 ${deadline}`;
      div.appendChild(descDiv);
      div.appendChild(metaDiv);
      taskList.appendChild(div);
    });
  }

  // Auto-hide after 10 seconds
  setTimeout(() => {
    taskPanel.classList.add('hidden');
    updateClickThrough();
  }, 10000);
});

// ── Bot API: Email draft ──
window.chiefOfStaff.onBotEmail((response: any) => {
  const emailText = response.email
    ? `Subject: ${response.email.subject}\n\n${response.email.body}`
    : response.answer || 'No email generated.';

  // Reuse the knowledge panel to display the email with a copy button
  knowledgeText.textContent = emailText;
  knowledgePanel.classList.remove('hidden');

  // Add a copy button if not already present
  let copyBtn = document.getElementById('bot-email-copy-btn');
  if (!copyBtn) {
    copyBtn = document.createElement('button');
    copyBtn.id = 'bot-email-copy-btn';
    copyBtn.textContent = 'Copy to Clipboard';
    copyBtn.style.cssText = 'margin-top:8px;padding:6px 12px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;font-size:12px;';
    copyBtn.addEventListener('click', () => {
      window.chiefOfStaff.botCopy(emailText);
      copyBtn!.textContent = 'Copied!';
      setTimeout(() => { copyBtn!.textContent = 'Copy to Clipboard'; }, 2000);
    });
    knowledgePanel.appendChild(copyBtn);
  } else {
    // Update the click handler for the new email text
    const newBtn = copyBtn.cloneNode(true) as HTMLElement;
    newBtn.addEventListener('click', () => {
      window.chiefOfStaff.botCopy(emailText);
      newBtn.textContent = 'Copied!';
      setTimeout(() => { newBtn.textContent = 'Copy to Clipboard'; }, 2000);
    });
    copyBtn.replaceWith(newBtn);
  }

  if (knowledgeAutoHideTimer) clearTimeout(knowledgeAutoHideTimer);
  knowledgeAutoHideTimer = setTimeout(() => {
    knowledgePanel.classList.add('hidden');
  }, 30000); // longer timeout for email drafts
});

// ── Bot API: Knowledge response ──
window.chiefOfStaff.onBotKnowledge((answer: string) => {
  knowledgeText.textContent = answer;
  knowledgePanel.classList.remove('hidden');

  // Remove email copy button if present (this is a plain knowledge response)
  const copyBtn = document.getElementById('bot-email-copy-btn');
  if (copyBtn) copyBtn.style.display = 'none';

  if (knowledgeAutoHideTimer) clearTimeout(knowledgeAutoHideTimer);
  knowledgeAutoHideTimer = setTimeout(() => {
    knowledgePanel.classList.add('hidden');
  }, 15000);
});

// Initial state
setState('idle');
console.log('Atlas Chief of Staff renderer loaded.');

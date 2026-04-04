/**
 * deepgram-stream.ts
 *
 * Real-time streaming transcription via Deepgram's WebSocket API.
 * Provides word-by-word results as the user speaks — interim results
 * appear instantly, final results are accumulated for the complete text.
 */

import WebSocket from 'ws';
import { config } from '../config';

export interface StreamCallbacks {
  /** Called with interim (in-progress) text — updates frequently as user speaks */
  onInterim: (text: string) => void;
  /** Called when a sentence/utterance is finalized */
  onFinal: (text: string) => void;
  /** Called on error */
  onError: (err: Error) => void;
  /** Called when connection closes */
  onClose: () => void;
}

export class DeepgramStream {
  private ws: WebSocket | null = null;
  private finalParts: string[] = [];
  private currentInterim = '';
  private callbacks: StreamCallbacks;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: StreamCallbacks) {
    this.callbacks = callbacks;
  }

  /** Open the streaming connection. Returns true if connected. */
  async start(): Promise<boolean> {
    if (!config.deepgram.apiKey) {
      return false;
    }

    return new Promise((resolve) => {
      const params = new URLSearchParams({
        model: 'nova-2',
        language: 'en',
        smart_format: 'true',
        interim_results: 'true',
        utterance_end_ms: '1500',
        vad_events: 'true',
        punctuate: 'true',
        filler_words: 'false',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      });

      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${config.deepgram.apiKey}`,
        },
      });

      this.ws.on('open', () => {
        console.log('[DEEPGRAM] WebSocket connected');
        // Send keep-alive every 10s to prevent timeout
        this.keepAliveTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 10000);
        resolve(true);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // Ignore non-JSON messages
        }
      });

      this.ws.on('error', (err) => {
        console.error('[DEEPGRAM] WebSocket error:', err);
        this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        resolve(false);
      });

      this.ws.on('close', () => {
        console.log('[DEEPGRAM] WebSocket closed');
        this.cleanup();
        this.callbacks.onClose();
      });

      // Timeout if connection doesn't open in 5s
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.warn('[DEEPGRAM] Connection timeout');
          this.ws?.close();
          resolve(false);
        }
      }, 5000);
    });
  }

  /** Send a raw PCM audio chunk (16-bit, 16kHz, mono) */
  sendAudio(pcmBuffer: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcmBuffer);
    }
  }

  /** Signal end of audio and close connection */
  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send close stream message
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      // Close after a brief delay to let final results arrive
      setTimeout(() => {
        this.ws?.close();
      }, 500);
    } else {
      this.cleanup();
    }
  }

  /** Get the full accumulated transcript so far */
  getFullTranscript(): string {
    const final = this.finalParts.join(' ').trim();
    if (this.currentInterim) {
      return (final + ' ' + this.currentInterim).trim();
    }
    return final;
  }

  /** Get only the finalized parts (no interim) */
  getFinalTranscript(): string {
    return this.finalParts.join(' ').trim();
  }

  private handleMessage(msg: any): void {
    // Transcript result
    if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
      const transcript = msg.channel.alternatives[0].transcript || '';
      const isFinal = msg.is_final === true;

      if (!transcript.trim()) return;

      if (isFinal) {
        // This sentence is done — accumulate it
        this.finalParts.push(transcript.trim());
        this.currentInterim = '';
        const fullText = this.finalParts.join(' ');
        console.log('[DEEPGRAM] Final:', transcript.substring(0, 80));
        this.callbacks.onFinal(fullText);
      } else {
        // Interim — show what's being said right now
        this.currentInterim = transcript.trim();
        const fullText = this.getFullTranscript();
        this.callbacks.onInterim(fullText);
      }
    }

    // Utterance end (silence detected) — can trigger final cleanup
    if (msg.type === 'UtteranceEnd') {
      console.log('[DEEPGRAM] Utterance end detected');
    }
  }

  private cleanup(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.ws = null;
  }
}

/**
 * Check if Deepgram streaming is available (API key configured).
 */
export function isDeepgramAvailable(): boolean {
  return !!config.deepgram.apiKey;
}

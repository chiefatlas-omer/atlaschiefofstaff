import { config } from '../config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

// Domain vocabulary primes Whisper to correctly recognise business-specific terms.
// The trailing context window (previousTranscript) is appended at call time to give
// Whisper sentence-level continuity across consecutive chunks.
const DOMAIN_VOCAB = 'Atlas Growth, Chief of Staff, CoS, landscaping, irrigation, maintenance contract, client onboarding, SOP, CRM, proposal, estimate, crew, site visit, MRR, ARR, churn, NRR, QBR, pipeline, API, onboarding, upsell, renewal, CAC, LTV';

export interface TranscribeOptions {
  /** Last ~200 chars of the previous transcription chunk — improves continuity */
  previousTranscript?: string;
  /** Retry with slightly relaxed temperature on first call? (default false) */
  highQualityRetry?: boolean;
}

// Determine which backend to use: Groq (fast) or OpenAI (fallback)
function getWhisperBackend(): { hostname: string; apiKey: string; model: string } {
  if (config.groq?.apiKey) {
    return {
      hostname: 'api.groq.com',
      apiKey: config.groq.apiKey,
      model: 'whisper-large-v3-turbo',
    };
  }
  return {
    hostname: 'api.openai.com',
    apiKey: config.openai.apiKey,
    model: 'whisper-1',
  };
}

// Use raw https instead of OpenAI SDK to avoid node-fetch ECONNRESET on Electron + Windows ARM64
export async function transcribeAudio(
  audioBuffer: Buffer,
  options: TranscribeOptions = {}
): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `atlas-cos-${Date.now()}.webm`);

  try {
    fs.writeFileSync(tempPath, audioBuffer);
    const result = await _callWhisper(tempPath, options, 0);
    return result;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

async function _callWhisper(
  tempPath: string,
  options: TranscribeOptions,
  attempt: number
): Promise<string> {
  const fileData = fs.readFileSync(tempPath);
  const boundary = `----FormBoundary${Date.now()}`;

  // Build the prompt: domain vocab + optional previous-transcript context window
  let prompt = DOMAIN_VOCAB;
  if (options.previousTranscript && options.previousTranscript.trim().length > 0) {
    // Whisper uses the last ~224 tokens of the prompt as acoustic context
    const context = options.previousTranscript.trim().slice(-200);
    prompt = `${context} ${DOMAIN_VOCAB}`;
  }

  // On retry (low-confidence), use a small non-zero temperature for diversity
  const temperature = attempt === 0 ? '0' : '0.2';

  // Build multipart form data manually
  const parts: Buffer[] = [];

  // File field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n` +
    `Content-Type: audio/webm\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from('\r\n'));

  const backend = getWhisperBackend();
  console.log('[WHISPER] Using backend:', backend.hostname, 'model:', backend.model);

  // Model field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${backend.model}\r\n`
  ));

  // Language field — explicit 'en' prevents Whisper auto-detect overhead
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `en\r\n`
  ));

  // Prompt field (domain vocabulary + continuity context)
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
    `${prompt}\r\n`
  ));

  // Temperature field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="temperature"\r\n\r\n` +
    `${temperature}\r\n`
  ));

  // End boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const text = await new Promise<string>((resolve, reject) => {
    const apiPath = backend.hostname === 'api.groq.com'
      ? '/openai/v1/audio/transcriptions'
      : '/v1/audio/transcriptions';

    const req = https.request({
      hostname: backend.hostname,
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${backend.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.error('[WHISPER] API error:', res.statusCode, data);
            reject(new Error(`Whisper API error ${res.statusCode}: ${data}`));
            return;
          }
          const json = JSON.parse(data);
          resolve(json.text || '');
        } catch (err) {
          reject(new Error('Failed to parse Whisper response: ' + data));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[WHISPER] Request error:', err);
      reject(err);
    });

    req.write(body);
    req.end();
  });

  // Confidence-based retry heuristic: very short output for non-trivial audio
  // suggests Whisper may have hallucinated silence markers or truncated.
  // Retry once with temperature=0.2 to get a more exploratory decode.
  if (
    attempt === 0 &&
    options.highQualityRetry &&
    text.trim().length < 4 &&
    fileData.length > 10000
  ) {
    console.log('[WHISPER] Low-confidence output detected, retrying with temperature=0.2');
    return _callWhisper(tempPath, options, 1);
  }

  return text;
}

import { config } from '../config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

// Use raw https instead of OpenAI SDK to avoid node-fetch ECONNRESET on Electron + Windows ARM64
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `atlas-cos-${Date.now()}.webm`);

  try {
    fs.writeFileSync(tempPath, audioBuffer);

    const fileData = fs.readFileSync(tempPath);
    const boundary = `----FormBoundary${Date.now()}`;

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

    // Model field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    ));

    // Language field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `en\r\n`
    ));

    // End boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
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
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

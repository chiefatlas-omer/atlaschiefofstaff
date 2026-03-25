import { google } from 'googleapis';
import { GoogleAuth } from '../auth/google-auth';

export class GmailClient {
  constructor(private auth: GoogleAuth) {}

  async sendEmail(to: string[], subject: string, body: string): Promise<void> {
    const client = await this.auth.getClient();
    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = createRawEmail(to, subject, body);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      },
    });
  }

  async createDraft(to: string[], subject: string, body: string): Promise<string> {
    const client = await this.auth.getClient();
    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = createRawEmail(to, subject, body);

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw,
        },
      },
    });

    return response.data.id || '';
  }
}

function createRawEmail(to: string[], subject: string, body: string): string {
  const toHeader = to.join(', ');
  const boundary = `boundary_${Date.now()}`;

  const email = [
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    stripHtml(body),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    body,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  // Base64url encode
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

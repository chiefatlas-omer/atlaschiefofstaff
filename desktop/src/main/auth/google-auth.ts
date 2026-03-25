import { google, Auth } from 'googleapis';
import { shell } from 'electron';
import http from 'http';
import url from 'url';
import Store from 'electron-store';
import { config } from '../config';

const store = new Store<{
  google: {
    refreshToken: string;
    accessToken: string;
    tokenExpiry: number;
  };
}>();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
];

export class GoogleAuth {
  private oauth2Client: Auth.OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri,
    );

    // Load saved tokens
    const savedRefreshToken = store.get('google.refreshToken') as string | undefined;
    if (savedRefreshToken) {
      this.oauth2Client.setCredentials({
        refresh_token: savedRefreshToken,
        access_token: store.get('google.accessToken') as string | undefined,
        expiry_date: store.get('google.tokenExpiry') as number | undefined,
      });
    }
  }

  isAuthenticated(): boolean {
    return !!store.get('google.refreshToken');
  }

  async getClient(): Promise<Auth.OAuth2Client> {
    if (!this.isAuthenticated()) {
      throw new Error('Google not authenticated. Use startAuthFlow() first.');
    }

    // Auto-refresh if expired
    const expiry = (store.get('google.tokenExpiry') as number) || 0;
    if (Date.now() > expiry - 60000) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.saveTokens(credentials);
      } catch (err) {
        console.error('Token refresh failed:', err);
        throw new Error('Google token expired. Please re-authenticate.');
      }
    }

    return this.oauth2Client;
  }

  async startAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Force consent to get refresh_token
      });

      // Start local HTTP server to receive callback
      const server = http.createServer(async (req, res) => {
        try {
          const queryParams = new url.URL(req.url!, `http://localhost:8923`).searchParams;
          const code = queryParams.get('code');

          if (!code) {
            res.writeHead(400);
            res.end('Missing authorization code');
            return;
          }

          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);
          this.saveTokens(tokens);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Connected!</h1><p>You can close this window and return to Atlas Chief of Staff.</p></body></html>');

          server.close();
          resolve();
        } catch (err) {
          res.writeHead(500);
          res.end('Authentication failed');
          server.close();
          reject(err);
        }
      });

      server.listen(8923, () => {
        shell.openExternal(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Google authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }

  private saveTokens(tokens: any) {
    if (tokens.refresh_token) {
      store.set('google.refreshToken', tokens.refresh_token);
    }
    if (tokens.access_token) {
      store.set('google.accessToken', tokens.access_token);
    }
    if (tokens.expiry_date) {
      store.set('google.tokenExpiry', tokens.expiry_date);
    }
  }
}

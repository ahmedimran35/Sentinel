import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  extraParams?: Record<string, string>;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

async function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const cmd =
    platform === 'darwin'
      ? 'open'
      : platform === 'win32'
        ? 'start'
        : 'xdg-open';

  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

function getConfigDir(): string {
  return join(homedir(), '.config', 'sentinel', 'oauth');
}

function getTokenPath(provider: string): string {
  return join(getConfigDir(), `${provider}.json`);
}

export class OAuthManager {
  async authorize(config: OAuthConfig): Promise<OAuthToken> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    return new Promise<OAuthToken>((resolve, reject) => {
      let settled = false;
      let actualRedirectUri = config.redirectUri;

      const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization failed</h1><p>Invalid response from provider.</p>');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful</h1><p>You may close this window.</p>');

        if (!settled) {
          settled = true;
          cleanup();
          this.exchangeCodeForToken(code, codeVerifier, actualRedirectUri, config).then(resolve, reject);
        }
      });

      const cleanup = () => {
        clearTimeout(timeout);
        server.close();
        process.removeListener('SIGINT', onSigint);
      };

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Authorization timed out after 60 seconds'));
        }
      }, 60_000);

      const onSigint = () => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Authorization cancelled by user'));
        }
      };

      process.on('SIGINT', onSigint);

      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        actualRedirectUri = `http://localhost:${port}`;

        const authUrl = new URL(config.authorizationUrl);
        authUrl.searchParams.set('client_id', config.clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', actualRedirectUri);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        if (config.scopes.length > 0) {
          authUrl.searchParams.set('scope', config.scopes.join(' '));
        }

        openBrowser(authUrl.toString());
      });

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    config: OAuthConfig,
  ): Promise<OAuthToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    });

    if (config.clientSecret) {
      body.set('client_secret', config.clientSecret);
    }

    if (config.extraParams) {
      for (const [key, value] of Object.entries(config.extraParams)) {
        body.set(key, value);
      }
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
      tokenType: (data.token_type as string) ?? 'Bearer',
      scope: data.scope as string | undefined,
    };
  }

  async refreshToken(token: OAuthToken, config: OAuthConfig): Promise<OAuthToken> {
    if (!token.refreshToken) {
      throw new Error('No refresh token available');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: config.clientId,
    });

    if (config.clientSecret) {
      body.set('client_secret', config.clientSecret);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? token.refreshToken,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
      tokenType: (data.token_type as string) ?? 'Bearer',
      scope: data.scope as string | undefined,
    };
  }

  isExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) return false;
    return Date.now() >= token.expiresAt - TOKEN_REFRESH_BUFFER_MS;
  }

  getAuthHeaders(token: OAuthToken): Record<string, string> {
    return { Authorization: `${token.tokenType} ${token.accessToken}` };
  }

  async saveToken(provider: string, token: OAuthToken): Promise<void> {
    const dir = getConfigDir();
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const filePath = getTokenPath(provider);
    const tmpFile = join(dir, `.${provider}.${randomUUID()}.tmp`);
    await writeFile(tmpFile, JSON.stringify(token, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(tmpFile, filePath);
  }

  async loadToken(provider: string): Promise<OAuthToken | null> {
    try {
      const data = await readFile(getTokenPath(provider), 'utf-8');
      return JSON.parse(data) as OAuthToken;
    } catch {
      return null;
    }
  }

  async clearToken(provider: string): Promise<void> {
    try {
      await unlink(getTokenPath(provider));
    } catch {
      // file didn't exist
    }
  }
}

export interface OAuthProvider {
  name: string;
  displayName: string;
  oauthConfig: OAuthConfig;
  defaultModel: string;
  modelsUrl: string;
  apiBaseUrl: string;
}

export const builtInOAuthProviders: OAuthProvider[] = [
  {
    name: 'github',
    displayName: 'GitHub',
    oauthConfig: {
      clientId: 'sentinel-cli',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'read:user'],
      redirectUri: 'http://localhost:0',
    },
    defaultModel: 'gpt-4o',
    modelsUrl: 'https://api.github.com/models',
    apiBaseUrl: 'https://api.github.com',
  },
  {
    name: 'gitlab',
    displayName: 'GitLab',
    oauthConfig: {
      clientId: 'sentinel-cli',
      authorizationUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      scopes: ['read_api', 'read_repository'],
      redirectUri: 'http://localhost:0',
    },
    defaultModel: 'gpt-4o',
    modelsUrl: 'https://gitlab.com/api/v4/models',
    apiBaseUrl: 'https://gitlab.com/api/v4',
  },
  {
    name: 'google-ai',
    displayName: 'Google AI (Gemini)',
    oauthConfig: {
      clientId: 'sentinel-cli',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      redirectUri: 'http://localhost:0',
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    defaultModel: 'gemini-2.0-flash',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
];

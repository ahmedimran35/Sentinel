import { EventEmitter } from 'node:events';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RemoteMCPConfig {
  url: string;
  headers?: Record<string, string>;
  oauth?:
    | {
        clientId?: string;
        clientSecret?: string;
        scope?: string;
      }
    | false;
  timeout?: number;
}

export interface RemoteMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  clientId?: string;
}

function getAuthPath(): string {
  return join(homedir(), '.config', 'sentinel', 'mcp-auth.json');
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
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

export class RemoteMCPClient extends EventEmitter {
  private config: Required<Pick<RemoteMCPConfig, 'url' | 'timeout'>> &
    Pick<RemoteMCPConfig, 'headers' | 'oauth'>;
  private _connected = false;
  private oauthToken: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  } | null = null;
  private metadata: OAuthMetadata | null = null;
  private nextId = 1;

  constructor(config: RemoteMCPConfig) {
    super();
    this.config = {
      url: config.url,
      timeout: config.timeout ?? 5000,
      headers: config.headers ?? {},
      oauth: config.oauth,
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    await this.loadToken();
    this._connected = true;
    this.emit('connected');
  }

  async listTools(): Promise<RemoteMCPTool[]> {
    const response = (await this.request('tools/list', {})) as {
      tools?: RemoteMCPTool[];
    };
    return response.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.emit('disconnected');
  }

  async authenticate(): Promise<void> {
    const metadata = await this.discoverOAuthMetadata();

    let clientId =
      this.config.oauth && typeof this.config.oauth === 'object'
        ? this.config.oauth.clientId
        : undefined;
    let clientSecret =
      this.config.oauth && typeof this.config.oauth === 'object'
        ? this.config.oauth.clientSecret
        : undefined;

    if (!clientId && metadata.registration_endpoint) {
      const reg = await this.dynamicRegistration(metadata.registration_endpoint);
      clientId = reg.client_id;
      clientSecret = reg.client_secret;
    }

    if (!clientId) {
      throw new Error(
        'No clientId for OAuth. Set oauth.clientId or enable dynamic registration on the server.',
      );
    }

    const token = await this.authorizationCodeFlow(
      metadata,
      clientId,
      clientSecret,
    );
    this.oauthToken = token;
    await this.saveToken(token);
  }

  private async request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextId++;
    const body: MCPRequest = { jsonrpc: '2.0', id, method, params };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.oauthToken) {
      headers['Authorization'] = `Bearer ${this.oauthToken.accessToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      let response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401 && this.config.oauth !== false) {
        await this.authenticate();
        if (!this.oauthToken) {
          throw new Error('OAuth authentication failed');
        }
        headers['Authorization'] = `Bearer ${this.oauthToken.accessToken}`;
        response = await fetch(this.config.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        throw new Error(
          `MCP request failed (${response.status}): ${await response.text().catch(() => '')}`,
        );
      }

      const data = (await response.json()) as MCPResponse;

      if (data.error) {
        throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
      }

      return data.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async discoverOAuthMetadata(): Promise<OAuthMetadata> {
    const baseUrl = new URL(this.config.url);
    const wellKnownUrl = new URL(
      '/.well-known/oauth-authorization-server',
      baseUrl.origin,
    );

    const response = await fetch(wellKnownUrl.toString());
    if (!response.ok) {
      throw new Error(
        `OAuth metadata discovery failed (${response.status})`,
      );
    }

    const data = (await response.json()) as OAuthMetadata;
    this.metadata = data;
    return data;
  }

  private async dynamicRegistration(
    url: string,
  ): Promise<{ client_id: string; client_secret?: string }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'sentinel',
        redirect_uris: ['http://localhost'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Dynamic client registration failed (${response.status})`,
      );
    }

    return response.json() as Promise<{
      client_id: string;
      client_secret?: string;
    }>;
  }

  private authorizationCodeFlow(
    metadata: OAuthMetadata,
    clientId: string,
    clientSecret?: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    return new Promise((resolve, reject) => {
      let settled = false;

      const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            '<h1>Authorization failed</h1><p>Invalid response from provider.</p>',
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<h1>Authorization successful</h1><p>You may close this window.</p>',
        );

        if (!settled) {
          settled = true;
          cleanup();
          this.exchangeCodeForToken(
            code,
            codeVerifier,
            redirectUri,
            clientId,
            clientSecret,
            metadata.token_endpoint,
          ).then(resolve, reject);
        }
      });

      let redirectUri = 'http://localhost:0';

      const cleanup = () => {
        clearTimeout(timer);
        server.close();
        process.removeListener('SIGINT', onSigint);
      };

      const timer = setTimeout(() => {
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
        const port =
          typeof addr === 'object' && addr ? addr.port : 0;
        redirectUri = `http://localhost:${port}`;

        const authUrl = new URL(metadata.authorization_endpoint);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        if (
          this.config.oauth &&
          typeof this.config.oauth === 'object' &&
          this.config.oauth.scope
        ) {
          authUrl.searchParams.set('scope', this.config.oauth.scope);
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
    clientId: string,
    clientSecret: string | undefined,
    tokenUrl: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Token exchange failed (${response.status}): ${await response.text().catch(() => '')}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
    };
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.oauthToken?.refreshToken)
      throw new Error('No refresh token');

    const metadata =
      this.metadata ?? (await this.discoverOAuthMetadata());
    const clientId =
      this.config.oauth && typeof this.config.oauth === 'object'
        ? this.config.oauth.clientId
        : undefined;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.oauthToken.refreshToken,
      client_id: clientId ?? '',
    });

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Token refresh failed (${response.status}): ${await response.text().catch(() => '')}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    this.oauthToken = {
      accessToken: data.access_token as string,
      refreshToken:
        (data.refresh_token as string) ?? this.oauthToken.refreshToken,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
    };

    await this.saveToken(this.oauthToken);
  }

  private async saveToken(token: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }): Promise<void> {
    const path = getAuthPath();
    const dir = join(homedir(), '.config', 'sentinel');
    await mkdir(dir, { recursive: true, mode: 0o700 });

    let storage: Record<string, StoredAuth> = {};
    try {
      const existing = await readFile(path, 'utf-8');
      storage = JSON.parse(existing);
    } catch {
      /* no existing */
    }

    storage[this.config.url] = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      tokenType: 'Bearer',
      clientId:
        this.config.oauth && typeof this.config.oauth === 'object'
          ? this.config.oauth.clientId
          : undefined,
    };

    const tmpFile = join(dir, `.mcp-auth.${randomUUID()}.tmp`);
    await writeFile(tmpFile, JSON.stringify(storage, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(tmpFile, path);
  }

  private async loadToken(): Promise<void> {
    const path = getAuthPath();
    try {
      const data = await readFile(path, 'utf-8');
      const storage = JSON.parse(data) as Record<string, StoredAuth>;
      const stored = storage[this.config.url];
      if (stored) {
        this.oauthToken = {
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
          expiresAt: stored.expiresAt,
        };
        if (
          stored.expiresAt &&
          Date.now() >= stored.expiresAt - 5 * 60 * 1000 &&
          stored.refreshToken
        ) {
          try {
            await this.refreshAccessToken();
          } catch {
            /* will re-auth on 401 */
          }
        }
      }
    } catch {
      /* no stored token */
    }
  }
}

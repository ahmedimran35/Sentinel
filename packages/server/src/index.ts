import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, appendFileSync, realpathSync } from 'node:fs';
import { resolve, basename, extname, join, relative, dirname } from 'node:path';
import { homedir } from 'node:os';

import type { SentinelEvent, TurnConfig } from '@sentinel/shared';
import type { Tool } from '@sentinel/shared';
import { DEFAULT_MODEL } from '@sentinel/shared';
import type { ProviderMessage } from '@sentinel/providers';
import {
  EventBus, runTurn, InteractiveGate, createProvider,
  saveSession, loadSession, listSessions, removeSession,
  CommandRegistry, shareSession,
  analyzeRepo, initAgentsMd, LSPManager,
  FormatterEngine, getMcpTools, publishService,
} from '@sentinel/core';
import type { Session } from '@sentinel/core';
import { readFileTool, writeFileTool, editFileTool, bashTool, globTool, grepTool, webFetchTool, webSearchTool } from '@sentinel/tools';
import type { Provider } from '@sentinel/providers';
import { OAuthManager, builtInOAuthProviders } from '@sentinel/providers';

import type { ServerOptions, ApiResponse } from './types.js';
import { serveWebUi } from './web-ui.js';

const MAX_BODY_SIZE = 1024 * 128; // 128KB max request body

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'no-referrer',
};

function runCmd(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    if (child.stderr) child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function isPathWithinRoot(targetPath: string, root: string): boolean {
  try {
    const resolvedRoot = realpathSync(root);
    let resolvedTarget: string;
    try {
      resolvedTarget = realpathSync(targetPath);
    } catch {
      resolvedTarget = resolvePathForNonExistent(targetPath, resolvedRoot);
    }
    const rel = relative(resolvedRoot, resolvedTarget);
    return !rel.startsWith('..') && !rel.startsWith('/');
  } catch {
    return false;
  }
}

function resolvePathForNonExistent(targetPath: string, root: string): string {
  try {
    let current = resolve(targetPath);
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      const parent = dirname(current);
      if (parent === current) break;
      parts.push(basename(current));
      current = parent;
      try {
        const resolvedBase = realpathSync(current);
        return join(resolvedBase, ...parts.reverse());
      } catch { /* continue walking up */ }
    }
  } catch { /* fall through */ }
  return resolve(targetPath);
}

interface SseClient {
  id: string;
  res: ServerResponse;
}

interface ServerSession {
  session: Session;
  provider: Provider;
  config: TurnConfig;
  messages: ProviderMessage[];
  createdAt: Date;
  aborted: boolean;
  title?: string;
  parentId?: string;
  childIds: string[];
  revertedMessages: ProviderMessage[][];
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: string;
}

interface ControlRequest {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

function parseJsonBody(req: IncomingMessage, maxSize = MAX_BODY_SIZE): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy(new Error('Request body too large'));
        reject(new Error('Request body exceeds maximum size'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw, (_key, value) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const sanitized: Record<string, unknown> = {};
            for (const k of Object.keys(value)) {
              if (k !== '__proto__' && k !== 'constructor') sanitized[k] = (value as Record<string, unknown>)[k];
            }
            return sanitized;
          }
          return value;
        });
        resolve(typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseQuery(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

function sendJson(res: ServerResponse, status: number, body: ApiResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: { code: status, message } });
}

function sendSuccess<T>(res: ServerResponse, data: T, info?: Record<string, unknown>): void {
  sendJson(res, 200, { data, info } as ApiResponse<T>);
}

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const KNOWN_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'], defaultModel: DEFAULT_MODEL },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], defaultModel: 'gpt-4o' },
  { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], defaultModel: 'gemini-2.0-flash' },
  { id: 'vertex', name: 'Vertex AI', models: ['claude-sonnet-4-20250514', 'claude-3-opus-20240229'], defaultModel: DEFAULT_MODEL },
  { id: 'bedrock', name: 'AWS Bedrock', models: ['claude-sonnet-4-20250514', 'claude-3-opus-20240229'], defaultModel: DEFAULT_MODEL },
  { id: 'nim', name: 'NVIDIA NIM', models: ['meta/llama-3.1-70b-instruct', 'mistralai/mistral-large'], defaultModel: 'meta/llama-3.1-70b-instruct' },
  { id: 'openai-compat', name: 'OpenAI Compatible', models: ['custom'], defaultModel: 'custom' },
];

const KNOWN_AGENTS = [
  { id: 'auto', name: 'Auto', description: 'Automatic mode selection based on task' },
  { id: 'code', name: 'Code', description: 'Focused on code generation and editing' },
  { id: 'architect', name: 'Architect', description: 'System design and architecture' },
  { id: 'debug', name: 'Debug', description: 'Debugging and issue investigation' },
  { id: 'ask', name: 'Ask', description: 'General Q&A and explanations' },
];

function getConnectedProviders(): string[] {
  const connected: string[] = [];
  if (process.env.ANTHROPIC_API_KEY || process.env.SENTINEL_API_KEY) connected.push('anthropic');
  if (process.env.OPENAI_API_KEY) connected.push('openai');
  if (process.env.GEMINI_API_KEY) connected.push('gemini');
  if (process.env.NVIDIA_API_KEY) connected.push('nim');
  return connected;
}

function tryGit(args: string[], cwd?: string): string {
  try {
    const result = spawnSync('git', args, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: 'pipe',
    });
    return (result.stdout ?? '').trim();
  } catch {
    return '';
  }
}

function getAuthConfigDir(): string {
  return join(homedir(), '.config', 'sentinel');
}

function getAuthPath(_id: string): string {
  return join(getAuthConfigDir(), 'auth.json');
}

function getServerLogPath(): string {
  return join(getAuthConfigDir(), 'server.log');
}

function writeServerLog(entry: { service: string; level: string; message: string; extra?: Record<string, unknown> }): void {
  const dir = getAuthConfigDir();
  mkdirSync(dir, { recursive: true });
  const logLine = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  appendFileSync(getServerLogPath(), logLine, 'utf-8');
}


export class SentinelServer {
  private server: HttpServer | null = null;
  private port: number;
  private hostname: string;
  private password: string;
  private requireAuth: boolean;
  private cors: string[];
  private eventBus = new EventBus();
  private sseClients = new Set<SseClient>();
  private sessions = new Map<string, ServerSession>();
  private abortControllers = new Map<string, AbortController>();
  private controlQueue: Array<{ resolve: (v: ControlRequest) => void; reject: (e: Error) => void }> = [];
  private commandRegistry = new CommandRegistry();
  private lspManager = new LSPManager();
  private formatterEngine = new FormatterEngine();
  private mdns = false;
  private mdnsDomain?: string;
  private unpublishMdns: (() => void) | null = null;

  private configData = {
    model: DEFAULT_MODEL,
    provider: 'anthropic' as string,
    maxTurns: 50,
    maxBudgetUsd: undefined as number | undefined,
    projectRoot: process.cwd(),
    mode: 'full' as string,
    theme: 'dark' as string,
    allowOutsideRoot: false,
    temperature: undefined as number | undefined,
  };

  private tools: Tool[] = [
    readFileTool, writeFileTool, editFileTool, bashTool,
    globTool, grepTool, webFetchTool, webSearchTool,
  ];

  constructor(options?: ServerOptions) {
    this.port = options?.port ?? 4096;
    this.hostname = options?.hostname ?? '127.0.0.1';
    this.password = options?.password ?? process.env.OPENCODE_SERVER_PASSWORD ?? '';
    this.requireAuth = options?.requireAuth ?? true;
    this.cors = options?.cors ?? ['*'];
    this.mdns = options?.mdns ?? false;
    this.mdnsDomain = options?.mdnsDomain;

    if (!this.password && this.requireAuth) {
      process.stderr.write('WARNING: No password set. The server is accessible without authentication.\n');
    }

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.eventBus.on('*', (event: SentinelEvent) => {
      for (const client of this.sseClients) {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          client.res.write(data);
        } catch {
          this.sseClients.delete(client);
        }
      }
    });
  }

  get url(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, this.hostname, async () => {
        if (this.mdns) {
          const result = await publishService({
            name: `Sentinel-${this.port}`,
            type: '_opencode._tcp',
            port: this.port,
            hostname: this.mdnsDomain,
          });
          this.unpublishMdns = result.unpublish;
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();

    for (const client of this.sseClients) {
      try { client.res.end(); } catch { /* ignore */ }
    }
    this.sseClients.clear();

    for (const p of this.controlQueue) {
      p.reject(new Error('Server shutting down'));
    }
    this.controlQueue = [];

    this.unpublishMdns?.();
    this.unpublishMdns = null;

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.server = null;
    });
  }

  private isAuthenticated(req: IncomingMessage): boolean {
    if (!this.password && !this.requireAuth) return true;
    if (!this.password) return false;

    const auth = req.headers['authorization'];
    if (!auth) return false;

    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Basic') return false;

    const decoded = Buffer.from(parts[1]!, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    const token = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;

    const tokenHash = createHash('sha256').update(token).digest();
    const pwHash = createHash('sha256').update(this.password).digest();
    return timingSafeEqual(tokenHash, pwHash);
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method?.toUpperCase() ?? 'GET';
    const urlStr = `http://${this.hostname}:${this.port}${req.url ?? '/'}`;
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      sendError(res, 400, 'Invalid URL');
      return;
    }

    if (!this.isAuthenticated(req)) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="Sentinel Server"',
      });
      res.end(JSON.stringify({ error: { code: 401, message: 'Unauthorized' } }));
      return;
    }

    this.setCorsHeaders(res);
    this.setSecurityHeaders(res);

    const clientIp = req.socket.remoteAddress ?? 'unknown';
    if (!checkRateLimit(clientIp) && pathname !== '/global/health') {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: { code: 429, message: 'Too many requests' } }));
      return;
    }

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    void this.routeRequest(method, url, req, res);
  }

  private setCorsHeaders(res: ServerResponse): void {
    const origins = this.cors;
    if (origins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origins.length > 0) {
      res.setHeader('Access-Control-Allow-Origin', origins.join(', '));
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private setSecurityHeaders(res: ServerResponse): void {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(key, value);
    }
  }

  private async routeRequest(method: string, url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (method === 'GET' && pathname === '/global/health') {
        sendSuccess(res, { healthy: true, version: '0.1.0' });
        return;
      }
      if (method === 'GET' && pathname === '/global/event') {
        this.handleSse(req, res);
        return;
      }

      if (method === 'GET' && pathname === '/project') {
        this.handleListProjects(res);
        return;
      }
      if (method === 'GET' && pathname === '/project/current') {
        sendSuccess(res, {
          name: basename(this.configData.projectRoot),
          root: this.configData.projectRoot,
          mode: this.configData.mode,
          model: this.configData.model,
          provider: this.configData.provider,
        });
        return;
      }

      if (method === 'GET' && pathname === '/path') {
        const gitRoot = tryGit(['rev-parse', '--show-toplevel']);
        sendSuccess(res, {
          path: process.cwd(),
          worktree: this.configData.projectRoot,
          gitRoot: gitRoot || undefined,
        });
        return;
      }

      if (method === 'GET' && pathname === '/vcs') {
        const root = tryGit(['rev-parse', '--show-toplevel']);
        const branch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
        const status = tryGit(['status', '--porcelain']);
        sendSuccess(res, {
          type: 'git',
          root: root || undefined,
          branch: branch || undefined,
          clean: !status,
        });
        return;
      }

      if (method === 'POST' && pathname === '/instance/dispose') {
        await this.stop();
        sendSuccess(res, { disposed: true });
        setTimeout(() => process.exit(0), 100);
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        sendSuccess(res, { healthy: true, version: '0.1.0' });
        return;
      }

      if (method === 'GET' && (pathname === '/events' || pathname === '/event')) {
        this.handleSse(req, res);
        return;
      }

      if (method === 'GET' && pathname === '/doc') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getDocHtml());
        return;
      }

      if (method === 'GET' && pathname === '/config') {
        sendSuccess(res, { ...this.configData });
        return;
      }
      if (method === 'PATCH' && pathname === '/config') {
        await this.handlePatchConfig(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/config/providers') {
        sendSuccess(res, {
          providers: KNOWN_PROVIDERS,
          default: { provider: this.configData.provider, model: this.configData.model },
        });
        return;
      }

      if (method === 'GET' && pathname === '/provider') {
        sendSuccess(res, {
          all: KNOWN_PROVIDERS,
          default: { provider: this.configData.provider, model: this.configData.model },
          connected: getConnectedProviders(),
        });
        return;
      }
      if (method === 'GET' && pathname === '/provider/auth') {
        const authMethods = builtInOAuthProviders.map((p) => ({
          id: p.name,
          name: p.displayName,
          defaultModel: p.defaultModel,
        }));
        const envMethods = KNOWN_PROVIDERS.map((p) => ({
          id: p.id,
          name: p.name,
          type: 'api_key' as const,
          envVar: `${p.id === 'anthropic' ? 'ANTHROPIC' : p.id === 'nim' ? 'NVIDIA' : p.id.toUpperCase()}_API_KEY`,
          connected: getConnectedProviders().includes(p.id),
        }));
        sendSuccess(res, { oauth: authMethods, apiKey: envMethods });
        return;
      }

      const providerOauthAuthorizeMatch = pathname.match(/^\/provider\/([^/]+)\/oauth\/authorize$/);
      if (providerOauthAuthorizeMatch && method === 'POST') {
        const providerId = providerOauthAuthorizeMatch[1]!;
        await this.handleProviderOAuthAuthorize(providerId, res);
        return;
      }

      const providerOauthCallbackMatch = pathname.match(/^\/provider\/([^/]+)\/oauth\/callback$/);
      if (providerOauthCallbackMatch && method === 'POST') {
        const providerId = providerOauthCallbackMatch[1]!;
        await this.handleProviderOAuthCallback(providerId, req, res);
        return;
      }

      if (method === 'GET' && pathname === '/session/status') {
        this.handleSessionStatus(res);
        return;
      }

      if (method === 'GET' && pathname === '/session') {
        await this.handleListSessionsV2(url, res);
        return;
      }
      if (method === 'POST' && pathname === '/session') {
        await this.handleCreateSession(req, res);
        return;
      }

      if (method === 'GET' && pathname === '/command') {
        sendSuccess(res, { commands: this.commandRegistry.all() });
        return;
      }

      const sessionMessageIdMatch = pathname.match(/^\/session\/([^/]+)\/message\/([^/]+)$/);
      if (sessionMessageIdMatch && method === 'GET') {
        const id = sessionMessageIdMatch[1]!;
        const messageId = sessionMessageIdMatch[2]!;
        this.handleGetSessionMessageById(id, messageId, res);
        return;
      }

      const sessionMessageMatch = pathname.match(/^\/session\/([^/]+)\/message$/);
      if (sessionMessageMatch) {
        const id = sessionMessageMatch[1]!;
        if (method === 'GET') {
          await this.handleGetSessionMessagesV2(id, url, res);
          return;
        }
        if (method === 'POST') {
          await this.handlePostSessionMessage(id, req, res);
          return;
        }
      }

      const sessionPromptAsyncMatch = pathname.match(/^\/session\/([^/]+)\/prompt_async$/);
      if (sessionPromptAsyncMatch && method === 'POST') {
        const id = sessionPromptAsyncMatch[1]!;
        await this.handlePostSessionPromptAsync(id, req, res);
        return;
      }

      const sessionCommandMatch = pathname.match(/^\/session\/([^/]+)\/command$/);
      if (sessionCommandMatch && method === 'POST') {
        const id = sessionCommandMatch[1]!;
        await this.handlePostSessionCommand(id, req, res);
        return;
      }

      const sessionShellMatch = pathname.match(/^\/session\/([^/]+)\/shell$/);
      if (sessionShellMatch && method === 'POST') {
        const id = sessionShellMatch[1]!;
        await this.handlePostSessionShell(id, req, res);
        return;
      }

      const sessionChildrenMatch = pathname.match(/^\/session\/([^/]+)\/children$/);
      if (sessionChildrenMatch && method === 'GET') {
        const id = sessionChildrenMatch[1]!;
        this.handleGetSessionChildren(id, res);
        return;
      }

      const sessionForkMatch = pathname.match(/^\/session\/([^/]+)\/fork$/);
      if (sessionForkMatch && method === 'POST') {
        const id = sessionForkMatch[1]!;
        await this.handlePostSessionFork(id, req, res);
        return;
      }

      const sessionShareMatch = pathname.match(/^\/session\/([^/]+)\/share$/);
      if (sessionShareMatch) {
        const id = sessionShareMatch[1]!;
        if (method === 'POST') {
          await this.handlePostSessionShare(id, res);
          return;
        }
        if (method === 'DELETE') {
          sendSuccess(res, { unshared: true, id });
          return;
        }
      }

      const sessionDiffMatch = pathname.match(/^\/session\/([^/]+)\/diff$/);
      if (sessionDiffMatch && method === 'GET') {
        const id = sessionDiffMatch[1]!;
        await this.handleGetSessionDiff(id, url, res);
        return;
      }

      const sessionTodoMatch = pathname.match(/^\/session\/([^/]+)\/todo$/);
      if (sessionTodoMatch && method === 'GET') {
        const id = sessionTodoMatch[1]!;
        await this.handleGetSessionTodo(id, res);
        return;
      }

      const sessionInitMatch = pathname.match(/^\/session\/([^/]+)\/init$/);
      if (sessionInitMatch && method === 'POST') {
        const id = sessionInitMatch[1]!;
        await this.handlePostSessionInit(id, res);
        return;
      }

      const sessionSummarizeMatch = pathname.match(/^\/session\/([^/]+)\/summarize$/);
      if (sessionSummarizeMatch && method === 'POST') {
        const id = sessionSummarizeMatch[1]!;
        await this.handlePostSessionSummarize(id, res);
        return;
      }

      const sessionRevertMatch = pathname.match(/^\/session\/([^/]+)\/revert$/);
      if (sessionRevertMatch && method === 'POST') {
        const id = sessionRevertMatch[1]!;
        this.handlePostSessionRevert(id, res);
        return;
      }

      const sessionUnrevertMatch = pathname.match(/^\/session\/([^/]+)\/unrevert$/);
      if (sessionUnrevertMatch && method === 'POST') {
        const id = sessionUnrevertMatch[1]!;
        this.handlePostSessionUnrevert(id, res);
        return;
      }

      const sessionAbortMatch = pathname.match(/^\/session\/([^/]+)\/abort$/);
      if (sessionAbortMatch && method === 'POST') {
        const id = sessionAbortMatch[1]!;
        this.handleAbortSession(id, res);
        return;
      }

      const sessionPermissionMatch = pathname.match(/^\/session\/([^/]+)\/permissions\/([^/]+)$/);
      if (sessionPermissionMatch && method === 'POST') {
        const id = sessionPermissionMatch[1]!;
        const permissionId = sessionPermissionMatch[2]!;
        await this.handlePermissionResponse(id, permissionId, req, res);
        return;
      }

      const sessionIdMatch = pathname.match(/^\/session\/([^/]+)$/);
      if (sessionIdMatch) {
        const id = sessionIdMatch[1]!;
        if (method === 'PATCH') {
          await this.handlePatchSession(id, req, res);
          return;
        }
        if (method === 'GET') {
          this.handleGetSession(id, res);
          return;
        }
        if (method === 'DELETE') {
          this.handleDeleteSession(id, res);
          return;
        }
      }

      if (method === 'GET' && pathname === '/find') {
        await this.handleFindText(url, res);
        return;
      }
      if (method === 'GET' && pathname === '/find/file') {
        await this.handleFindFile(url, res);
        return;
      }
      if (method === 'GET' && pathname === '/find/symbol') {
        await this.handleFindSymbol(url, res);
        return;
      }

      if (method === 'GET' && pathname === '/file') {
        await this.handleListFiles(url, res);
        return;
      }
      if (method === 'GET' && pathname === '/file/content') {
        await this.handleGetFileContent(url, res);
        return;
      }
      if (method === 'GET' && pathname === '/file/status') {
        await this.handleGetFileStatus(res);
        return;
      }

      if (method === 'GET' && pathname === '/lsp') {
        sendSuccess(res, {
          running: this.lspManager.allDiagnostics.length > 0,
          diagnostics: this.lspManager.allDiagnostics,
        });
        return;
      }
      if (method === 'GET' && pathname === '/formatter') {
        const available = await this.formatterEngine.detectAvailableFormatters();
        sendSuccess(res, { formatters: available });
        return;
      }
      if (method === 'GET' && pathname === '/mcp') {
        const mcpTools = await getMcpTools();
        sendSuccess(res, { tools: mcpTools, count: mcpTools.length });
        return;
      }
      if (method === 'POST' && pathname === '/mcp') {
        await this.handlePostMcp(req, res);
        return;
      }

      if (method === 'GET' && pathname === '/agent') {
        sendSuccess(res, { agents: KNOWN_AGENTS });
        return;
      }

      if (method === 'POST' && pathname === '/log') {
        await this.handlePostLog(req, res);
        return;
      }

      if (method === 'GET' && (pathname === '/web' || pathname === '/web/')) {
        serveWebUi(req, res);
        return;
      }

      if (method === 'POST' && pathname === '/tui/append-prompt') {
        await this.handleTuiAppendPrompt(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/tui/show-toast') {
        await this.handleTuiShowToast(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/tui/open-help') {
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: '[OPEN_HELP]' });
        sendSuccess(res, { opened: 'help' });
        return;
      }
      if (method === 'POST' && pathname === '/tui/open-sessions') {
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: '[OPEN_SESSIONS]' });
        sendSuccess(res, { opened: 'sessions' });
        return;
      }
      if (method === 'POST' && pathname === '/tui/open-themes') {
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: '[OPEN_THEMES]' });
        sendSuccess(res, { opened: 'themes' });
        return;
      }
      if (method === 'POST' && pathname === '/tui/open-models') {
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: '[OPEN_MODELS]' });
        sendSuccess(res, { opened: 'models' });
        return;
      }
      if (method === 'POST' && pathname === '/tui/submit-prompt') {
        const body = await parseJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: `[SUBMIT:${text}]` });
        sendSuccess(res, { submitted: true });
        return;
      }
      if (method === 'POST' && pathname === '/tui/clear-prompt') {
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: '[CLEAR_PROMPT]' });
        sendSuccess(res, { cleared: true });
        return;
      }
      if (method === 'POST' && pathname === '/tui/execute-command') {
        const body = await parseJsonBody(req);
        const command = typeof body.command === 'string' ? body.command : '';
        this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: `[EXEC:${command}]` });
        sendSuccess(res, { executed: true, command });
        return;
      }
      if (method === 'GET' && pathname === '/tui/control/next') {
        this.handleTuiControlNext(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/tui/control/response') {
        await this.handleTuiControlResponse(req, res);
        return;
      }

      const authMatch = pathname.match(/^\/auth\/([^/]+)$/);
      if (authMatch && method === 'PUT') {
        const id = authMatch[1]!;
        await this.handlePutAuth(id, req, res);
        return;
      }

      sendError(res, 404, `Not Found: ${method} ${pathname}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, message);
    }
  }

  private handleSse(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const client: SseClient = { id: generateId(), res };
    this.sseClients.add(client);

    req.on('close', () => {
      this.sseClients.delete(client);
    });
  }

  private async handlePatchConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);

    if (typeof body.model === 'string') this.configData.model = body.model;
    if (typeof body.provider === 'string') this.configData.provider = body.provider;
    if (typeof body.maxTurns === 'number') this.configData.maxTurns = body.maxTurns;
    if (body.maxBudgetUsd !== undefined) {
      this.configData.maxBudgetUsd = typeof body.maxBudgetUsd === 'number' ? body.maxBudgetUsd : undefined;
    }
    if (typeof body.mode === 'string') this.configData.mode = body.mode;
    if (typeof body.theme === 'string') this.configData.theme = body.theme;
    if (typeof body.allowOutsideRoot === 'boolean') this.configData.allowOutsideRoot = body.allowOutsideRoot;
    if (body.temperature !== undefined) {
      this.configData.temperature = typeof body.temperature === 'number' ? body.temperature : undefined;
    }

    sendSuccess(res, { ...this.configData });
  }

  private handleListProjects(res: ServerResponse): void {
    const root = this.configData.projectRoot;
    const projects: Array<{ name: string; path: string }> = [];
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const projectPath = resolve(root, entry.name);
          if (existsSync(join(projectPath, 'package.json')) ||
              existsSync(join(projectPath, 'Cargo.toml')) ||
              existsSync(join(projectPath, 'go.mod')) ||
              existsSync(join(projectPath, 'pyproject.toml'))) {
            projects.push({ name: entry.name, path: projectPath });
          }
        }
      }
    } catch {
      // ignore
    }
    sendSuccess(res, { projects, current: basename(root) });
  }

  private handleSessionStatus(res: ServerResponse): void {
    const statusMap: Record<string, { active: boolean; aborted: boolean; messageCount: number; createdAt: string }> = {};
    for (const [id, s] of this.sessions) {
      statusMap[id] = {
        active: true,
        aborted: s.aborted,
        messageCount: s.messages.length,
        createdAt: s.createdAt.toISOString(),
      };
    }
    sendSuccess(res, { sessions: statusMap });
  }

  private async handleListSessionsV2(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const limit = parseInt(query.limit ?? '', 10) || 0;
    const format = query.format || 'json';

    const saved = listSessions(this.configData.projectRoot);
    const active = Array.from(this.sessions.keys()).map((id) => {
      const s = this.sessions.get(id)!;
      return { id, title: s.title, createdAt: s.createdAt.toISOString(), messageCount: s.messages.length, aborted: s.aborted, active: true };
    });

    let result: Array<Record<string, unknown>> = [
      ...active,
      ...saved.map((s) => ({ ...s, active: false })),
    ];

    if (limit > 0) result = result.slice(0, limit);
    if (format === 'minimal') result = result.map((s) => ({ id: s.id, title: s.title, active: s.active }));

    sendSuccess(res, { sessions: result, total: result.length });
  }

  private async handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const id = (typeof body.id === 'string' && body.id) || generateId();
    const title = typeof body.title === 'string' ? body.title : undefined;
    const parentId = typeof body.parentId === 'string' ? body.parentId : undefined;

    let provider: Provider;
    try {
      provider = await createProvider(this.configData.provider, this.configData.model);
    } catch (err) {
      sendError(res, 500, `Failed to create provider: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const session: Session = {
      id,
      history: [],
      startTime: new Date(),
      tokenCounts: { input: 0, output: 0, cached: 0 },
      cost: 0,
    };

    const turnConfig: TurnConfig = {
      maxTurns: typeof body.maxTurns === 'number' ? body.maxTurns : this.configData.maxTurns,
      maxBudgetUsd: this.configData.maxBudgetUsd,
      timeoutMs: 120_000,
    };

    const serverSession: ServerSession = {
      session,
      provider,
      config: turnConfig,
      messages: [],
      createdAt: new Date(),
      aborted: false,
      title,
      parentId,
      childIds: [],
      revertedMessages: [],
    };

    if (parentId) {
      const parent = this.sessions.get(parentId);
      if (parent) parent.childIds.push(id);
    }

    this.sessions.set(id, serverSession);
    this.eventBus.emit({ type: 'turn_start', turnId: id, config: turnConfig });

    sendSuccess(res, { id, title, createdAt: serverSession.createdAt.toISOString(), parentId });
  }

  private handleGetSession(id: string, res: ServerResponse): void {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      const saved = loadSession(this.configData.projectRoot, id);
      if (saved) {
        sendSuccess(res, { ...saved, active: false });
        return;
      }
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    sendSuccess(res, {
      id: serverSession.session.id,
      title: serverSession.title,
      createdAt: serverSession.createdAt.toISOString(),
      messages: serverSession.messages,
      startTime: serverSession.session.startTime.toISOString(),
      tokenCounts: serverSession.session.tokenCounts,
      cost: serverSession.session.cost,
      aborted: serverSession.aborted,
      parentId: serverSession.parentId,
      childIds: serverSession.childIds,
    });
  }

  private async handlePatchSession(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const body = await parseJsonBody(req);
    if (typeof body.title === 'string') serverSession.title = body.title;

    sendSuccess(res, { id, title: serverSession.title });
  }

  private handleDeleteSession(id: string, res: ServerResponse): void {
    const removed = removeSession(this.configData.projectRoot, id);
    const activeRemoved = this.sessions.delete(id);
    this.abortControllers.get(id)?.abort();
    this.abortControllers.delete(id);

    if (removed || activeRemoved) {
      sendSuccess(res, { deleted: true });
    } else {
      sendError(res, 404, `Session not found: ${id}`);
    }
  }

  private handleAbortSession(id: string, res: ServerResponse): void {
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    const serverSession = this.sessions.get(id);
    if (serverSession) serverSession.aborted = true;

    this.eventBus.emit({ type: 'turn_end', turnId: id });

    sendSuccess(res, { aborted: true });
  }

  private handleGetSessionChildren(id: string, res: ServerResponse): void {
    const parent = this.sessions.get(id);
    if (!parent) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const children = parent.childIds
      .map((cid) => {
        const s = this.sessions.get(cid);
        if (!s) return null;
        return { id: cid, title: s.title, createdAt: s.createdAt.toISOString(), messageCount: s.messages.length, aborted: s.aborted };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    sendSuccess(res, { parentId: id, children });
  }

  private async handlePostSessionFork(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parent = this.sessions.get(id);
    if (!parent) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const body = await parseJsonBody(req);
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const forkId = generateId();
    const title = typeof body.title === 'string' ? body.title : `Fork of ${id}`;

    let provider: Provider;
    try {
      provider = await createProvider(this.configData.provider, this.configData.model);
    } catch (err) {
      sendError(res, 500, `Failed to create provider: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    let forkIndex = parent.messages.length;
    if (messageId) {
      const idx = parent.messages.findIndex((_, i) => i.toString() === messageId);
      if (idx >= 0) forkIndex = idx + 1;
    }

    const forkedMessages = parent.messages.slice(0, forkIndex);
    const history = forkedMessages.map((m) => ({
      role: m.role, content: m.content, tool_call_id: m.tool_call_id, name: m.name, tool_calls: m.tool_calls,
    }));

    const session: Session = {
      id: forkId,
      history: history as Session['history'],
      startTime: new Date(),
      tokenCounts: { input: 0, output: 0, cached: 0 },
      cost: 0,
    };

    const turnConfig: TurnConfig = {
      maxTurns: this.configData.maxTurns,
      maxBudgetUsd: this.configData.maxBudgetUsd,
      timeoutMs: 120_000,
    };

    const forkSession: ServerSession = {
      session, provider, config: turnConfig, messages: [...forkedMessages],
      createdAt: new Date(), aborted: false, title, parentId: id, childIds: [], revertedMessages: [],
    };

    parent.childIds.push(forkId);
    this.sessions.set(forkId, forkSession);
    this.eventBus.emit({ type: 'turn_start', turnId: forkId, config: turnConfig });

    sendSuccess(res, { id: forkId, title, parentId: id, messageCount: forkedMessages.length });
  }

  private async handlePostSessionShare(id: string, res: ServerResponse): Promise<void> {
    try {
      const result = await shareSession(id, this.configData.projectRoot);
      sendSuccess(res, { url: result.url, id });
    } catch (err) {
      const serverSession = this.sessions.get(id);
      if (serverSession) {
        const json = JSON.stringify({
          version: 1,
          createdAt: new Date().toISOString(),
          session: {
            id,
            startTime: serverSession.session.startTime.toISOString(),
            endTime: new Date().toISOString(),
            tokenCounts: serverSession.session.tokenCounts,
            cost: serverSession.session.cost,
            model: this.configData.model,
            mode: this.configData.mode,
            history: serverSession.session.history,
          },
        }, null, 2);
        sendSuccess(res, { url: `sentinel://share/${id.slice(0, 8)}`, json, id });
      } else {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private async handleGetSessionDiff(id: string, url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const messageId = query.messageId || '';

    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    let diffOutput = '';
    try {
      diffOutput = spawnSync('git', ['diff', '--no-color'], {
        cwd: this.configData.projectRoot, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe',
      }).stdout?.trim() ?? '';
    } catch {
      diffOutput = '';
    }

    const files: string[] = [];
    if (diffOutput) {
      for (const line of diffOutput.split('\n')) {
        const match = line.match(/^diff --git a\/(.+?) b\//);
        if (match) files.push(match[1]!);
      }
    }

    sendSuccess(res, { sessionId: id, messageId: messageId || undefined, diff: diffOutput, files: [...new Set(files)], fileCount: new Set(files).size });
  }

  private async handleGetSessionTodo(id: string, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const todoPath = resolve(this.configData.projectRoot, 'TODO.md');
    let todoContent = '';
    try {
      todoContent = readFileSync(todoPath, 'utf-8');
    } catch {
      todoContent = '# TODO\n\nNo TODO.md found in project root.\n';
    }

    sendSuccess(res, { sessionId: id, todo: todoContent });
  }

  private async handlePostSessionInit(id: string, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    try {
      const agentsPath = await initAgentsMd(this.configData.projectRoot);
      const analysis = await analyzeRepo(this.configData.projectRoot);
      sendSuccess(res, { sessionId: id, agentsPath, analysis });
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err));
    }
  }

  private async handlePostSessionSummarize(id: string, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const msgCount = serverSession.messages.length;
    const userCount = serverSession.messages.filter((m) => m.role === 'user').length;
    const assistantCount = serverSession.messages.filter((m) => m.role === 'assistant').length;

    const summary = `Session ${id}: ${msgCount} messages (${userCount} user, ${assistantCount} assistant). ` +
      `Created ${serverSession.createdAt.toISOString()}. ` +
      `Tokens: ${serverSession.session.tokenCounts.input} in / ${serverSession.session.tokenCounts.output} out. ` +
      `Status: ${serverSession.aborted ? 'Aborted' : 'Active'}.`;

    sendSuccess(res, { sessionId: id, summary, messageCount: msgCount });
  }

  private handlePostSessionRevert(id: string, res: ServerResponse): void {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    if (serverSession.messages.length < 2) {
      sendError(res, 400, 'No messages to revert');
      return;
    }

    const lastAssistant = serverSession.messages.length - 1;
    const removed = serverSession.messages.splice(lastAssistant);
    serverSession.revertedMessages.push(removed);

    sendSuccess(res, { reverted: true, revertedCount: removed.length, remainingCount: serverSession.messages.length });
  }

  private handlePostSessionUnrevert(id: string, res: ServerResponse): void {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    if (serverSession.revertedMessages.length === 0) {
      sendError(res, 400, 'No reverted messages to restore');
      return;
    }

    const restored = serverSession.revertedMessages.pop()!;
    serverSession.messages.push(...restored);

    sendSuccess(res, { unreverted: true, restoredCount: restored.length, totalCount: serverSession.messages.length });
  }

  private async handleGetSessionMessagesV2(id: string, url: URL, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const query = parseQuery(url);
    const limit = parseInt(query.limit ?? '', 10) || 0;
    let messages = serverSession.messages;
    if (limit > 0) messages = messages.slice(-limit);

    sendSuccess(res, { messages, total: serverSession.messages.length, limit: limit || undefined });
  }

  private handleGetSessionMessageById(id: string, messageId: string, res: ServerResponse): void {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const idx = parseInt(messageId, 10);
    if (isNaN(idx) || idx < 0 || idx >= serverSession.messages.length) {
      sendError(res, 404, `Message not found: ${messageId}`);
      return;
    }

    sendSuccess(res, { message: serverSession.messages[idx]!, index: idx, sessionId: id });
  }

  private async handlePostSessionMessage(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    if (serverSession.aborted) {
      sendError(res, 410, 'Session was aborted');
      return;
    }

    const body = await parseJsonBody(req);
    const text = typeof body.message === 'string' ? body.message : '';
    if (!text) {
      sendError(res, 400, 'message is required');
      return;
    }

    const providerMessage: ProviderMessage = { role: 'user', content: text };
    serverSession.messages.push(providerMessage);

    const abortController = new AbortController();
    this.abortControllers.set(id, abortController);

    try {
      const collectedEvents: SentinelEvent[] = [];
      const contentParts: string[] = [];

      for await (const event of runTurn({
        turnId: id,
        config: serverSession.config,
        systemPrompt: 'You are Sentinel, an AI coding assistant.',
        history: serverSession.session.history as ProviderMessage[],
        tools: this.tools,
        provider: serverSession.provider,
        gate: new InteractiveGate(
          (e) => this.eventBus.emit(e),
          this.eventBus,
        ),
        signal: abortController.signal,
        onEvent: (e) => {
          collectedEvents.push(e);
          if (e.type === 'text_delta') contentParts.push(e.delta);
        },
      })) {
        collectedEvents.push(event);
        if (event.type === 'text_delta') contentParts.push(event.delta);
        this.eventBus.emit(event);
      }

      const responseText = contentParts.join('');
      const assistantMessage: ProviderMessage = { role: 'assistant', content: responseText };
      serverSession.messages.push(assistantMessage);

      serverSession.session.tokenCounts.input += estimateTokens(text);
      serverSession.session.tokenCounts.output += estimateTokens(responseText);

      saveSession(this.configData.projectRoot, serverSession.session, {
        projectRoot: this.configData.projectRoot,
        allowOutsideRoot: this.configData.allowOutsideRoot,
        mode: this.configData.mode,
        model: this.configData.model,
      });

      sendSuccess(res, { response: responseText, turnId: id, events: collectedEvents });
    } catch (err) {
      if (abortController.signal.aborted) {
        sendSuccess(res, { response: '[Aborted]', turnId: id, aborted: true });
      } else {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.abortControllers.delete(id);
    }
  }

  private async handlePostSessionPromptAsync(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const body = await parseJsonBody(req);
    const text = typeof body.message === 'string' ? body.message : '';
    if (!text) {
      sendError(res, 400, 'message is required');
      return;
    }

    serverSession.messages.push({ role: 'user', content: text });
    res.writeHead(204);
    res.end();
  }

  private async handlePostSessionCommand(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const body = await parseJsonBody(req);
    const command = typeof body.command === 'string' ? body.command : '';
    if (!command) {
      sendError(res, 400, 'command is required');
      return;
    }

    try {
      const { stdout, stderr, exitCode } = await runCmd('sh', ['-c', command], this.configData.projectRoot, 30_000);
      const output = stdout || stderr || '(no output)';

      serverSession.messages.push({ role: 'user', content: `/${command}` });
      serverSession.messages.push({ role: 'assistant', content: output });

      sendSuccess(res, { output, command, exitCode });
    } catch (err) {
      const errorOutput = err instanceof Error ? err.message : String(err);
      sendSuccess(res, { output: errorOutput, command, error: true });
    }
  }

  private async handlePostSessionShell(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const serverSession = this.sessions.get(id);
    if (!serverSession) {
      sendError(res, 404, `Session not found: ${id}`);
      return;
    }

    const body = await parseJsonBody(req);
    const cmd = typeof body.command === 'string' ? body.command : '';
    if (!cmd) {
      sendError(res, 400, 'command is required');
      return;
    }

    try {
      const { stdout, stderr, exitCode } = await runCmd('sh', ['-c', cmd], this.configData.projectRoot, 30_000);

      sendSuccess(res, { stdout, stderr, exitCode, command: cmd });
    } catch (err) {
      const error = err as Error;
      sendSuccess(res, {
        stdout: '',
        stderr: error.message || String(err),
        exitCode: 1,
        command: cmd,
      });
    }
  }

  private async handlePermissionResponse(_id: string, permissionId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const response = body.response === 'approved' ? 'approved' as const : 'denied' as const;
    const remember = body.remember === true;

    this.eventBus.emit({ type: 'permission_response', turnId: permissionId, response });

    sendSuccess(res, { responded: true, permissionId, response, remember });
  }

  private async handleProviderOAuthAuthorize(providerId: string, res: ServerResponse): Promise<void> {
    const oauthProvider = builtInOAuthProviders.find((p) => p.name === providerId || p.name === providerId.replace('-', ' '));
    if (!oauthProvider) {
      sendError(res, 404, `OAuth provider not found: ${providerId}`);
      return;
    }

    try {
      const manager = new OAuthManager();
      const token = await manager.authorize(oauthProvider.oauthConfig);
      await manager.saveToken(providerId, token);
      sendSuccess(res, { authorized: true, provider: providerId });
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err));
    }
  }

  private async handleProviderOAuthCallback(providerId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const code = typeof body.code === 'string' ? body.code : '';
    if (!code) {
      sendError(res, 400, 'code is required');
      return;
    }

    sendSuccess(res, { provider: providerId, callback: true, code: `${code.slice(0, 8)}...` });
  }

  private async handleFindText(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const pattern = query.pattern || '';
    const searchPathInput = query.path || this.configData.projectRoot;
    const include = query.include || '';
    const maxResults = parseInt(query.maxResults ?? '', 10) || 50;

    if (!pattern) {
      sendError(res, 400, 'pattern query parameter is required');
      return;
    }

    const searchPath = resolve(searchPathInput);
    if (!isPathWithinRoot(searchPath, this.configData.projectRoot)) {
      sendError(res, 403, 'Path outside project root');
      return;
    }

    const results: Array<{ file: string; line: number; content: string }> = [];
    try {
      const args = ['-rn', '--max-count=1', '-m', String(maxResults)];
      if (include) args.push('--include=' + include);
      args.push('--', pattern, searchPath);
      const { stdout, exitCode } = await runCmd('grep', args, this.configData.projectRoot, 15_000);
      if ((exitCode === 0 || exitCode === 1) && stdout) {
        const lines = stdout.trim().split('\n').slice(0, maxResults);
        for (const line of lines) {
          const sepIdx = line.indexOf(':');
          if (sepIdx === -1) continue;
          const rest = line.slice(sepIdx + 1);
          const restSepIdx = rest.indexOf(':');
          if (restSepIdx === -1) continue;
          results.push({ file: line.slice(0, sepIdx), line: parseInt(rest.slice(0, restSepIdx), 10), content: rest.slice(restSepIdx + 1).trim() });
        }
      }
    } catch {
      // no results
    }

    sendSuccess(res, { results, total: results.length, pattern });
  }

  private async handleFindFile(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const q = query.query || query.q || '';
    const type = query.type || '';
    const limit = parseInt(query.limit ?? '', 10) || 50;
    const dirInput = query.directory || this.configData.projectRoot;

    if (!q) {
      sendError(res, 400, 'query parameter is required');
      return;
    }

    const dir = resolve(dirInput);
    if (!isPathWithinRoot(dir, this.configData.projectRoot)) {
      sendError(res, 403, 'Path outside project root');
      return;
    }

    const results: string[] = [];
    try {
      const args = [dir, '-maxdepth', '5', '-iname', `*${q}*`];
      if (type === 'file') args.push('-type', 'f');
      else if (type === 'directory') args.push('-type', 'd');
      const { stdout, exitCode } = await runCmd('find', args, this.configData.projectRoot, 15_000);
      if (exitCode === 0 && stdout) {
        const lines = stdout.trim().split('\n').filter(Boolean).slice(0, limit);
        results.push(...lines);
      }
    } catch {
      // no results
    }

    sendSuccess(res, { results, total: results.length, query: q });
  }

  private async handleFindSymbol(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const q = query.query || query.q || '';

    if (!q) {
      sendError(res, 400, 'query parameter is required');
      return;
    }

    const symbols: Array<{ name: string; file: string; line: number; kind: string }> = [];
    try {
      const grepPattern = `^\\s*(export\\s+)?(async\\s+)?(function|class|interface|type|const)\\s+${q}`;
      const srcDir = resolve(this.configData.projectRoot, 'src');
      if (!isPathWithinRoot(srcDir, this.configData.projectRoot)) {
        sendSuccess(res, { symbols, total: 0, query: q });
        return;
      }
      const { stdout, exitCode } = await runCmd('grep', ['-rn', '--', grepPattern, srcDir], this.configData.projectRoot, 15_000);
      if ((exitCode === 0 || exitCode === 1) && stdout) {
        const lines = stdout.trim().split('\n').slice(0, 50);
        for (const line of lines) {
          const parts = line.split(':');
          if (parts.length >= 3) {
            symbols.push({ name: q, file: parts[0]!, line: parseInt(parts[1]!, 10), kind: 'symbol' });
          }
        }
      }
    } catch {
      // no results
    }

    sendSuccess(res, { symbols, total: symbols.length, query: q });
  }

  private async handleListFiles(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const dirInput = query.path || this.configData.projectRoot;
    const dirPath = resolve(dirInput);
    if (!isPathWithinRoot(dirPath, this.configData.projectRoot)) {
      sendError(res, 403, 'Path outside project root');
      return;
    }

    let entries: FileNode[] = [];
    try {
      const dirEntries = readdirSync(dirPath, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          const fullPath = resolve(dirPath, e.name);
          const node: FileNode = { name: e.name, path: fullPath, type: e.isDirectory() ? 'directory' : 'file' };
          if (!e.isDirectory()) {
            try {
              const stat = statSync(fullPath);
              node.size = stat.size;
              node.mtime = stat.mtime.toISOString();
            } catch { /* ignore */ }
          }
          return node;
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch (err) {
      sendError(res, 404, `Cannot list directory: ${dirPath}`);
      return;
    }

    sendSuccess(res, { path: dirPath, entries, total: entries.length });
  }

  private async handleGetFileContent(url: URL, res: ServerResponse): Promise<void> {
    const query = parseQuery(url);
    const fileInput = query.path || '';

    if (!fileInput) {
      sendError(res, 400, 'path query parameter is required');
      return;
    }

    const filePath = resolve(fileInput);
    if (!isPathWithinRoot(filePath, this.configData.projectRoot)) {
      sendError(res, 403, 'Path outside project root');
      return;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const stat = statSync(filePath);
      sendSuccess(res, { path: filePath, content, size: stat.size, mtime: stat.mtime.toISOString(), language: extname(filePath).replace('.', '') || undefined });
    } catch (err) {
      sendError(res, 404, `Cannot read file`);
    }
  }

  private async handleGetFileStatus(res: ServerResponse): Promise<void> {
    try {
      const output = spawnSync('git', ['status', '--porcelain'], {
        cwd: this.configData.projectRoot, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe',
      }).stdout?.trim() ?? '';

      const files: Array<{ path: string; status: string }> = [];
      if (output) {
        for (const line of output.split('\n')) {
          const status = line.slice(0, 2).trim();
          files.push({ path: line.slice(3), status: status || 'M' });
        }
      }

      sendSuccess(res, { clean: files.length === 0, files, total: files.length });
    } catch {
      sendSuccess(res, { clean: true, files: [], total: 0 });
    }
  }

  private async handlePostMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const name = typeof body.name === 'string' ? body.name : '';
    const config = body.config || {};

    if (!name) {
      sendError(res, 400, 'name is required');
      return;
    }

    const mcpTools = await getMcpTools();
    sendSuccess(res, { added: true, name, config, totalTools: mcpTools.length });
  }

  private async handlePostLog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const service = typeof body.service === 'string' ? body.service : 'unknown';
    const level = typeof body.level === 'string' ? body.level : 'info';
    const message = typeof body.message === 'string' ? body.message : '';
    const extra = typeof body.extra === 'object' && body.extra !== null ? body.extra as Record<string, unknown> : undefined;

    writeServerLog({ service, level, message, extra });
    sendSuccess(res, { logged: true });
  }

  private async handleTuiAppendPrompt(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const text = typeof body.text === 'string' ? body.text : '';

    this.eventBus.emit({ type: 'text_delta', turnId: 'tui', delta: text });

    sendSuccess(res, { appended: true });
  }

  private async handleTuiShowToast(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const message = typeof body.message === 'string' ? body.message : '';
    const type = typeof body.type === 'string' ? body.type : 'info';

    sendSuccess(res, { shown: true, message, type });
  }

  private handleTuiControlNext(req: IncomingMessage, res: ServerResponse): void {
    const timeout = setTimeout(() => {
      const idx = this.controlQueue.findIndex((p) => p.resolve === resolver);
      if (idx >= 0) this.controlQueue.splice(idx, 1);
      sendSuccess(res, { timeout: true });
    }, 60_000);

    const resolver = (value: ControlRequest) => {
      clearTimeout(timeout);
      sendSuccess(res, value);
    };

    this.controlQueue.push({
      resolve: resolver,
      reject: (err) => { clearTimeout(timeout); sendError(res, 500, err.message); },
    });

    req.on('close', () => {
      clearTimeout(timeout);
      const idx = this.controlQueue.findIndex((p) => p.resolve === resolver);
      if (idx >= 0) this.controlQueue.splice(idx, 1);
    });
  }

  private async handleTuiControlResponse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const controlRequest: ControlRequest = {
      id: generateId(),
      type: typeof body.type === 'string' ? body.type : 'unknown',
      data: (typeof body.data === 'object' && body.data !== null ? body.data : {}) as Record<string, unknown>,
      timestamp: Date.now(),
    };

    const pending = this.controlQueue.shift();
    if (pending) pending.resolve(controlRequest);

    sendSuccess(res, { received: true, id: controlRequest.id });
  }

  private async handlePutAuth(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseJsonBody(req);
    const credentials = body;

    const dir = getAuthConfigDir();
    mkdirSync(dir, { recursive: true });

    let authData: Record<string, unknown> = {};
    const authPath = getAuthPath(id);
    try {
      authData = JSON.parse(readFileSync(authPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // start fresh
    }

    authData[id] = { ...(authData[id] as Record<string, unknown> ?? {}), ...credentials, updatedAt: new Date().toISOString() };
    writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf-8');

    sendSuccess(res, { stored: true, id });
  }

  private getDocHtml(): string {
    const p = (key: string, val: Record<string, unknown>): void => { paths[key] = val; };
    const paths: Record<string, unknown> = {};
    p('/health', { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } });
    p('/global/health', { get: { summary: 'Global health check', responses: { '200': { description: 'OK' } } } });
    p('/global/event', { get: { summary: 'Global SSE event stream', responses: { '200': { description: 'Event stream' } } } });
    p('/config', { get: { summary: 'Get config', responses: { '200': { description: 'Config' } } }, patch: { summary: 'Update config', responses: { '200': { description: 'Updated' } } } });
    p('/config/providers', { get: { summary: 'List providers', responses: { '200': { description: 'Providers' } } } });
    p('/provider', { get: { summary: 'List all providers', responses: { '200': { description: 'List' } } } });
    p('/provider/auth', { get: { summary: 'Auth methods', responses: { '200': { description: 'Methods' } } } });
    p('/project', { get: { summary: 'List projects', responses: { '200': { description: 'Projects' } } } });
    p('/project/current', { get: { summary: 'Current project', responses: { '200': { description: 'Project' } } } });
    p('/path', { get: { summary: 'Path info', responses: { '200': { description: 'Path' } } } });
    p('/vcs', { get: { summary: 'VCS info', responses: { '200': { description: 'VCS' } } } });
    p('/instance/dispose', { post: { summary: 'Shutdown server', responses: { '200': { description: 'Disposed' } } } });
    p('/session', { get: { summary: 'List sessions', responses: { '200': { description: 'Sessions' } } }, post: { summary: 'Create session', responses: { '200': { description: 'Created' } } } });
    p('/session/status', { get: { summary: 'Session status map', responses: { '200': { description: 'Status' } } } });
    p('/session/{id}', { get: { summary: 'Get session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Session' } } }, patch: { summary: 'Update session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } }, 'delete': { summary: 'Delete session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } });
    p('/session/{id}/message', { get: { summary: 'List messages', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Messages' } } }, post: { summary: 'Send message', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Response' } } } });
    p('/session/{id}/message/{messageID}', { get: { summary: 'Get message', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'messageID', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Message' } } } });
    p('/session/{id}/children', { get: { summary: 'Child sessions', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Children' } } } });
    p('/session/{id}/fork', { post: { summary: 'Fork session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Forked' } } } });
    p('/session/{id}/share', { post: { summary: 'Share session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Shared' } } }, 'delete': { summary: 'Unshare', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Unshared' } } } });
    p('/session/{id}/diff', { get: { summary: 'File diffs', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Diffs' } } } });
    p('/session/{id}/todo', { get: { summary: 'Todo list', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Todo' } } } });
    p('/session/{id}/init', { post: { summary: 'Analyze and create AGENTS.md', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Initialized' } } } });
    p('/session/{id}/summarize', { post: { summary: 'Summarize session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Summary' } } } });
    p('/session/{id}/revert', { post: { summary: 'Revert message', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Reverted' } } } });
    p('/session/{id}/unrevert', { post: { summary: 'Restore reverted', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Unreverted' } } } });
    p('/session/{id}/abort', { post: { summary: 'Abort session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Aborted' } } } });
    p('/session/{id}/permissions/{permissionID}', { post: { summary: 'Respond to permission', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'permissionID', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Responded' } } } });
    p('/session/{id}/prompt_async', { post: { summary: 'Send async message', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Accepted' } } } });
    p('/session/{id}/command', { post: { summary: 'Execute command', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Output' } } } });
    p('/session/{id}/shell', { post: { summary: 'Run shell command', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Output' } } } });
    p('/command', { get: { summary: 'List commands', responses: { '200': { description: 'Commands' } } } });
    p('/find', { get: { summary: 'Search text', responses: { '200': { description: 'Results' } } } });
    p('/find/file', { get: { summary: 'Find files', responses: { '200': { description: 'Files' } } } });
    p('/find/symbol', { get: { summary: 'Find symbols', responses: { '200': { description: 'Symbols' } } } });
    p('/file', { get: { summary: 'List directory', responses: { '200': { description: 'Entries' } } } });
    p('/file/content', { get: { summary: 'Read file', responses: { '200': { description: 'Content' } } } });
    p('/file/status', { get: { summary: 'Git status', responses: { '200': { description: 'Status' } } } });
    p('/lsp', { get: { summary: 'LSP status', responses: { '200': { description: 'Status' } } } });
    p('/formatter', { get: { summary: 'Formatter status', responses: { '200': { description: 'Status' } } } });
    p('/mcp', { get: { summary: 'MCP status', responses: { '200': { description: 'Status' } } }, post: { summary: 'Add MCP server', responses: { '200': { description: 'Added' } } } });
    p('/agent', { get: { summary: 'List agents', responses: { '200': { description: 'Agents' } } } });
    p('/log', { post: { summary: 'Write log', responses: { '200': { description: 'Logged' } } } });
    p('/tui/append-prompt', { post: { summary: 'Append prompt', responses: { '200': { description: 'Done' } } } });
    p('/tui/show-toast', { post: { summary: 'Show toast', responses: { '200': { description: 'Shown' } } } });
    p('/auth/{id}', { put: { summary: 'Set credentials', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Stored' } } } });
    p('/event', { get: { summary: 'SSE stream', responses: { '200': { description: 'Stream' } } } });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sentinel Server - OpenAPI 3.1</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Sentinel Server API</h1>
  <p>OpenAPI 3.1 specification for the Sentinel HTTP server.</p>
  <pre>${JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Sentinel Server', version: '0.1.0', description: 'HTTP server for Sentinel CLI' },
      servers: [{ url: this.url }],
      paths,
    }, null, 2)}</pre>
</body>
</html>`;
  }
}

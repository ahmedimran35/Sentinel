import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SavedSession } from './session-store.js';
import { loadSession, listSessions } from './session-store.js';

export interface CloudSyncConfig {
  enabled: boolean;
  serverUrl: string;
  apiKey?: string;
  autoSync: boolean;
  syncIntervalMs: number;
}

export interface CloudSyncStatus {
  lastSyncAt: string | null;
  pendingUpload: number;
  pendingDownload: number;
  connected: boolean;
  error?: string;
}

const DEFAULTS = {
  serverUrl: 'https://api.sentinel.dev',
  autoSync: true,
  syncIntervalMs: 60_000,
};

export class CloudSyncService {
  private config: CloudSyncConfig;
  private projectRoot: string;
  private token: string | null = null;
  private status: CloudSyncStatus;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(status: CloudSyncStatus) => void> = [];

  constructor(projectRoot: string, config: CloudSyncConfig) {
    this.projectRoot = projectRoot;
    this.config = {
      ...DEFAULTS,
      ...config,
      serverUrl: config.serverUrl || DEFAULTS.serverUrl,
      autoSync: config.autoSync ?? DEFAULTS.autoSync,
      syncIntervalMs: config.syncIntervalMs || DEFAULTS.syncIntervalMs,
    };
    this.status = {
      lastSyncAt: null,
      pendingUpload: 0,
      pendingDownload: 0,
      connected: false,
    };
    if (config.apiKey) {
      this.token = config.apiKey;
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.config.serverUrl.replace(/\/+$/, '')}${path}`;
    const opts: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Cloud sync request failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
    }
    return res;
  }

  async authenticate(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.config.serverUrl.replace(/\/+$/, '')}/api/auth`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        },
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { token: string };
      this.token = data.token;
      this.status.connected = true;
      this.status.error = undefined;
      return true;
    } catch (err) {
      this.status.connected = false;
      this.status.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async uploadSession(sessionId: string): Promise<boolean> {
    try {
      const session = loadSession(this.projectRoot, sessionId);
      if (!session) return false;
      await this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}`, session);
      return true;
    } catch (err) {
      this.status.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async downloadSession(sessionId: string): Promise<boolean> {
    try {
      const res = await this.request('GET', `/api/sessions/${encodeURIComponent(sessionId)}`);
      const session = (await res.json()) as SavedSession;
      const dir = resolve(this.projectRoot, '.sentinel', 'sessions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `${session.id}.json`), JSON.stringify(session, null, 2), 'utf-8');
      return true;
    } catch (err) {
      this.status.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async listRemoteSessions(): Promise<string[]> {
    const res = await this.request('GET', '/api/sessions');
    const data = (await res.json()) as { sessions: string[] };
    return data.sessions;
  }

  async syncAll(): Promise<{ uploaded: number; downloaded: number }> {
    const result = { uploaded: 0, downloaded: 0 };
    try {
      const local = listSessions(this.projectRoot);
      const localIds = new Set(local.map((s) => s.id));
      const remoteIds = await this.listRemoteSessions();
      const remoteSet = new Set(remoteIds);

      for (const session of local) {
        if (!remoteSet.has(session.id)) {
          const ok = await this.uploadSession(session.id);
          if (ok) result.uploaded++;
        }
      }

      for (const id of remoteIds) {
        if (!localIds.has(id)) {
          const ok = await this.downloadSession(id);
          if (ok) result.downloaded++;
        }
      }

      this.status.lastSyncAt = new Date().toISOString();
      this.status.pendingUpload = 0;
      this.status.pendingDownload = 0;
      this.status.connected = true;
      this.status.error = undefined;
    } catch (err) {
      this.status.error = err instanceof Error ? err.message : String(err);
      this.status.connected = false;
    }
    this.emitStatus();
    return result;
  }

  async mergeRemoteSessions(): Promise<number> {
    const remoteIds = await this.listRemoteSessions();
    let count = 0;
    for (const id of remoteIds) {
      const local = loadSession(this.projectRoot, id);
      if (!local) {
        const ok = await this.downloadSession(id);
        if (ok) count++;
      }
    }
    return count;
  }

  getStatus(): CloudSyncStatus {
    return { ...this.status };
  }

  startAutoSync(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => {
      this.syncAll().catch(() => { /* auto-sync errors are non-fatal; will retry on next interval */ });
    }, this.config.syncIntervalMs);
  }

  stopAutoSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onSync(cb: (status: CloudSyncStatus) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.config.serverUrl.replace(/\/+$/, '')}/api/health`,
        { method: 'GET' },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const cb of this.listeners) {
      try {
        cb(status);
      } catch {
        // ignore listener errors
      }
    }
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudSyncService, type CloudSyncConfig } from './cloud-sync.js';
import * as sessionStore from './session-store.js';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(() => ''),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

const mockSession = {
  id: 'test-session-1',
  startTime: '2024-01-01T00:00:00.000Z',
  endTime: '2024-01-01T01:00:00.000Z',
  tokenCounts: { input: 100, output: 50, cached: 0 },
  cost: 0.005,
  model: 'gpt-4',
  mode: 'code',
  history: [],
};

function mockFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function makeConfig(overrides: Partial<CloudSyncConfig> = {}): CloudSyncConfig {
  return {
    enabled: true,
    serverUrl: 'https://sync.test',
    autoSync: false,
    syncIntervalMs: 60000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CloudSyncService', () => {
  describe('constructor', () => {
    it('sets config defaults', () => {
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      expect(svc).toBeInstanceOf(CloudSyncService);
      expect(svc.getStatus().connected).toBe(false);
    });

    it('stores apiKey from config as token', () => {
      const svc = new CloudSyncService('/tmp/test', makeConfig({ apiKey: 'sk-abc' }));
      expect(svc).toBeInstanceOf(CloudSyncService);
    });
  });

  describe('authenticate', () => {
    it('returns true on success', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ token: 't' }));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.authenticate('sk-valid');
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://sync.test/api/auth',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ apiKey: 'sk-valid' }),
        }),
      );
    });

    it('returns false on failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.authenticate('sk-bad');
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.authenticate('sk-any');
      expect(result).toBe(false);
      expect(svc.getStatus().error).toBe('Network error');
    });
  });

  describe('getStatus', () => {
    it('returns current status', () => {
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const status = svc.getStatus();
      expect(status).toHaveProperty('lastSyncAt');
      expect(status).toHaveProperty('pendingUpload');
      expect(status).toHaveProperty('pendingDownload');
      expect(status).toHaveProperty('connected');
    });
  });

  describe('syncAll', () => {
    it('uploads local sessions not on remote and downloads missing remote ones', async () => {
      vi.spyOn(sessionStore, 'listSessions').mockReturnValue([mockSession]);
      vi.spyOn(sessionStore, 'loadSession').mockReturnValue(mockSession);

      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse({ sessions: ['remote-1'] }))
        .mockResolvedValueOnce(mockFetchResponse({}))
        .mockResolvedValueOnce(mockFetchResponse(mockSession))
        .mockResolvedValueOnce(mockFetchResponse({}));

      const svc = new CloudSyncService('/tmp/test', makeConfig({ apiKey: 'sk-key' }));
      const result = await svc.syncAll();

      expect(result.uploaded).toBe(1);
      expect(result.downloaded).toBe(1);
      expect(svc.getStatus().lastSyncAt).toBeTruthy();
      expect(svc.getStatus().connected).toBe(true);
    });

    it('handles sync failure gracefully', async () => {
      vi.spyOn(sessionStore, 'listSessions').mockReturnValue([]);
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Server unreachable'));

      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.syncAll();

      expect(result.uploaded).toBe(0);
      expect(result.downloaded).toBe(0);
      expect(svc.getStatus().connected).toBe(false);
      expect(svc.getStatus().error).toBeTruthy();
    });
  });

  describe('ping', () => {
    it('returns true when server responds', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.ping();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('fail'));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.ping();
      expect(result).toBe(false);
    });
  });

  describe('autoSync', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts and stops interval', () => {
      const svc = new CloudSyncService('/tmp/test', makeConfig({ syncIntervalMs: 1000 }));
      const spy = vi.spyOn(svc, 'syncAll').mockResolvedValue({ uploaded: 0, downloaded: 0 });

      svc.startAutoSync();
      expect(spy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(2);

      svc.stopAutoSync();
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('onSync', () => {
    it('calls listeners when status changes', async () => {
      vi.spyOn(sessionStore, 'listSessions').mockReturnValue([]);
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ sessions: [] }));

      const svc = new CloudSyncService('/tmp/test', makeConfig({ apiKey: 'sk-key' }));
      const listener = vi.fn();
      svc.onSync(listener);

      await svc.syncAll();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
    });

    it('returns unsubscribe function', () => {
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const listener = vi.fn();
      const unsub = svc.onSync(listener);
      expect(svc['listeners']).toContain(listener);
      unsub();
      expect(svc['listeners']).not.toContain(listener);
    });
  });

  describe('uploadSession', () => {
    it('returns false when session not found locally', async () => {
      vi.spyOn(sessionStore, 'loadSession').mockReturnValue(null);
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.uploadSession('nonexistent');
      expect(result).toBe(false);
    });

    it('uploads successfully', async () => {
      vi.spyOn(sessionStore, 'loadSession').mockReturnValue(mockSession);
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({}));

      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.uploadSession('test-session-1');
      expect(result).toBe(true);
    });
  });

  describe('downloadSession', () => {
    it('downloads and saves session', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(mockSession));
      const { writeFileSync } = await import('node:fs');

      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const result = await svc.downloadSession('remote-1');
      expect(result).toBe(true);
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('listRemoteSessions', () => {
    it('returns session id list', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ sessions: ['a', 'b'] }));
      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const ids = await svc.listRemoteSessions();
      expect(ids).toEqual(['a', 'b']);
    });
  });

  describe('mergeRemoteSessions', () => {
    it('downloads remote sessions not in local', async () => {
      vi.spyOn(sessionStore, 'loadSession').mockReturnValue(null);
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse({ sessions: ['r1', 'r2'] }))
        .mockResolvedValueOnce(mockFetchResponse(mockSession))
        .mockResolvedValueOnce(mockFetchResponse(mockSession));

      const svc = new CloudSyncService('/tmp/test', makeConfig());
      const count = await svc.mergeRemoteSessions();
      expect(count).toBe(2);
    });
  });
});

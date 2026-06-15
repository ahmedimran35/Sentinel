import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OAuthManager, type OAuthToken } from './oauth.js';

describe('OAuthManager', () => {
  let tmpDir: string;
  let manager: OAuthManager;
  const realHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-oauth-test-'));
    process.env.HOME = tmpDir;
    manager = new OAuthManager();
  });

  afterEach(async () => {
    process.env.HOME = realHome;
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('isExpired', () => {
    it('returns false when token has no expiration', () => {
      const token: OAuthToken = { accessToken: 'test', tokenType: 'Bearer' };
      expect(manager.isExpired(token)).toBe(false);
    });

    it('returns true when token is expired', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
      };
      expect(manager.isExpired(token)).toBe(true);
    });

    it('returns true when token is within 5 minute buffer', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 4 * 60 * 1000,
      };
      expect(manager.isExpired(token)).toBe(true);
    });

    it('returns false when token is far from expiration', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600 * 1000,
      };
      expect(manager.isExpired(token)).toBe(false);
    });
  });

  describe('getAuthHeaders', () => {
    it('returns Bearer authorization header', () => {
      const token: OAuthToken = { accessToken: 'abc123', tokenType: 'Bearer' };
      const headers = manager.getAuthHeaders(token);
      expect(headers).toEqual({ Authorization: 'Bearer abc123' });
    });

    it('uses custom token type', () => {
      const token: OAuthToken = { accessToken: 'tok', tokenType: 'MAC' };
      const headers = manager.getAuthHeaders(token);
      expect(headers).toEqual({ Authorization: 'MAC tok' });
    });
  });

  describe('save/load/clear token', () => {
    it('saves and loads a token', async () => {
      const token: OAuthToken = {
        accessToken: 'gho_test123',
        tokenType: 'Bearer',
        refreshToken: 'r_test456',
        scope: 'repo',
        expiresAt: Date.now() + 3600 * 1000,
      };

      await manager.saveToken('test-provider', token);
      const loaded = await manager.loadToken('test-provider');

      expect(loaded).not.toBeNull();
      expect(loaded!.accessToken).toBe('gho_test123');
      expect(loaded!.refreshToken).toBe('r_test456');
      expect(loaded!.tokenType).toBe('Bearer');
      expect(loaded!.scope).toBe('repo');
      expect(typeof loaded!.expiresAt).toBe('number');
    });

    it('returns null when no token saved', async () => {
      const loaded = await manager.loadToken('nonexistent');
      expect(loaded).toBeNull();
    });

    it('clears a saved token', async () => {
      const token: OAuthToken = { accessToken: 'tok', tokenType: 'Bearer' };
      await manager.saveToken('clear-test', token);
      expect(await manager.loadToken('clear-test')).not.toBeNull();

      await manager.clearToken('clear-test');
      expect(await manager.loadToken('clear-test')).toBeNull();
    });

    it('clearToken does not throw for missing file', async () => {
      await expect(manager.clearToken('never-saved')).resolves.toBeUndefined();
    });

    it('sets correct file permissions (0600)', async () => {
      const token: OAuthToken = { accessToken: 'perm-test', tokenType: 'Bearer' };
      await manager.saveToken('perm-test', token);

      const configDir = join(tmpDir, '.config', 'sentinel', 'oauth');
      const filePath = join(configDir, 'perm-test.json');

      expect(existsSync(filePath)).toBe(true);

      const stats = statSync(filePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('creates config directory with restricted permissions', async () => {
      const token: OAuthToken = { accessToken: 'dir-test', tokenType: 'Bearer' };
      await manager.saveToken('dir-test', token);

      const configDir = join(tmpDir, '.config', 'sentinel', 'oauth');
      expect(existsSync(configDir)).toBe(true);

      const stats = statSync(configDir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it('overwrites existing token file', async () => {
      const token1: OAuthToken = { accessToken: 'first', tokenType: 'Bearer' };
      const token2: OAuthToken = { accessToken: 'second', tokenType: 'Bearer' };

      await manager.saveToken('overwrite-test', token1);
      await manager.saveToken('overwrite-test', token2);

      const loaded = await manager.loadToken('overwrite-test');
      expect(loaded!.accessToken).toBe('second');
    });
  });
});

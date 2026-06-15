import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  SnapshotManager,
  createSnapshot,
  listSnapshots,
  loadSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  searchSnapshots,
  cleanupSnapshots,
} from './snapshot.js';
import type { Session, Config } from './commands/types.js';

const TEST_DIR = resolve(homedir(), '.config', 'sentinel', 'snapshots');

const mockSession: Session = {
  id: 'test-session-1',
  startTime: new Date('2024-01-15T10:30:00.000Z'),
  tokenCounts: { input: 1500, output: 800, cached: 200 },
  cost: 0.0425,
  history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
};

const mockConfig: Config = {
  projectRoot: '/fake/project',
  allowOutsideRoot: false,
  mode: 'code',
  model: 'gpt-4',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = new SnapshotManager(TEST_DIR);
  });

  describe('createSnapshot', () => {
    it('creates a snapshot and returns an 8-char hex ID', () => {
      const id = manager.createSnapshot(mockSession, mockConfig, { label: 'test-snapshot' });
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      expect(existsSync(resolve(TEST_DIR, `${id}.json`))).toBe(true);
    });

    it('stores snapshot data correctly', () => {
      const id = manager.createSnapshot(mockSession, mockConfig, {
        label: 'my-label',
        tags: ['tag1', 'tag2'],
      });
      const snapshot = manager.loadSnapshot(id)!;
      expect(snapshot.label).toBe('my-label');
      expect(snapshot.tags).toEqual(['tag1', 'tag2']);
      expect(snapshot.session.id).toBe('test-session-1');
      expect(snapshot.config.mode).toBe('code');
      expect(snapshot.tokenCounts.input).toBe(1500);
      expect(snapshot.cost).toBe(0.0425);
      expect(snapshot.projectRoot).toBe('/fake/project');
      expect(snapshot.model).toBe('gpt-4');
      expect(snapshot.mode).toBe('code');
    });

    it('reads files when includeFiles is true', () => {
      const projectDir = resolve(TEST_DIR, '..', 'test-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(resolve(projectDir, 'test.ts'), 'const x = 1;', 'utf-8');
      writeFileSync(resolve(projectDir, 'test.md'), '# Hello', 'utf-8');
      writeFileSync(resolve(projectDir, 'ignored.txt'), 'ignored', 'utf-8');

      const cfg: Config = { ...mockConfig, projectRoot: projectDir };
      const id = manager.createSnapshot(mockSession, cfg, { includeFiles: true });
      const snapshot = manager.loadSnapshot(id)!;

      expect(Object.keys(snapshot.memory.files).length).toBeGreaterThanOrEqual(2);
      const filePaths = Object.keys(snapshot.memory.files);
      expect(filePaths.some((p) => p.endsWith('test.ts'))).toBe(true);
      expect(filePaths.some((p) => p.endsWith('test.md'))).toBe(true);
      expect(filePaths.some((p) => p.endsWith('ignored.txt'))).toBe(false);

      rmSync(projectDir, { recursive: true, force: true });
    });

    it('generates a default label when none is provided', () => {
      const id = manager.createSnapshot(mockSession, mockConfig);
      const snapshot = manager.loadSnapshot(id)!;
      expect(snapshot.label).toBe(`snapshot-${id}`);
    });
  });

  describe('listSnapshots', () => {
    it('returns an empty array when no snapshots exist', () => {
      expect(manager.listSnapshots()).toEqual([]);
    });

    it('returns all snapshots sorted by newest first', async () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'first' });
      await new Promise((r) => setTimeout(r, 5));
      manager.createSnapshot(mockSession, mockConfig, { label: 'second' });
      const list = manager.listSnapshots();
      expect(list).toHaveLength(2);
      expect(list[0]!.label).toBe('second');
      expect(list[1]!.label).toBe('first');
    });

    it('filters by projectRoot', () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'match' });
      const cfg2: Config = { ...mockConfig, projectRoot: '/other/project' };
      manager.createSnapshot(mockSession, cfg2, { label: 'other' });
      const list = manager.listSnapshots('/fake/project');
      expect(list).toHaveLength(1);
      expect(list[0]!.label).toBe('match');
    });
  });

  describe('loadSnapshot', () => {
    it('returns null for missing snapshot', () => {
      expect(manager.loadSnapshot('deadbeef')).toBeNull();
    });

    it('loads a previously created snapshot', () => {
      const id = manager.createSnapshot(mockSession, mockConfig, { label: 'load-me' });
      const snapshot = manager.loadSnapshot(id);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.id).toBe(id);
      expect(snapshot!.label).toBe('load-me');
    });

    it('restores Date fields correctly', () => {
      const id = manager.createSnapshot(mockSession, mockConfig);
      const snapshot = manager.loadSnapshot(id)!;
      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.session.startTime).toBeInstanceOf(Date);
    });
  });

  describe('restoreSnapshot', () => {
    it('returns null for missing snapshot', () => {
      expect(manager.restoreSnapshot('badbadbad')).toBeNull();
    });

    it('returns session and config from a snapshot', () => {
      const id = manager.createSnapshot(mockSession, mockConfig);
      const result = manager.restoreSnapshot(id);
      expect(result).not.toBeNull();
      expect(result!.session.id).toBe('test-session-1');
      expect(result!.config.mode).toBe('code');
      expect(result!.config.projectRoot).toBe('/fake/project');
    });
  });

  describe('deleteSnapshot', () => {
    it('returns false for missing snapshot', () => {
      expect(manager.deleteSnapshot('nope')).toBe(false);
    });

    it('deletes a snapshot and returns true', () => {
      const id = manager.createSnapshot(mockSession, mockConfig);
      expect(manager.deleteSnapshot(id)).toBe(true);
      expect(manager.loadSnapshot(id)).toBeNull();
    });
  });

  describe('searchSnapshots', () => {
    it('searches by label', () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'foobar', tags: [] });
      manager.createSnapshot(mockSession, mockConfig, { label: 'bazqux', tags: [] });
      const results = manager.searchSnapshots('foobar');
      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe('foobar');
    });

    it('searches by tag', () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'tagged', tags: ['alpha', 'beta'] });
      manager.createSnapshot(mockSession, mockConfig, { label: 'plain', tags: [] });
      expect(manager.searchSnapshots('alpha')).toHaveLength(1);
      expect(manager.searchSnapshots('beta')).toHaveLength(1);
    });

    it('searches by project root', () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'root-match' });
      expect(manager.searchSnapshots('fake/project')).toHaveLength(1);
    });

    it('returns empty array when no matches', () => {
      manager.createSnapshot(mockSession, mockConfig, { label: 'hello' });
      expect(manager.searchSnapshots('zzzzz')).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('removes snapshots older than maxAgeDays', () => {
      const id = manager.createSnapshot(mockSession, mockConfig);

      const filePath = resolve(TEST_DIR, `${id}.json`);
      const oldDate = new Date(Date.now() - 60 * 86400000);
      writeFileSync(filePath, JSON.stringify({
        id,
        label: 'old',
        session: mockSession,
        config: mockConfig,
        memory: { files: {}, buffer: '' },
        createdAt: oldDate.toISOString(),
        projectRoot: mockConfig.projectRoot,
        model: mockConfig.model,
        mode: mockConfig.mode,
        tokenCounts: mockSession.tokenCounts,
        cost: mockSession.cost,
        tags: [],
      }), 'utf-8');

      const removed = manager.cleanup(7);
      expect(removed).toBe(1);
      expect(manager.loadSnapshot(id)).toBeNull();
    });
  });
});

describe('module-level functions', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('createSnapshot returns a snapshot ID', async () => {
    const id = await createSnapshot(mockSession, mockConfig);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('listSnapshots returns snapshots', async () => {
    const id = await createSnapshot(mockSession, mockConfig);
    const list = listSnapshots();
    expect(list.some((s) => s.id === id)).toBe(true);
  });

  it('loadSnapshot loads a snapshot', async () => {
    const id = await createSnapshot(mockSession, mockConfig, { label: 'module' });
    const s = loadSnapshot(id);
    expect(s).not.toBeNull();
    expect(s!.label).toBe('module');
  });

  it('restoreSnapshot returns session+config', async () => {
    const id = await createSnapshot(mockSession, mockConfig);
    const result = restoreSnapshot(id);
    expect(result).not.toBeNull();
    expect(result!.session.history).toHaveLength(2);
  });

  it('deleteSnapshot removes a snapshot', async () => {
    const id = await createSnapshot(mockSession, mockConfig);
    expect(deleteSnapshot(id)).toBe(true);
    expect(loadSnapshot(id)).toBeNull();
  });

  it('searchSnapshots filters by label', async () => {
    await createSnapshot(mockSession, mockConfig, { label: 'search-me', tags: [] });
    expect(searchSnapshots('search-me')).toHaveLength(1);
  });

  it('cleanupSnapshots removes old snapshots', async () => {
    const id = await createSnapshot(mockSession, mockConfig);
    const filePath = resolve(TEST_DIR, `${id}.json`);
    const oldDate = new Date(Date.now() - 60 * 86400000);
    writeFileSync(filePath, JSON.stringify({
      id,
      label: 'old',
      session: mockSession,
      config: mockConfig,
      memory: { files: {}, buffer: '' },
      createdAt: oldDate.toISOString(),
      projectRoot: mockConfig.projectRoot,
      model: mockConfig.model,
      mode: mockConfig.mode,
      tokenCounts: mockSession.tokenCounts,
      cost: mockSession.cost,
      tags: [],
    }), 'utf-8');
    expect(cleanupSnapshots(7)).toBe(1);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShadowGit } from './shadow-git.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ShadowGit', () => {
  let tmpDir: string;
  let git: ShadowGit;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-test-'));
    git = new ShadowGit(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes a shadow git repo', async () => {
    await git.init();
    const gitDir = (git as unknown as { gitDir: string }).gitDir;
    expect(fs.existsSync(path.join(gitDir, 'HEAD'))).toBe(true);
  });

  it('creates snapshots and lists them', async () => {
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello', 'utf-8');

    const hash = await git.snapshot([{ path: 'test.txt', content: 'hello' }]);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');

    const checkpoints = await git.listCheckpoints();
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
  });
});

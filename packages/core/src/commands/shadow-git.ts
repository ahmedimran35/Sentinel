import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GIT_LOG_TIMEOUT_MS = 5_000;
const UNIX_TS_MULTIPLIER = 1000;

export class ShadowGit {
  private gitDir: string;
  private workDir: string;
  private initialized = false;

  constructor(projectRoot: string) {
    const hash = simpleHash(projectRoot);
    this.gitDir = path.join(os.tmpdir(), `.sentinel-shadow-${hash}`);
    this.workDir = projectRoot;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!fs.existsSync(this.gitDir)) {
      fs.mkdirSync(this.gitDir, { recursive: true });
      spawnSync('git', ['init', '--bare', this.gitDir], { stdio: 'ignore', timeout: 10_000 });
    }
    // Configure the shadow git worktree
    try {
      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'config', 'user.email', 'sentinel@shadow'], { stdio: 'ignore', timeout: 5_000 });
      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'config', 'user.name', 'sentinel'], { stdio: 'ignore', timeout: 5_000 });
    } catch { /* config may fail on subsequent calls */ }
    this.initialized = true;
  }

  async snapshot(files: Array<{ path: string; content: string }>): Promise<string> {
    await this.init();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
    try {
      for (const f of files) {
        const fullPath = path.join(tmpDir, f.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, f.content, 'utf-8');
      }
      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', tmpDir, 'add', '-A'], { stdio: 'ignore', timeout: 10_000 });
      const result = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', tmpDir, 'commit', '-m', `snapshot ${Date.now()}`], { stdio: 'pipe', timeout: 10_000, encoding: 'utf-8' });
      const match = (result.stdout ?? '').match(/\[[\w-]+ ([a-f0-9]+)\]/);
      return match?.[1] ?? 'unknown';
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async undo(): Promise<Array<{ path: string; content: string }> | null> {
    await this.init();
    try {
      const logResult = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'log', '--oneline', '-2'], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const log = (logResult.stdout ?? '').trim();
      const lines = log.split('\n');
      if (lines.length < 2) return null;

      const currentHash = lines[0]!.split(' ')[0]!;
      const prevHash = lines[1]!.split(' ')[0]!;

      const diffResult = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'diff', '--name-only', prevHash, currentHash], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const diffFiles = (diffResult.stdout ?? '').trim().split('\n').filter(Boolean);

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'checkout', prevHash, '--', '.'], { stdio: 'ignore', timeout: 10_000 });

      return diffFiles.map((p) => ({
        path: p,
        content: fs.readFileSync(path.join(this.workDir, p), 'utf-8'),
      }));
    } catch {
      return null;
    }
  }

  async redo(): Promise<Array<{ path: string; content: string }> | null> {
    // Redo requires a reflog entry — use the next commit after HEAD
    await this.init();
    try {
      const logResult = spawnSync('git', ['--git-dir', this.gitDir, 'reflog', '--oneline', '-2'], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const log = (logResult.stdout ?? '').trim();
      const lines = log.split('\n');
      if (lines.length < 2) return null;

      // reflog entries: hash HEAD@{n}: message
      const reflogMatch = lines[0]!.match(/^([a-f0-9]+)/);
      const currentHash = reflogMatch?.[1];
      const prevRef = lines[1]!.match(/^([a-f0-9]+)/);
      const prevHash = prevRef?.[1];

      if (!currentHash || !prevHash) return null;

      // Get files changed between prev and current
      const diffResult = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'diff', '--name-only', prevHash, currentHash], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const diffFiles = (diffResult.stdout ?? '').trim().split('\n').filter(Boolean);

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'checkout', currentHash, '--', '.'], { stdio: 'ignore', timeout: 10_000 });

      return diffFiles.map((p) => ({
        path: p,
        content: fs.readFileSync(path.join(this.workDir, p), 'utf-8'),
      }));
    } catch {
      return null;
    }
  }

  async listCheckpoints(): Promise<Array<{ id: string; timestamp: Date; fileCount: number }>> {
    await this.init();
    try {
      const logResult = spawnSync('git', ['--git-dir', this.gitDir, 'log', '--format=%H %ct', '--max-count=50'], { stdio: 'pipe', timeout: GIT_LOG_TIMEOUT_MS, encoding: 'utf-8' });
      const log = (logResult.stdout ?? '').trim().split('\n').filter(Boolean);

      const entries: Array<{ id: string; timestamp: Date; fileCount: number }> = [];
      for (const line of log) {
        const [hash, ts] = line.split(' ');
        if (!hash || !ts) continue;
        entries.push({
          id: hash,
          timestamp: new Date(Number(ts) * UNIX_TS_MULTIPLIER),
          fileCount: 0,
        });
      }
      return entries;
    } catch {
      return [];
    }
  }

  async restore(checkpointId: string): Promise<Array<{ path: string; content: string }>> {
    await this.init();
    try {
      const diffResult = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'diff', '--name-only', 'HEAD', checkpointId], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const diffFiles = (diffResult.stdout ?? '').trim().split('\n').filter(Boolean);

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.workDir, 'checkout', checkpointId, '--', '.'], { stdio: 'ignore', timeout: 10_000 });

      return diffFiles.map((p) => ({
        path: p,
        content: fs.readFileSync(path.join(this.workDir, p), 'utf-8'),
      }));
    } catch {
      return [];
    }
  }
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

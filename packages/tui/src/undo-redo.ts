import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface UndoRedoEntry {
  messageIndex: number;
  gitRef: string;
  timestamp: number;
}

export class UndoRedoManager {
  private undoStack: UndoRedoEntry[] = [];
  private redoStack: UndoRedoEntry[] = [];
  private projectRoot: string;
  private gitDir: string;
  private initialized = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const hash = simpleHash(projectRoot);
    this.gitDir = path.join(os.tmpdir(), `.sentinel-undo-${hash}`);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private async ensureGit(): Promise<void> {
    if (this.initialized) return;
    try {
      spawnSync('git', ['--version'], { stdio: 'ignore', timeout: 5_000 });
    } catch {
      throw new Error('Git is not available. Undo/redo requires git.');
    }

    if (!fs.existsSync(this.gitDir)) {
      fs.mkdirSync(this.gitDir, { recursive: true });
      spawnSync('git', ['init', '--bare', this.gitDir], { stdio: 'ignore', timeout: 10_000 });
    }

    try {
      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'config', 'user.email', 'sentinel-undo@shadow'], { stdio: 'ignore', timeout: 5_000 });
      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'config', 'user.name', 'sentinel-undo'], { stdio: 'ignore', timeout: 5_000 });
    } catch {
      // may fail but not critical
    }
    this.initialized = true;
  }

  async snapshot(messageIndex: number): Promise<string> {
    await this.ensureGit();

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-snap-'));

    try {
      const tracked = this.getTrackedFiles();
      for (const filePath of tracked) {
        const absPath = path.join(this.projectRoot, filePath);
        const destPath = path.join(tmpDir, filePath);
        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, content, 'utf-8');
        } catch {
          // file may have been deleted
        }
      }

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', tmpDir, 'add', '-A'], { stdio: 'ignore', timeout: 10_000 });
      const result = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', tmpDir, 'commit', '-m', `snapshot ${messageIndex} ${Date.now()}`], { stdio: 'pipe', timeout: 10_000, encoding: 'utf-8' });
      const match = (result.stdout ?? '').match(/\[[\w-]+ ([a-f0-9]+)\]/);
      const hash = match?.[1] ?? 'unknown';

      this.undoStack.push({ messageIndex, gitRef: hash, timestamp: Date.now() });
      this.redoStack = [];

      return hash;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async undo(): Promise<{ messageIndex: number; files: Array<{ path: string; content: string }> } | null> {
    await this.ensureGit();
    if (this.undoStack.length === 0) return null;

    const current = this.undoStack.pop()!;

    try {
      const result = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'diff', '--name-only', `${current.gitRef}^..${current.gitRef}`], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const diffFiles = (result.stdout ?? '').trim().split('\n').filter(Boolean);

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'checkout', `${current.gitRef}^`, '--', '.'], { stdio: 'ignore', timeout: 10_000 });

      const files = diffFiles.map((p) => {
        const absPath = path.join(this.projectRoot, p);
        let content = '';
        try {
          content = fs.readFileSync(absPath, 'utf-8');
        } catch {
          content = '';
        }
        return { path: p, content };
      });

      this.redoStack.push(current);

      return { messageIndex: current.messageIndex, files };
    } catch {
      this.undoStack.push(current);
      return null;
    }
  }

  async redo(): Promise<{ messageIndex: number; files: Array<{ path: string; content: string }> } | null> {
    await this.ensureGit();
    if (this.redoStack.length === 0) return null;

    const entry = this.redoStack.pop()!;

    try {
      const result = spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'diff', '--name-only', `${entry.gitRef}^..${entry.gitRef}`], { stdio: 'pipe', timeout: 5_000, encoding: 'utf-8' });
      const diffFiles = (result.stdout ?? '').trim().split('\n').filter(Boolean);

      spawnSync('git', ['--git-dir', this.gitDir, '--work-tree', this.projectRoot, 'checkout', entry.gitRef, '--', '.'], { stdio: 'ignore', timeout: 10_000 });

      const files = diffFiles.map((p) => {
        const absPath = path.join(this.projectRoot, p);
        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          return { path: p, content };
        } catch {
          return { path: p, content: '' };
        }
      });

      this.undoStack.push(entry);

      return { messageIndex: entry.messageIndex, files };
    } catch {
      this.redoStack.push(entry);
      return null;
    }
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  getUndoStack(): UndoRedoEntry[] {
    return [...this.undoStack];
  }

  getRedoStack(): UndoRedoEntry[] {
    return [...this.redoStack];
  }

  private getTrackedFiles(): string[] {
    try {
      const result = spawnSync('git', ['ls-files'], { cwd: this.projectRoot, stdio: 'pipe', timeout: 10_000, encoding: 'utf-8' });
      return (result.stdout ?? '').split('\n').filter(Boolean);
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

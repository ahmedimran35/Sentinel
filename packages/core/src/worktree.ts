import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_COMMAND_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs\./,
  /dd\s+if=/,
  /:\(\)\s*\{/,
  />\s*\/dev\/(sda|sdb|sdc|nvme)/,
];

export interface WorktreeConfig {
  baseDir: string;
  worktreeDir?: string;
  branch?: string;
}

const DEFAULT_WORKTREE_DIR = '.sentinel/worktrees';

interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
}

function getWorktreeDir(config: WorktreeConfig): string {
  return resolve(config.baseDir, config.worktreeDir ?? DEFAULT_WORKTREE_DIR);
}

function assertGitRepo(baseDir: string): void {
  const gitDir = resolve(baseDir, '.git');
  if (!existsSync(gitDir)) {
    throw new Error(`Not a git repository: ${baseDir}`);
  }
}

function execGit(args: string[], cwd: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr ?? '').trim() || `git ${args[0]} failed`);
  }
  return (result.stdout ?? '').trim();
}

function parseWorktreeLine(line: string): WorktreeInfo | null {
  // Format: <path> <hash> [<branch>]
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const path = parts[0] ?? '';
  const branchRaw = parts.slice(2).join(' ');
  const branch = branchRaw.replace(/^\[|\]$/g, '');
  const name = path.split('/').pop() ?? path;
  return { name, path, branch };
}

export class WorktreeManager {
  private config: WorktreeConfig;

  constructor(config: WorktreeConfig) {
    this.config = config;
  }

  /** Create a new worktree with the given name */
  async create(name: string): Promise<string> {
    assertGitRepo(this.config.baseDir);

    const worktreeDir = getWorktreeDir(this.config);
    const targetPath = resolve(worktreeDir, name);
    const branch = this.config.branch ?? 'main';

    if (existsSync(targetPath)) {
      throw new Error(`Worktree "${name}" already exists at ${targetPath}`);
    }

    mkdirSync(worktreeDir, { recursive: true });

    try {
      execGit(['worktree', 'add', targetPath, branch], this.config.baseDir);
    } catch {
      // If branch checkout fails, try creating with a new branch
      execGit(['worktree', 'add', targetPath, '--detach'], this.config.baseDir);
    }

    // Create .sentinel directory inside the worktree
    const sentinelDir = resolve(targetPath, '.sentinel');
    mkdirSync(sentinelDir, { recursive: true });

    return targetPath;
  }

  /** Remove a worktree by name */
  async remove(name: string): Promise<void> {
    assertGitRepo(this.config.baseDir);

    const worktreeDir = getWorktreeDir(this.config);
    const targetPath = resolve(worktreeDir, name);

    if (!existsSync(targetPath)) {
      throw new Error(`Worktree "${name}" not found at ${targetPath}`);
    }

    execGit(['worktree', 'remove', targetPath], this.config.baseDir);
  }

  /** List all active worktrees */
  async list(): Promise<WorktreeInfo[]> {
    assertGitRepo(this.config.baseDir);

    const output = execGit(['worktree', 'list'], this.config.baseDir);
    const lines = output.split('\n');
    const results: WorktreeInfo[] = [];

    for (const line of lines) {
      const info = parseWorktreeLine(line);
      if (info) {
        results.push(info);
      }
    }

    return results;
  }

  /** Run a command inside a specific worktree */
  async runInWorktree(name: string, command: string): Promise<string> {
    const worktreeDir = getWorktreeDir(this.config);
    const targetPath = resolve(worktreeDir, name);

    if (!existsSync(targetPath)) {
      throw new Error(`Worktree "${name}" not found at ${targetPath}`);
    }

    if (!command || command.length > 4096) {
      throw new Error('Command is empty or exceeds maximum length (4096 chars)');
    }

    if (FORBIDDEN_COMMAND_PATTERNS.some(p => p.test(command))) {
      throw new Error('Command contains forbidden patterns');
    }

    return new Promise((resolvePromise, reject) => {
      const child = spawnSync('sh', ['-c', command], { cwd: targetPath, encoding: 'utf-8', timeout: 30_000 });
      if (child.status === 0) {
        resolvePromise((child.stdout ?? '').trim());
      } else {
        reject(new Error((child.stderr ?? '').trim() || `exit code ${child.status}`));
      }
    });
  }

  /** Remove stale worktrees (those whose branches no longer exist) */
  async cleanupStale(): Promise<void> {
    assertGitRepo(this.config.baseDir);

    const worktrees = await this.list();
    const worktreeDir = getWorktreeDir(this.config);

    for (const wt of worktrees) {
      // Skip the main worktree (baseDir)
      if (resolve(wt.path) === resolve(this.config.baseDir)) continue;

      const branch = wt.branch;
      if (!branch) continue;

      try {
        // Check if the branch still exists
        execGit(['rev-parse', '--verify', branch], this.config.baseDir);
      } catch {
        // Branch doesn't exist — stale worktree
        const name = wt.name;
        const targetPath = resolve(worktreeDir, name);
        if (existsSync(targetPath)) {
          try {
            execGit(['worktree', 'remove', '--force', targetPath], this.config.baseDir);
          } catch {
            // If git worktree remove fails, try manual cleanup
            rmSync(targetPath, { recursive: true, force: true });
            try {
              execGit(['worktree', 'prune'], this.config.baseDir);
            } catch {
              // non-fatal
            }
          }
        }
      }
    }
  }
}

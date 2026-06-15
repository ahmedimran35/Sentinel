import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import type { Session, Config } from './commands/types.js';

const DEFAULT_FILE_GLOBS = ['**/*.{ts,tsx,js,jsx,json,md,py,go,rs,yaml,yml,toml}'];
const DEFAULT_MAX_AGE_DAYS = 30;
const SNAPSHOT_DIR = resolve(homedir(), '.config', 'sentinel', 'snapshots');

/** JSON-safe shape (dates serialised as ISO strings). */
interface SnapshotData {
  id: string;
  label: string;
  session: Session;
  config: Config;
  memory: { files: Record<string, string>; buffer: string };
  createdAt: string;
  projectRoot: string;
  model: string;
  mode: string;
  tokenCounts: { input: number; output: number; cached: number };
  cost: number;
  tags: string[];
}

export interface Snapshot {
  id: string;
  label: string;
  session: Session;
  config: Config;
  memory: { files: Record<string, string>; buffer: string };
  createdAt: Date;
  projectRoot: string;
  model: string;
  mode: string;
  tokenCounts: { input: number; output: number; cached: number };
  cost: number;
  tags: string[];
}

export interface CreateSnapshotOptions {
  label?: string;
  tags?: string[];
  includeFiles?: boolean;
  fileGlobs?: string[];
}

function generateId(): string {
  return randomBytes(4).toString('hex');
}

function snapshotPath(id: string): string {
  return resolve(SNAPSHOT_DIR, `${id}.json`);
}

function collectFiles(projectRoot: string, globs: string[]): Record<string, string> {
  const files: Record<string, string> = {};
  const extensions = new Set<string>();

  for (const pattern of globs) {
    const extMatch = pattern.match(/\{([^}]+)\}$/);
    if (extMatch) {
      for (const ext of extMatch[1]!.split(',')) {
        extensions.add(ext.startsWith('.') ? ext : `.${ext}`);
      }
    }
  }

  if (extensions.size === 0) {
    extensions.add('.ts');
  }

  try {
    walkDir(projectRoot, projectRoot, extensions, files, 500);
  } catch {
    // directory might not exist
  }

  return files;
}

function walkDir(
  root: string,
  dir: string,
  extensions: Set<string>,
  files: Record<string, string>,
  maxFiles: number,
): void {
  if (Object.keys(files).length >= maxFiles) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (Object.keys(files).length >= maxFiles) break;
    if (name.startsWith('.') || name === 'node_modules') continue;

    const fullPath = join(dir, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(root, fullPath, extensions, files, maxFiles);
    } else if (stat.isFile()) {
      const ext = extname(name);
      if (!extensions.has(ext)) continue;

      try {
        files[fullPath] = readFileSync(fullPath, 'utf-8');
      } catch {
        // skip unreadable
      }
    }
  }
}

function toSnapshot(raw: SnapshotData): Snapshot {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    session: {
      ...raw.session,
      startTime: new Date(raw.session.startTime),
    },
  };
}

export class SnapshotManager {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? SNAPSHOT_DIR;
    mkdirSync(this.dir, { recursive: true });
  }

  createSnapshot(
    session: Session,
    config: Config,
    options: CreateSnapshotOptions = {},
  ): string {
    const id = generateId();
    const label = options.label ?? `snapshot-${id}`;
    const tags = options.tags ?? [];

    const files = options.includeFiles
      ? collectFiles(config.projectRoot, options.fileGlobs ?? DEFAULT_FILE_GLOBS)
      : {};

    const snapshot: SnapshotData = {
      id,
      label,
      session,
      config,
      memory: { files, buffer: '' },
      createdAt: new Date().toISOString(),
      projectRoot: config.projectRoot,
      model: config.model,
      mode: config.mode,
      tokenCounts: { ...session.tokenCounts },
      cost: session.cost,
      tags,
    };

    writeFileSync(snapshotPath(id), JSON.stringify(snapshot, null, 2), 'utf-8');
    return id;
  }

  listSnapshots(projectRoot?: string): Snapshot[] {
    if (!existsSync(this.dir)) return [];

    const snapshots: Snapshot[] = [];
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
      for (const f of files) {
        try {
          const data = JSON.parse(readFileSync(resolve(this.dir, f), 'utf-8')) as SnapshotData;
          if (projectRoot && data.projectRoot !== projectRoot) continue;
          snapshots.push(toSnapshot(data));
        } catch {
          // skip corrupt
        }
      }
    } catch {
      // skip
    }

    return snapshots.sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  }

  loadSnapshot(id: string): Snapshot | null {
    const file = snapshotPath(id);
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8')) as SnapshotData;
      return toSnapshot(data);
    } catch {
      return null;
    }
  }

  restoreSnapshot(id: string): { session: Session; config: Config } | null {
    const snapshot = this.loadSnapshot(id);
    if (!snapshot) return null;
    return { session: snapshot.session, config: snapshot.config };
  }

  deleteSnapshot(id: string): boolean {
    const file = snapshotPath(id);
    if (!existsSync(file)) return false;
    unlinkSync(file);
    return true;
  }

  searchSnapshots(query: string): Snapshot[] {
    const q = query.toLowerCase();
    return this.listSnapshots().filter((s) => {
      if (s.label.toLowerCase().includes(q)) return true;
      if (s.projectRoot.toLowerCase().includes(q)) return true;
      if (s.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  cleanup(maxAgeDays?: number): number {
    const cutoff = Date.now() - (maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86400000;
    let removed = 0;

    if (!existsSync(this.dir)) return 0;

    const files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const filePath = resolve(this.dir, f);
        const data = JSON.parse(readFileSync(filePath, 'utf-8')) as SnapshotData;
        if (new Date(data.createdAt).getTime() < cutoff) {
          unlinkSync(filePath);
          removed++;
        }
      } catch {
        // skip corrupt files
      }
    }

    return removed;
  }
}

let defaultManager: SnapshotManager | null = null;

function getManager(): SnapshotManager {
  if (!defaultManager) {
    defaultManager = new SnapshotManager();
  }
  return defaultManager;
}

export function createSnapshot(
  session: Session,
  config: Config,
  options?: CreateSnapshotOptions,
): Promise<string> {
  return Promise.resolve(getManager().createSnapshot(session, config, options));
}

export function listSnapshots(projectRoot?: string): Snapshot[] {
  return getManager().listSnapshots(projectRoot);
}

export function loadSnapshot(id: string): Snapshot | null {
  return getManager().loadSnapshot(id);
}

export function restoreSnapshot(id: string): { session: Session; config: Config } | null {
  return getManager().restoreSnapshot(id);
}

export function deleteSnapshot(id: string): boolean {
  return getManager().deleteSnapshot(id);
}

export function searchSnapshots(query: string): Snapshot[] {
  return getManager().searchSnapshots(query);
}

export function cleanupSnapshots(maxAgeDays?: number): number {
  return getManager().cleanup(maxAgeDays);
}

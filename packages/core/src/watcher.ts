import { watch, existsSync, type FSWatcher } from 'node:fs';
import { resolve, relative } from 'node:path';

type ChangeEvent = 'change' | 'create' | 'delete';

function globMatch(pattern: string, filePath: string): boolean {
  const parts = pattern.split('/');
  const fileParts = filePath.split('/');

  let pi = 0;
  let fi = 0;
  let backtrackP = -1;
  let backtrackF = -1;

  while (fi < fileParts.length) {
    if (pi < parts.length && (parts[pi] === '**')) {
      backtrackP = pi;
      backtrackF = fi;
      pi++;
    } else if (pi < parts.length && (parts[pi] === '*' || parts[pi] === fileParts[fi])) {
      pi++;
      fi++;
    } else if (backtrackP >= 0) {
      pi = backtrackP + 1;
      fi = ++backtrackF;
    } else {
      return false;
    }
  }

  while (pi < parts.length && parts[pi] === '**') pi++;
  return pi >= parts.length;
}

function matchesAny(pattern: string, filePath: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    if (filePath === prefix || filePath.startsWith(prefix + '/')) return true;
  }
  if (pattern.endsWith('**')) {
    const prefix = pattern.slice(0, -2);
    if (filePath.startsWith(prefix)) return true;
  }
  return globMatch(pattern, filePath);
}

export class FileWatcher {
  private rootDir: string;
  private ignorePatterns: string[];
  private watchers = new Set<FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceMs: number;
  private running = false;

  onChange: ((filePath: string, event: ChangeEvent) => void) | null = null;

  constructor(rootDir: string, ignorePatterns: string[], debounceMs = 100) {
    this.rootDir = rootDir;
    this.ignorePatterns = ignorePatterns;
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    try {
      const w = watch(this.rootDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = resolve(this.rootDir, filename.toString());
        const relPath = relative(this.rootDir, fullPath);
        if (this.shouldIgnore(relPath)) return;
        this.debounce(relPath, this.mapEvent(eventType, fullPath));
      });
      this.watchers.add(w);
    } catch {
      console.warn('[watcher] Failed to start recursive watch');
    }
  }

  stop(): void {
    this.running = false;
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers.clear();
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
  }

  private shouldIgnore(filePath: string): boolean {
    for (const pattern of this.ignorePatterns) {
      if (matchesAny(pattern, filePath)) return true;
    }
    return false;
  }

  private mapEvent(eventType: string, fullPath: string): ChangeEvent {
    if (eventType === 'rename') {
      return existsSync(fullPath) ? 'create' : 'delete';
    }
    return 'change';
  }

  private debounce(filePath: string, event: ChangeEvent): void {
    const key = `${filePath}:${event}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.onChange?.(filePath, event);
    }, this.debounceMs));
  }
}

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, isAbsolute, basename } from 'node:path';

export interface ResolvedReference {
  type: 'file' | 'line' | 'range' | 'symbol';
  target: string;
  content: string;
  filePath?: string;
  lineNumber?: number;
  unresolved?: boolean;
}

const MAX_FILE_SIZE = 1 * 1024 * 1024;
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'target', 'vendor', '.venv', '__pycache__']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.o', '.so', '.dylib', '.dll', '.exe']);

function isBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

function fuzzyMatches(query: string, text: string): boolean {
  const lowered = query.toLowerCase();
  const target = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < lowered.length; ti++) {
    if (target[ti] === lowered[qi]) qi++;
  }
  return qi === lowered.length;
}

interface FileEntry {
  path: string;
  relativePath: string;
  score: number;
}

export class FileReferenceResolver {
  private projectRoot: string;
  private fileCache: Array<{ path: string; mtimeMs: number }> = [];
  private lastScan = 0;
  private scanInterval = 5000;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  private scanFiles(): Array<{ path: string; mtimeMs: number }> {
    const now = Date.now();
    if (now - this.lastScan < this.scanInterval && this.fileCache.length > 0) {
      return this.fileCache;
    }
    const results: Array<{ path: string; mtimeMs: number }> = [];
    const walk = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!IGNORE_DIRS.has(entry.name)) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (BINARY_EXTS.has(ext)) continue;
            try {
              const stat = statSync(fullPath);
              if (stat.size > MAX_FILE_SIZE) continue;
              results.push({ path: fullPath, mtimeMs: stat.mtimeMs });
            } catch {
              // skip
            }
          }
        }
      } catch {
        // skip
      }
    };
    walk(this.projectRoot);
    this.fileCache = results;
    this.lastScan = now;
    return results;
  }

  fuzzySearch(query: string, maxResults = 15): FileEntry[] {
    if (!query.trim()) return [];
    const files = this.scanFiles();
    const scored: FileEntry[] = [];

    for (const file of files) {
      const relPath = relative(this.projectRoot, file.path);

      if (relPath.toLowerCase().includes(query.toLowerCase())) {
        const exactIdx = relPath.toLowerCase().indexOf(query.toLowerCase());
        const score = exactIdx === 0 ? 100 : Math.max(0, 100 - exactIdx);
        scored.push({ path: file.path, relativePath: relPath, score });
        continue;
      }

      const base = basename(relPath);
      if (fuzzyMatches(query, base)) {
        scored.push({ path: file.path, relativePath: relPath, score: 50 });
        continue;
      }

      if (fuzzyMatches(query, relPath)) {
        scored.push({ path: file.path, relativePath: relPath, score: 30 });
        continue;
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  async resolve(
    text: string,
  ): Promise<{ text: string; references: ResolvedReference[] }> {
    const refRegex = /@(\S+)/g;
    const matches: Array<{ index: number; length: number; target: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = refRegex.exec(text)) !== null) {
      matches.push({ index: m.index, length: m[0].length, target: m[1]! });
    }

    const resolvedRefs: Array<{ index: number; length: number; ref: ResolvedReference }> = [];
    for (const match of matches) {
      const ref = await this.resolveFileRef(match.target);
      resolvedRefs.push({ index: match.index, length: match.length, ref });
    }

    resolvedRefs.sort((a, b) => b.index - a.index);
    let resolved = text;
    const references: ResolvedReference[] = [];
    for (const { index, length, ref } of resolvedRefs) {
      resolved = resolved.slice(0, index) + ref.content + resolved.slice(index + length);
      references.push(ref);
    }
    references.reverse();

    return { text: resolved, references };
  }

  async resolveFileRef(
    target: string,
  ): Promise<ResolvedReference> {
    const rangeMatch = target.match(/^(.+):(\d+)-(\d+)$/);
    const lineMatch = !rangeMatch ? target.match(/^(.+):(\d+)$/) : null;

    let filePath: string;
    let line: number | undefined;
    let endLine: number | undefined;

    if (rangeMatch) {
      filePath = rangeMatch[1]!;
      line = parseInt(rangeMatch[2]!, 10);
      endLine = parseInt(rangeMatch[3]!, 10);
    } else if (lineMatch) {
      filePath = lineMatch[1]!;
      line = parseInt(lineMatch[2]!, 10);
    } else {
      filePath = target;
    }

    const absPath = isAbsolute(filePath) ? filePath : resolve(this.projectRoot, filePath);

    try {
      const stat = statSync(absPath);
      if (stat.size > MAX_FILE_SIZE) {
        return { type: 'file', target, content: `@${target}`, filePath, unresolved: true };
      }
      const buf = readFileSync(absPath);
      if (isBinary(buf)) {
        return { type: 'file', target, content: `@${target}`, filePath, unresolved: true };
      }
      const content = buf.toString('utf-8');
      const lang = extname(absPath).slice(1);
      const lines = content.split('\n');

      if (line !== undefined && endLine !== undefined) {
        const selected = lines.slice(line - 1, endLine);
        const formatted = selected
          .map((l, i) => `  ${String(line + i).padStart(5)}: ${l}`)
          .join('\n');
        return {
          type: 'range',
          target,
          content: `\`${filePath}:${line}-${endLine}\`\n\`\`\`${lang}\n${formatted}\n\`\`\``,
          filePath,
          lineNumber: line,
        };
      }

      if (line !== undefined) {
        const selected = lines[line - 1] ?? '';
        return {
          type: 'line',
          target,
          content: `\`${filePath}:${line}\`\n\`\`\`${lang}\n  ${String(line).padStart(5)}: ${selected}\n\`\`\``,
          filePath,
          lineNumber: line,
        };
      }

      return {
        type: 'file',
        target,
        content: `\`${filePath}\`\n\`\`\`${lang}\n${content}\n\`\`\``,
        filePath,
      };
    } catch {
      return { type: 'file', target, content: `@${target}`, filePath, unresolved: true };
    }
  }
}

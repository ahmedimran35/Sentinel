import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, isAbsolute } from 'node:path';

export interface ResolvedReference {
  type: 'file' | 'line' | 'range' | 'symbol';
  target: string;
  content: string;
  filePath?: string;
  lineNumber?: number;
  unresolved?: boolean;
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php',
  '.swift', '.kt',
]);

const MAX_FILE_SIZE = 1 * 1024 * 1024;
const CACHE_TTL_MS = 5000;

interface CacheEntry {
  content: string;
  timestamp: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

export class ReferenceResolver {
  private fileCache = new Map<string, CacheEntry>();

  clearCache(): void {
    this.fileCache.clear();
  }

  async resolve(
    text: string,
    projectRoot: string,
  ): Promise<{ resolved: string; references: ResolvedReference[] }> {
    return this._resolve(text, projectRoot, false);
  }

  async resolveAsync(
    text: string,
    projectRoot: string,
  ): Promise<{ resolved: string; references: ResolvedReference[] }> {
    return this._resolve(text, projectRoot, true);
  }

  private async _resolve(
    text: string,
    projectRoot: string,
    asyncMode: boolean,
  ): Promise<{ resolved: string; references: ResolvedReference[] }> {
    const matches: Array<{
      index: number;
      length: number;
      original: string;
      isFile: boolean;
      target: string;
    }> = [];
    const refRegex = /@(\S+)|#(\w+)/g;
    let m: RegExpExecArray | null;

    while ((m = refRegex.exec(text)) !== null) {
      matches.push({
        index: m.index,
        length: m[0].length,
        original: m[0],
        isFile: m[1] !== undefined,
        target: m[1] ?? m[2]!,
      });
    }

    const resolvedRefs: Array<{
      index: number;
      length: number;
      ref: ResolvedReference;
    }> = [];

    for (const match of matches) {
      let ref: ResolvedReference;
      if (match.isFile) {
        ref = await this.resolveFileRef(match.target, match.original, projectRoot);
      } else {
        ref = await this.resolveSymbolRef(match.target, match.original, projectRoot, asyncMode);
      }
      if (asyncMode) {
        await this.yieldToEventLoop();
      }
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

    return { resolved, references };
  }

  private async resolveFileRef(
    target: string,
    original: string,
    projectRoot: string,
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

    const absPath = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);

    try {
      const content = await this.readFile(absPath);
      if (content === null) {
        return { type: 'file', target, content: original, filePath, unresolved: true };
      }

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
      return { type: 'file', target, content: original, unresolved: true };
    }
  }

  private async resolveSymbolRef(
    symbol: string,
    original: string,
    projectRoot: string,
    asyncMode: boolean,
  ): Promise<ResolvedReference> {
    const files = this.findSourceFiles(projectRoot);

    for (const file of files) {
      if (asyncMode) {
        await this.yieldToEventLoop();
      }

      const result = this.searchSymbolInFile(symbol, file);
      if (result) {
        const lang = extname(file).slice(1);
        const relPath = relative(projectRoot, file);
        return {
          type: 'symbol',
          target: symbol,
          content: `\`${symbol}\` (defined in \`${relPath}:${result.lineNumber}\`)\n\`\`\`${lang}\n${result.code}\n\`\`\``,
          filePath: relPath,
          lineNumber: result.lineNumber,
        };
      }
    }

    return { type: 'symbol', target: symbol, content: original, unresolved: true };
  }

  private async readFile(filePath: string): Promise<string | null> {
    const cached = this.fileCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.content;
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return null;

    const fd = readFileSync(filePath);
    if (isBinary(fd)) return null;

    const content = fd.toString('utf-8');
    this.fileCache.set(filePath, { content, timestamp: Date.now() });
    return content;
  }

  private findSourceFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist' &&
            entry.name !== 'build' &&
            entry.name !== 'target'
          ) {
            results.push(...this.findSourceFiles(fullPath));
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (SOURCE_EXTENSIONS.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // skip
    }
    return results;
  }

  private searchSymbolInFile(
    symbol: string,
    filePath: string,
  ): { lineNumber: number; code: string } | null {
    try {
      const buf = readFileSync(filePath);
      if (isBinary(buf)) return null;
      if (buf.length > MAX_FILE_SIZE) return null;

      const content = buf.toString('utf-8');
      const escaped = escapeRegex(symbol);
      const patterns: RegExp[] = [
        new RegExp(`function\\s+${escaped}\\s*\\(`),
        new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(`),
        new RegExp(`def\\s+${escaped}\\s*\\(`),
        new RegExp(`func\\s+${escaped}\\s*\\(`),
        new RegExp(`fn\\s+${escaped}\\s*\\(`),
        new RegExp(`class\\s+${escaped}\\b`),
        new RegExp(`interface\\s+${escaped}\\b`),
        new RegExp(`struct\\s+${escaped}\\b`),
        new RegExp(`enum\\s+${escaped}\\b`),
        new RegExp(`trait\\s+${escaped}\\b`),
      ];

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          if (pattern.test(lines[i]!)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 6);
            const code = lines.slice(start, end).join('\n');
            return { lineNumber: i + 1, code };
          }
        }
      }

      const methodPattern = new RegExp(`\\b${escaped}\\s*\\(`);
      for (let i = 0; i < lines.length; i++) {
        if (methodPattern.test(lines[i]!)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 6);
          const code = lines.slice(start, end).join('\n');
          return { lineNumber: i + 1, code };
        }
      }
    } catch {
      // skip
    }
    return null;
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  formatReferences(references: ResolvedReference[]): string {
    if (references.length === 0) return 'No references resolved.';

    const lines: string[] = ['Resolved References:'];
    for (const ref of references) {
      if (ref.unresolved) {
        lines.push(`  \u26a0  ${ref.target} \u2014 not found`);
      } else {
        const location = ref.filePath
          ? ref.lineNumber
            ? `${ref.filePath}:${ref.lineNumber}`
            : ref.filePath
          : '';
        lines.push(`  \u2713 ${ref.target}${location ? ` (${location})` : ''}`);
      }
    }
    return lines.join('\n');
  }
}

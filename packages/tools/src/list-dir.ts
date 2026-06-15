import { z } from 'zod';
import { readdirSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { Tool } from '@sentinel/shared';

function getProjectRoot(): string {
  return realpathSync(process.env.SENTINEL_PROJECT_ROOT || process.cwd());
}

const ListSchema = z.object({
  path: z.string().default('.'),
  depth: z.number().int().min(0).max(3).default(1),
});

export const listTool: Tool<typeof ListSchema> = {
  name: 'list',
  description: 'List directory contents. Depth controls recursion (0=top only, 1=one level).',
  risk: 'read',
  inputSchema: ListSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;
    try {
      const rawPath = input.path || '.';
      const dirPath = resolve(rawPath);
      const resolvedDir = (() => { try { return realpathSync(dirPath); } catch { return dirPath; } })();
      const rel = relative(getProjectRoot(), resolvedDir);
      if (rel.startsWith('..') || rel.startsWith('/')) {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: { callId: 'list', output: `Error: path is outside project root.`, isError: true },
        };
        return;
      }
      const maxDepth = input.depth ?? 1;
      const lines: string[] = [];
      walk(dirPath, 0, maxDepth, lines, ctx.signal);
      const output = lines.length > 0 ? lines.join('\n') : `(empty directory: ${dirPath})`;
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'list', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'list',
          output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

function isPathWithinRoot(targetPath: string): boolean {
  try {
    const root = getProjectRoot();
    let resolvedTarget: string;
    try {
      resolvedTarget = realpathSync(targetPath);
    } catch {
      resolvedTarget = resolvePathForNonExistent(targetPath, root);
    }
    const rel = relative(root, resolvedTarget);
    return !rel.startsWith('..') && !rel.startsWith('/');
  } catch {
    return false;
  }
}

function resolvePathForNonExistent(targetPath: string, _root: string): string {
  try {
    let current = path.resolve(targetPath);
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      const parent = path.dirname(current);
      if (parent === current) break;
      parts.push(path.basename(current));
      current = parent;
      try {
        const resolvedBase = realpathSync(current);
        return path.join(resolvedBase, ...parts.reverse());
      } catch { /* continue walking up */ }
    }
  } catch { /* fall through */ }
  return path.resolve(targetPath);
}

function walk(dir: string, depth: number, maxDepth: number, lines: string[], signal: AbortSignal): void {
  if (signal.aborted || depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  try {
    const entries = readdirSync(dir);
    for (const entry of entries.sort()) {
      if (signal.aborted) return;
      const fullPath = join(dir, entry);
      let stats;
      try { stats = statSync(fullPath); } catch { continue; }
      const suffix = stats.isDirectory() ? '/' : '';
      const size = stats.isFile() ? ` (${stats.size} B)` : '';
      lines.push(`${indent}${entry}${suffix}${size}`);
      if (stats.isDirectory() && depth < maxDepth) {
        walk(fullPath, depth + 1, maxDepth, lines, signal);
      }
    }
  } catch {
    lines.push(`${indent}(cannot read: ${dir})`);
  }
}

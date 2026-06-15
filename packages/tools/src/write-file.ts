import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { relative } from 'node:path';
import type { Tool } from '@sentinel/shared';

function getProjectRoot(): string {
  return realpathSync(process.env.SENTINEL_PROJECT_ROOT || process.cwd());
}

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

function resolvePathForNonExistent(targetPath: string, root: string): string {
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

const WriteFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const writeFileTool: Tool<typeof WriteFileSchema> = {
  name: 'write_file',
  description: 'Write a file atomically (temp + rename). Auto-creates parent directories.',
  risk: 'write',
  inputSchema: WriteFileSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    if (!input.path || typeof input.path !== 'string') {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'write',
          output: 'Missing required field "path" — please specify a file path.',
          isError: true,
        },
      };
      return;
    }

    if (typeof input.content !== 'string') {
      input.content = String(input.content ?? '');
    }

    const filePath = path.resolve(input.path);

    if (!isPathWithinRoot(filePath)) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'write',
          output: 'Write denied: path is outside project root.',
          isError: true,
        },
      };
      return;
    }

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const tmpPath = path.join(os.tmpdir(), `.sentinel-write-${randomUUID()}`);
      await fs.writeFile(tmpPath, input.content, 'utf-8');
      await fs.rename(tmpPath, filePath);

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'write',
          output: `Written ${Buffer.byteLength(input.content, 'utf-8')} bytes to ${input.path}`,
          isError: false,
        },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'write',
          output: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

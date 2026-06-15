import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { relative } from 'node:path';
import os from 'node:os';
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

const EditFileSchema = z.object({
  path: z.string(),
  old_str: z.string().min(1),
  new_str: z.string(),
});

const fileHashes = new Map<string, string>();

function simpleHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return String(h);
}

export const editFileTool: Tool<typeof EditFileSchema> = {
  name: 'edit_file',
  description: 'Replace unique old_str with new_str in a file. Stale-edit guard rejects if file changed since last read.',
  risk: 'write',
  inputSchema: EditFileSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    const filePath = path.resolve(input.path);

    if (!isPathWithinRoot(filePath)) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'edit',
          output: 'Edit denied: path is outside project root.',
          isError: true,
        },
      };
      return;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const currentHash = simpleHash(content);

      const prevHash = fileHashes.get(filePath);
      if (prevHash !== undefined && prevHash !== currentHash) {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: {
            callId: 'edit',
            output: `Stale-edit guard: file has changed since last read. Re-read and try again.`,
            isError: true,
          },
        };
        return;
      }

      const idx = content.indexOf(input.old_str);
      if (idx === -1) {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: {
            callId: 'edit',
            output: `Could not find old_str. old_str must match exactly, including whitespace.`,
            isError: true,
          },
        };
        return;
      }

      const newContent = content.slice(0, idx) + input.new_str + content.slice(idx + input.old_str.length);

      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const tmpPath = path.join(os.tmpdir(), `.sentinel-edit-${randomUUID()}`);
      await fs.writeFile(tmpPath, newContent, 'utf-8');
      await fs.rename(tmpPath, filePath);

      fileHashes.set(filePath, simpleHash(newContent));

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'edit',
          output: `Applied edit (${Buffer.byteLength(input.old_str, 'utf-8')} bytes replaced)`,
          isError: false,
        },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'edit',
          output: `Edit failed.`,
          isError: true,
        },
      };
    }
  },
};

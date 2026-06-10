import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Tool } from '@sentinel/shared';

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
            output: `Stale-edit guard: file ${input.path} has changed since last read. Re-read and try again.`,
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
            output: `Could not find old_str in ${input.path}. old_str must match exactly, including whitespace.`,
            isError: true,
          },
        };
        return;
      }

      const newContent = content.slice(0, idx) + input.new_str + content.slice(idx + input.old_str.length);

      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const tmpPath = path.join(
        os.tmpdir(),
        `.sentinel-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await fs.writeFile(tmpPath, newContent, 'utf-8');
      await fs.rename(tmpPath, filePath);

      fileHashes.set(filePath, simpleHash(newContent));

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'edit',
          output: `Applied edit to ${input.path} (${Buffer.byteLength(input.old_str, 'utf-8')} bytes replaced)`,
          isError: false,
        },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'edit',
          output: `Error editing file: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Tool } from '@sentinel/shared';

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

    const filePath = path.resolve(input.path);

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const tmpPath = path.join(
        os.tmpdir(),
        `.sentinel-write-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
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
          output: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

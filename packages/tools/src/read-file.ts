import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from '@sentinel/shared';

const MAX_LINES = 2000;

const ReadFileSchema = z.object({
  path: z.string(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

async function isBinary(filePath: string): Promise<boolean> {
  try {
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buffer, 0, 512, 0);
    await handle.close();
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const readFileTool: Tool<typeof ReadFileSchema> = {
  name: 'read_file',
  description: 'Read a file with line numbers. Supports offset and limit for partial reads. Truncated at 2000 lines.',
  risk: 'read',
  inputSchema: ReadFileSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    const filePath = path.resolve(input.path);

    try {
      if (await isBinary(filePath)) {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: { callId: 'read', output: `[Binary file: ${input.path}]`, isError: false },
        };
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      const startOffset = input.offset ?? 0;
      const endOffset = input.limit ? startOffset + input.limit : MAX_LINES;
      const displayLines = lines.slice(startOffset, Math.min(endOffset, totalLines));

      const numbered = displayLines.map((line, i) => `${startOffset + i + 1}: ${line}`).join('\n');
      let output = numbered;

      if (totalLines > endOffset) {
        output += `\n... (${totalLines - endOffset} more lines. Use offset=${endOffset}&limit=${MAX_LINES} to see more)`;
      }

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'read', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'read',
          output: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

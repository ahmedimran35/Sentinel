import { z } from 'zod';
import { execSync } from 'node:child_process';
import type { Tool } from '@sentinel/shared';

const GlobSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

export const globTool: Tool<typeof GlobSchema> = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Ripgrep-backed, .gitignore-aware.',
  risk: 'read',
  inputSchema: GlobSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    try {
      const cwd = input.path ?? process.cwd();
      const result = execSync(`find "${cwd}" -path "*/node_modules" -prune -o -path "${input.pattern}" -print 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 10_000,
      });

      const files = result.trim().split('\n').filter(Boolean);
      const output = files.length > 0 ? files.join('\n') : `No files matching ${input.pattern}`;

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'glob', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'glob',
          output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

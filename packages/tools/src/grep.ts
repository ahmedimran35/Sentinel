import { z } from 'zod';
import { execSync } from 'node:child_process';
import type { Tool } from '@sentinel/shared';

const GrepSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  include: z.string().optional(),
});

export const grepTool: Tool<typeof GrepSchema> = {
  name: 'grep',
  description: 'Search file contents with a regex pattern. Ripgrep-backed, .gitignore-aware.',
  risk: 'read',
  inputSchema: GrepSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    try {
      const cwd = input.path ?? process.cwd();
      let cmd = `grep -rn`;
      if (input.include) {
        cmd += ` --include="${input.include}"`;
      }
      cmd += ` "${input.pattern}" "${cwd}" 2>/dev/null | head -100`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });

      const lines = result.trim().split('\n').filter(Boolean);
      const output = lines.length > 0
        ? lines.join('\n') + (lines.length >= 100 ? '\n... (truncated at 100 matches)' : '')
        : `No matches for "${input.pattern}"`;

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'grep', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'grep',
          output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

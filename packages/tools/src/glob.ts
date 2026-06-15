import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { Tool } from '@sentinel/shared';
import path from 'node:path';
import fs from 'node:fs';

const GlobSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

async function runFind(cwd: string, pattern: string, timeoutMs: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('find', [cwd, '-type', 'f', '-name', pattern], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    if (!child.stdout || !child.stderr) {
      reject(new Error('find process stdio not available'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(stdout);
      else reject(new Error(`find failed (${code}): ${stderr.slice(0, 200)}`));
    });
    if (signal.aborted) { child.kill(); reject(new Error('Aborted')); }
    signal.addEventListener('abort', () => { child.kill(); }, { once: true });
  });
}

export const globTool: Tool<typeof GlobSchema> = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Uses the `find` command.',
  risk: 'read',
  inputSchema: GlobSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    try {
      const cwd = input.path ?? process.cwd();
      const result = await runFind(cwd, input.pattern, 10_000, ctx.signal);

      const lines = result.trim().split('\n').filter(Boolean).slice(0, 100);
      const output = lines.length > 0
        ? lines.join('\n')
        : `No files matching "${input.pattern}"`;

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
          output: `Glob search failed`,
          isError: true,
        },
      };
    }
  },
};

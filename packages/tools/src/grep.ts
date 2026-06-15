import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { Tool } from '@sentinel/shared';
import { loadIgnorePatterns, shouldIgnore } from './ignore.js';

const GrepSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  include: z.string().optional(),
});

async function runGrep(args: string[], timeoutMs: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    if (!child.stdout || !child.stderr) {
      reject(new Error('rg process stdio not available'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(stdout);
      else reject(new Error(`rg failed (${code}): ${stderr.slice(0, 200)}`));
    });
    if (signal.aborted) { child.kill(); reject(new Error('Aborted')); }
    signal.addEventListener('abort', () => { child.kill(); }, { once: true });
  });
}

async function runGrepFallback(pattern: string, cwd: string, include: string | undefined, timeoutMs: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-rn'];
    if (include) args.push('--include=' + include);
    args.push(pattern, cwd);
    const child = spawn('grep', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    if (!child.stdout || !child.stderr) {
      reject(new Error('grep process stdio not available'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(stdout);
      else reject(new Error(`grep failed (${code}): ${stderr.slice(0, 200)}`));
    });
    if (signal.aborted) { child.kill(); reject(new Error('Aborted')); }
    signal.addEventListener('abort', () => { child.kill(); }, { once: true });
  });
}

export const grepTool: Tool<typeof GrepSchema> = {
  name: 'grep',
  description: 'Search file contents with a regex pattern. Uses ripgrep if available with .gitignore/.ignore support.',
  risk: 'read',
  inputSchema: GrepSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    try {
      const cwd = input.path ?? process.cwd();
      const timeoutMs = 10_000;
      let result: string;

      const rgArgs = ['-n'];
      if (input.include) rgArgs.push('-g', input.include);
      rgArgs.push('--', input.pattern, cwd);

      try {
        result = await runGrep(rgArgs, timeoutMs, ctx.signal);
      } catch {
        result = await runGrepFallback(input.pattern, cwd, input.include, timeoutMs, ctx.signal);
        const patterns = loadIgnorePatterns(cwd);
        if (patterns.length > 0) {
          const lines = result.trim().split('\n').filter(Boolean);
          const filtered = lines.filter(line => {
            const filePath = line.split(':')[0];
            return filePath ? !shouldIgnore(filePath, patterns, cwd) : true;
          });
          result = filtered.join('\n');
        }
      }

      const lines = result.trim().split('\n').filter(Boolean);
      const output = lines.length > 0
        ? lines.slice(0, 100).join('\n') + (lines.length > 100 ? '\n... (truncated at 100 matches)' : '')
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
          output: `Search failed`,
          isError: true,
        },
      };
    }
  },
};

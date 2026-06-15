import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { Tool } from '@sentinel/shared';

const BashSchema = z.object({
  command: z.string(),
  timeout_ms: z.number().int().positive().default(30_000),
  workdir: z.string().optional(),
});

interface ShellSession {
  cwd: string;
  proc: ReturnType<typeof spawn>;
  buffer: string;
}

const sessions = new Map<string, ShellSession>();

const SAFE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'SHELL',
  'TMPDIR', 'PWD', 'NODE_PATH', 'EDITOR',
]);

function getSafeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { TERM: 'dumb' };
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

let shellPath = 'bash';
try {
  const userShell = process.env.SHELL || 'bash';
  spawn(userShell, ['--version'], { stdio: 'ignore', timeout: 2000 });
  shellPath = userShell;
} catch {
  shellPath = 'bash';
}

export function getSessionCwd(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.cwd;
}

export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.proc.kill();
    sessions.delete(sessionId);
  }
}

export const bashTool: Tool<typeof BashSchema> = {
  name: 'bash',
  description: 'Run a shell command. Default 30s timeout.',
  risk: 'execute',
  inputSchema: BashSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    let session = sessions.get(ctx.sessionId);
    if (!session) {
      const proc = spawn(shellPath, ['-s'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSafeEnv(),
      });
      if (!proc.stdout || !proc.stderr || !proc.stdin) {
        throw new Error('Failed to create shell process: stdio pipes not available');
      }
      session = { cwd: input.workdir ?? process.cwd(), proc, buffer: '' };
      sessions.set(ctx.sessionId, session);

      proc.stdout.on('data', (chunk: Buffer) => { session!.buffer += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { session!.buffer += chunk.toString(); });
    }

    const startDir = `'${session.cwd.replace(/'/g, "'\\''")}'`;
    const fullCommand = `cd ${startDir} 2>/dev/null; ${input.command}; echo "EXIT:$?"`;

    const prevLen = session.buffer.length;
    if (session.proc.stdin) {
      session.proc.stdin.write(fullCommand + '\n');
    }

    const output = await waitForOutput(session, prevLen, input.timeout_ms, ctx);

    const exitMatch = output.match(/EXIT:(\d+)/);
    const cleanOutput = output.replace(/EXIT:\d+\n?$/, '').trim();
    const exitCode = exitMatch ? parseInt(exitMatch[1]!, 10) : -1;

    yield {
      type: 'tool_result',
      turnId: ctx.sessionId,
      result: {
        callId: 'bash',
        output: cleanOutput || `(exited with code ${exitCode})`,
        isError: exitCode !== 0,
      },
    };
  },
};

function waitForOutput(
  session: ShellSession,
  prevLen: number,
  timeoutMs: number,
  ctx: { signal: AbortSignal },
): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(session.buffer.slice(prevLen));
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      resolve(session.buffer.slice(prevLen));
    };
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    const check = () => {
      const newData = session.buffer.slice(prevLen);
      if (newData.includes('EXIT:')) {
        cleanup();
        resolve(newData);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      if (session.proc.stdout) session.proc.stdout.off('data', check);
      if (session.proc.stderr) session.proc.stderr.off('data', check);
      session.proc.off('exit', onExit);
    };

    const onExit = () => {
      cleanup();
      resolve(session.buffer.slice(prevLen));
    };

    if (session.proc.stdout) session.proc.stdout.on('data', check);
    if (session.proc.stderr) session.proc.stderr.on('data', check);
    session.proc.on('exit', onExit);
  });
}

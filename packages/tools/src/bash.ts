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
  description: 'Run a shell command in a persistent shell session. Default 30s timeout. Preserves cwd across calls.',
  risk: 'execute',
  inputSchema: BashSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    let session = sessions.get(ctx.sessionId);
    if (!session) {
      const proc = spawn('bash', ['-i'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'dumb' },
      });
      session = { cwd: input.workdir ?? process.cwd(), proc, buffer: '' };
      sessions.set(ctx.sessionId, session);

      proc.stdout!.on('data', (chunk: Buffer) => { session!.buffer += chunk.toString(); });
      proc.stderr!.on('data', (chunk: Buffer) => { session!.buffer += chunk.toString(); });
    }

    const startDir = `'${session.cwd.replace(/'/g, "'\\''")}'`;
    const fullCommand = `cd ${startDir} 2>/dev/null; ${input.command}; echo "EXIT:$?"`;

    const prevLen = session.buffer.length;
    session.proc.stdin!.write(fullCommand + '\n');

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
      session.proc.stdout!.off('data', check);
      session.proc.stderr!.off('data', check);
      session.proc.off('exit', onExit);
    };

    const onExit = () => {
      cleanup();
      resolve(session.buffer.slice(prevLen));
    };

    session.proc.stdout!.on('data', check);
    session.proc.stderr!.on('data', check);
    session.proc.on('exit', onExit);
  });
}

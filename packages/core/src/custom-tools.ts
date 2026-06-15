import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { Tool } from '@sentinel/shared';
import type { SentinelConfig } from './config-schema.js';

export function loadCustomTools(config: SentinelConfig): Tool[] {
  const entries = config.custom_tools;
  if (!entries || entries.length === 0) return [];

  return entries.map((entry) => {
    const inputSchema = z.object({});

    const tool: Tool<typeof inputSchema> = {
      name: entry.name,
      description: entry.description,
      risk: 'execute',
      inputSchema,
      async *execute(input, ctx) {
        if (ctx.signal.aborted) return;

        const command = entry.command.map((part) =>
          part === '$ARGS' ? JSON.stringify(input) : part,
        );
        const [cmd, ...args] = command;
        const timeoutMs = entry.timeout ?? 30_000;

        const child = spawn(cmd!, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: entry.environment
            ? { ...process.env, ...entry.environment }
            : process.env,
          signal: ctx.signal,
        });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
        }, timeoutMs);

        let stdout = '';
        let stderr = '';

        try {
          const inputJson = JSON.stringify(input);
          child.stdin!.write(inputJson);
          child.stdin!.end();

          for await (const chunk of child.stdout!) {
            stdout += chunk.toString();
          }

          for await (const chunk of child.stderr!) {
            stderr += chunk.toString();
          }

          const exitCode = await new Promise<number | null>((resolve) => {
            child.on('close', resolve);
          });

          clearTimeout(timeout);

          const output = exitCode === 0
            ? stdout
            : stderr
              ? `Exit code ${exitCode}: ${stderr}`
              : `Exit code ${exitCode}`;

          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: entry.name,
              output: output || '(no output)',
              isError: exitCode !== 0,
            },
          };
        } catch (err) {
          clearTimeout(timeout);
          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: entry.name,
              output: `Error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            },
          };
        }
      },
    };

    return tool;
  });
}

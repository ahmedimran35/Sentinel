import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

export interface BashResult {
  command: string;
  output: string;
  exitCode: number;
  error?: string;
}

export class BashPrefixHandler {
  private timeoutMs: number;
  private maxOutputLength: number;

  constructor(timeoutMs = 30_000, maxOutputLength = 50_000) {
    this.timeoutMs = timeoutMs;
    this.maxOutputLength = maxOutputLength;
  }

  isBashCommand(input: string): boolean {
    const trimmed = input.trim();
    return trimmed.startsWith('!') && trimmed.length > 1;
  }

  extractCommand(input: string): string {
    const trimmed = input.trim();
    return trimmed.slice(1).trim();
  }

  async execute(input: string): Promise<BashResult> {
    const command = this.extractCommand(input);
    if (!command) {
      return { command: '', output: '', exitCode: 1, error: 'No command provided after !' };
    }

    try {
      const options: SpawnSyncOptions = {
        timeout: this.timeoutMs,
        maxBuffer: this.maxOutputLength,
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe',
      };

      const result = spawnSync('sh', ['-c', command], options);
      const stdout = String(result.stdout ?? '');
      const stderr = String(result.stderr ?? '');

      if (result.error || result.status !== 0) {
        const exitCode = result.status ?? -1;
        const errorOutput = [result.error?.message ?? '', stderr].filter(Boolean).join('\n');
        return {
          command,
          output: errorOutput.slice(0, this.maxOutputLength),
          exitCode,
          error: `Exit code ${exitCode}`,
        };
      }

      let output = stdout;
      if (output.length > this.maxOutputLength) {
        output = output.slice(0, this.maxOutputLength) + `\n... (truncated at ${this.maxOutputLength} chars)`;
      }

      return {
        command,
        output,
        exitCode: 0,
      };
    } catch (err) {
      if (err instanceof Error) {
        const stderr = 'stderr' in err ? (err as Error & { stderr: string }).stderr : '';
        const message = err.message;

        if ('status' in err && err.status !== undefined) {
          const exitCode = err.status as number;
          const combined = [message, stderr].filter(Boolean).join('\n');
          return {
            command,
            output: combined.slice(0, this.maxOutputLength),
            exitCode,
            error: `Exit code ${exitCode}`,
          };
        }

        if (err.name === 'TimeoutError' || message.includes('timed out')) {
          return {
            command,
            output: message,
            exitCode: -1,
            error: 'Command timed out',
          };
        }

        return {
          command,
          output: message.slice(0, this.maxOutputLength),
          exitCode: -1,
          error: message,
        };
      }

      return {
        command,
        output: String(err).slice(0, this.maxOutputLength),
        exitCode: -1,
        error: String(err),
      };
    }
  }

  formatToolResult(result: BashResult): string {
    const header = `$ ${result.command}`;
    if (result.exitCode !== 0) {
      return `\`\`\`\n${header}\n${result.output || result.error}\n\`\`\`\n*Exit code: ${result.exitCode}*`;
    }
    if (!result.output.trim()) {
      return `\`\`\`\n${header}\n\`\`\`\n*Command completed (exit 0)*`;
    }
    return `\`\`\`\n${header}\n${result.output}\n\`\`\``;
  }
}

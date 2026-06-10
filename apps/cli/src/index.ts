#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('sentinel')
  .description('Terminal-native AI coding agent')
  .version(pkg.version ?? '0.1.0');

program
  .command('run <prompt>')
  .description('Run a single prompt in headless mode')
  .option('-m, --model <model>', 'Model to use', 'claude-sonnet-4-20250514')
  .option('-p, --provider <provider>', 'Provider to use', 'anthropic')
  .option('--mode <mode>', 'Permission mode: plan|build|auto|yolo', 'auto')
  .option('--max-turns <n>', 'Maximum turns', '50')
  .option('--timeout <ms>', 'Timeout in milliseconds', '120000')
  .action(async (prompt: string, opts: Record<string, string>) => {
    const { runAgent } = await import('@sentinel/sdk');
    const result = await runAgent(prompt, {
      provider: opts.provider ?? 'anthropic',
      model: opts.model ?? 'claude-sonnet-4-20250514',
      mode: (opts.mode ?? 'auto') as 'plan' | 'build' | 'auto' | 'yolo',
      maxTurns: parseInt(opts.maxTurns ?? '50', 10),
      timeoutMs: parseInt(opts.timeout ?? '120000', 10),
    });
    for (const msg of result.messages) {
      process.stdout.write(msg);
    }
    process.stdout.write('\n');
    process.exit(result.status === 'error' ? 1 : 0);
  });

program
  .command('interactive')
  .alias('i')
  .description('Start interactive TUI mode')
  .option('-m, --model <model>', 'Model to use', 'claude-sonnet-4-20250514')
  .option('-p, --provider <provider>', 'Provider to use', 'anthropic')
  .option('--mode <mode>', 'Permission mode: plan|build|auto|yolo', 'auto')
  .action(async (opts: Record<string, string>) => {
    const React = await import('react');
    const ink = await import('ink');
    const tui = await import('@sentinel/tui');
    const providers = await import('@sentinel/providers');
    const tools = await import('@sentinel/tools');
    const core = await import('@sentinel/core');

    const model = opts.model ?? 'claude-sonnet-4-20250514';
    const mode = (opts.mode ?? 'auto') as 'plan' | 'build' | 'auto' | 'yolo';

    const anthropicProvider = new providers.AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model,
    });
    const bus = new core.EventBus();
    const abort = new AbortController();
    const events: Array<import('@sentinel/sdk').SentinelEvent> = [];

    bus.on('*', (e) => { events.push(e); });

    const { waitUntilExit } = ink.render(
      React.createElement(tui.SentinelApp, {
        projectName: process.cwd().split('/').pop(),
        modelName: model,
        mode,
        events,
        onSend: async (msg: string) => {
          if (msg === '/exit') { abort.abort(); process.exit(0); }
          const stream = core.runTurn({
            turnId: Date.now().toString(36),
            config: { maxTurns: 50, timeoutMs: 120_000 },
            systemPrompt: 'You are Sentinel, an AI coding assistant.',
            history: [{ role: 'user', content: msg }],
            tools: [
              tools.readFileTool, tools.writeFileTool, tools.editFileTool,
              tools.bashTool, tools.globTool, tools.grepTool, tools.todoTool, tools.webFetchTool,
            ],
            provider: anthropicProvider,
            gate: new core.AlwaysAllowGate(),
            signal: abort.signal,
            onEvent: (e) => { events.push(e); },
          });
          for await (const _event of stream) {
            // events pushed via onEvent callback
          }
        },
      }),
    );

    process.on('SIGINT', () => { abort.abort(); process.exit(0); });
    await waitUntilExit();
  });

program.parse(process.argv);

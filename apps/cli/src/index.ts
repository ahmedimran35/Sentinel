#!/usr/bin/env node

import { Command } from 'commander';
import { DEFAULT_MODEL, BUILTIN_MODELS, type Tool } from '@sentinel/shared';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// Fast-path for --version / --help — zero heavy imports
const ARGV = process.argv;
if (ARGV.includes('--version') || ARGV.includes('-v')) {
  const pkg = createRequire(import.meta.url)('../package.json');
  console.log(pkg.version ?? '0.1.0');
  process.exit(0);
}
if (ARGV.includes('--help') || ARGV.includes('-h')) {
  console.log('Sentinel — Terminal-native AI coding agent');
  console.log('Usage: sentinel [command] [options]');
  console.log('Commands:');
  console.log('  interactive  Start interactive TUI session');
  console.log('  serve        Start HTTP server (for VS Code / web)');
  console.log('  --version    Show version');
  console.log('  --help       Show this help');
  process.exit(0);
}

// Enable V8 compile cache (Node 22+)
try {
  const { module: nodeModule } = await import('node:module');
  const mod = nodeModule as { enableCompileCache?: () => void };
  if (typeof mod.enableCompileCache === 'function') {
    mod.enableCompileCache();
  }
} catch { /* compile cache not available, continue */ }

import type { Config, ProviderRegistry, ProjectFs, McpRegistry, Session, CompactionPolicy } from '@sentinel/core';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('sentinel')
  .description('Terminal-native AI coding agent')
  .version(pkg.version ?? '0.1.0')
  .helpOption('-h, --help', 'Display help for command')
  .option('--print-logs', 'Print logs to stdout')
  .option('--log-level <level>', 'Log level: DEBUG|INFO|WARN|ERROR')
  .option('--pure', 'Run without plugins');

function getApiKey(provider: string): string {
  if (provider === 'nim') return process.env.NVIDIA_API_KEY ?? process.env.NIM_API_KEY ?? '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY ?? '';
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY ?? '';
  if (provider === 'custom') return process.env.CUSTOM_API_KEY ?? process.env.SENTINEL_API_KEY ?? '';
  return process.env.ANTHROPIC_API_KEY ?? '';
}

function createProvider(
  providerName: string,
  model: string,
  _mode: string,
) {
  const providers = {
    async anthropic() {
      const { AnthropicProvider } = await import('@sentinel/providers');
      return new AnthropicProvider({ apiKey: getApiKey('anthropic'), model });
    },
    async nim() {
      const { createNIMProvider } = await import('@sentinel/providers');
      return createNIMProvider({ apiKey: getApiKey('nim'), model });
    },
    async openai() {
      const { createOpenAIProvider } = await import('@sentinel/providers');
      return createOpenAIProvider({ apiKey: getApiKey('openai'), model, baseUrl: 'https://api.openai.com/v1' });
    },
    async openrouter() {
      const { createOpenAIProvider } = await import('@sentinel/providers');
      return createOpenAIProvider({ apiKey: getApiKey('openrouter'), model, baseUrl: 'https://openrouter.ai/api/v1' });
    },
    async custom() {
      const { createOpenAIProvider } = await import('@sentinel/providers');
      const baseUrl = process.env.CUSTOM_BASE_URL ?? 'https://api.openai.com/v1';
      const customModel = process.env.CUSTOM_MODEL ?? model;
      return createOpenAIProvider({ apiKey: getApiKey('custom'), model: customModel, baseUrl });
    },
  };

  const factory = (providers as Record<string, () => Promise<unknown>>)[providerName];
  if (!factory) throw new Error(`Unknown provider: ${providerName} (try: anthropic, nim, openai, openrouter, custom)`);
  return factory() as Promise<{ costPer1kTokens: { input: number; output: number }; streamChat: Function }>;
}

program
  .command('run <prompt>')
  .description('Run a single prompt in headless mode')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .option('-p, --provider <provider>', 'Provider (anthropic|nim|openai|openrouter|custom)', 'anthropic')
  .option('--mode <mode>', 'Permission mode: plan|build|auto|yolo', 'auto')
  .option('--max-turns <n>', 'Maximum turns', '50')
  .option('--timeout <ms>', 'Timeout in milliseconds', '120000')
  .option('--attach <url>', 'Attach to remote server URL')
  .option('--password <password>', 'Password for remote server')
  .option('--username <username>', 'Username for remote server')
  .option('--share', 'Auto-share session')
  .option('-f, --file <files...>', 'Attach files to message')
  .option('--format <format>', 'Output format (default|json)', 'default')
  .option('--title <title>', 'Session title')
  .option('--variant <variant>', 'Reasoning effort variant')
  .option('--thinking', 'Show thinking blocks')
  .option('--dangerously-skip-permissions', 'Skip all permission prompts')
  .option('--dir <dir>', 'Working directory')
  .option('--port <port>', 'Port number for remote')
  .action(async (prompt: string, opts: Record<string, string>) => {
    const core = await import('@sentinel/core');
    const tools = await import('@sentinel/tools');
    const providerName = opts.provider ?? 'anthropic';
    const model = opts.model ?? (providerName === 'custom' ? (process.env.CUSTOM_MODEL ?? 'gpt-4o') : DEFAULT_MODEL);
    const apiKey = getApiKey(providerName);
    if (!apiKey) {
      const varName = providerName === 'nim' ? 'NVIDIA_API_KEY' : providerName === 'openai' ? 'OPENAI_API_KEY' : providerName === 'custom' ? 'CUSTOM_API_KEY' : 'ANTHROPIC_API_KEY';
      console.error(`Error: ${varName} not set`);
      process.exit(1);
    }

    const signal = new AbortController();
    process.on('SIGINT', () => { signal.abort(); });

    // Discover tools + MCP
    const availableTools = await core.discoverTools();

    // Also add tools that discoverTools might miss (legacy)
    const extraTools = [
      tools.readFileTool, tools.writeFileTool, tools.editFileTool,
      tools.bashTool, tools.globTool, tools.grepTool, tools.listTool,
      tools.todoTool, tools.webFetchTool, tools.webSearchTool,
      tools.applyPatchTool, tools.questionTool, tools.skillTool,
    ].filter(Boolean);
    for (const t of extraTools) {
      if (!availableTools.find((existing: Tool) => existing.name === t.name)) {
        availableTools.push(t);
      }
    }

    const proxyConfig = core.loadProxyConfig();

    // Load config for compaction settings
    let compaction: CompactionPolicy | undefined;
    try {
      const config = await core.loadConfig({ projectRoot: opts.dir ?? process.cwd() });
      if (config.compaction) {
        compaction = {
          auto: config.compaction.auto ?? true,
          prune: config.compaction.prune ?? true,
          reserved: config.compaction.reserved ?? 0,
        };
      }
    } catch {
      // No config file — that's fine, use defaults
    }

    const engine = new core.Engine({
      systemPrompt: `You are Sentinel, a terminal-native AI coding agent running on ${providerName} (model: ${model}). Rules: 1) Use write_file with path+content to create files. 2) Use bash to run commands. 3) Be concise.`,
      turnConfig: {
        maxTurns: parseInt(opts.maxTurns ?? '50', 10),
        timeoutMs: parseInt(opts.timeout ?? '120000', 10),
      },
      tools: availableTools,
      projectRoot: opts.dir ?? process.cwd(),
      providerName,
      model,
      baseUrl: process.env.CUSTOM_BASE_URL,
      proxyConfig,
      statsTracker: new core.StatsTracker(),
      compaction,
    });

    const result = await engine.run(prompt, [], signal.signal);

    for (const event of result.events) {
      if (event.type === 'text_delta') {
        process.stdout.write(event.delta);
      }
      if (event.type === 'error') {
        process.stderr.write(`\nError: ${event.message}\n`);
      }
    }
    process.stdout.write('\n');

    engine.saveStats();
    process.exit(result.error ? 1 : 0);
  });

program
  .command('interactive')
  .aliases(['i', 'tui'])
  .description('Start interactive TUI mode')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .option('-p, --provider <provider>', 'Provider (anthropic|nim|openai|openrouter|custom)', 'anthropic')
  .option('--mode <mode>', 'Permission mode: plan|build|auto|yolo', 'auto')
  .option('-c, --continue', 'Continue last session')
  .option('-s, --session <id>', 'Session ID to continue')
  .option('--fork', 'Fork session when continuing')
  .option('--prompt <prompt>', 'Initial prompt')
  .option('--agent <agent>', 'Agent to use')
  .option('--port <port>', 'Port number')
  .option('--hostname <hostname>', 'Hostname')
  .option('--mdns', 'Enable mDNS discovery')
  .option('--mdns-domain <domain>', 'mDNS domain')
  .option('--cors <origins>', 'CORS origins (comma-separated)')
  .action(async (opts: Record<string, string>) => {
    const React = await import('react');
    const ink = await import('ink');
    const tui = await import('@sentinel/tui');
    const tools = await import('@sentinel/tools');
    const core = await import('@sentinel/core');
    const fs = await import('node:fs');
    const path = await import('node:path');

    let model = opts.model ?? DEFAULT_MODEL;
    const providerName = opts.provider ?? 'anthropic';
    let mode = (opts.mode ?? 'auto') as 'plan' | 'build' | 'auto' | 'yolo';

    const apiKey = getApiKey(providerName);
    if (!apiKey) {
      const varName = providerName === 'nim' ? 'NVIDIA_API_KEY' : providerName === 'custom' ? 'CUSTOM_API_KEY' : 'ANTHROPIC_API_KEY';
      console.error(`Error: ${varName} not set. Export it first:\n  export ${varName}="your-key-here"`);
      process.exit(1);
    }

    // Quick API connectivity check
    try {
      const checkUrl = providerName === 'nim'
        ? 'https://integrate.api.nvidia.com/v1/models'
        : providerName === 'custom'
          ? (process.env.CUSTOM_BASE_URL || 'https://api.openai.com/v1') + '/models'
          : 'https://api.anthropic.com/v1/messages';
      const checkRes = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!checkRes.ok) {
        console.error(`Error: ${providerName} API returned ${checkRes.status}. Check your API key and model name.`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: Cannot reach ${providerName} API:`, err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const buildSystemPrompt = () => `You are Sentinel, a terminal-native AI coding agent running on ${providerName} (model: ${model}).

Rules:
1. When asked to code or create files — use write_file with a "path" (e.g. "index.html") and "content". Never paste code in chat instead of saving.
2. write_file requires both "path" and "content" fields — always include both.
3. Never use bash or cat to create files. Only use write_file.
4. When asked to run commands — use bash.
5. For conversation, questions, greetings — no tools.
6. Be concise.

Working directory: ${process.cwd()}.`;

    let currentProvider = await createProvider(providerName, model, mode);
    const history: Array<{ role: string; content: string; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }> = [];

    // Set up command registry
    const commandRegistry = new core.CommandRegistry();
    for (const cmd of core.groupACommands) commandRegistry.register(cmd);
    for (const cmd of core.groupBCommands) commandRegistry.register(cmd);
    for (const cmd of core.groupCCommands) commandRegistry.register(cmd);
    for (const cmd of core.groupDCommands) commandRegistry.register(cmd);
    for (const cmd of core.groupECommands) commandRegistry.register(cmd);
    for (const cmd of core.groupFCommands) commandRegistry.register(cmd);
    for (const cmd of core.groupGCommands) commandRegistry.register(cmd);

    const logToFile = (m: unknown) => {
      try { fs.appendFileSync('/tmp/sentinel.log', `[cmd] ${String(m)}\n`); } catch { /* */ }
    };

    const projectRoot = process.cwd();
    const session: Session = {
      id: randomUUID(),
      history: history as Array<{ role: string; content: string | null; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }>,
      startTime: new Date(),
      tokenCounts: { input: 0, output: 0, cached: 0 },
      cost: 0,
    };

    const config: Config = { projectRoot, allowOutsideRoot: false, mode, model, theme: 'dark' };

    // Auto-load last session (only if no explicit --model/--mode flags)
    const argv = process.argv;
    const explicitModel = argv.some((a) => a === '-m' || a === '--model');
    const explicitMode = argv.some((a) => a === '--mode');

    const lastSession = core.findLastSession(projectRoot);
    if (lastSession && !explicitModel && !explicitMode) {
      session.id = lastSession.id;
      session.history = lastSession.history as typeof session.history;
      session.startTime = new Date(lastSession.startTime);
      session.tokenCounts = lastSession.tokenCounts;
      session.cost = lastSession.cost;
      config.model = lastSession.model;
      config.mode = lastSession.mode;
      model = lastSession.model;
      mode = lastSession.mode as 'plan' | 'build' | 'auto' | 'yolo';
    }
    if (lastSession && explicitModel) {
      // Only load history/tokens/cost, keep requested model
      session.id = lastSession.id;
      session.history = lastSession.history as typeof session.history;
      session.startTime = new Date(lastSession.startTime);
      session.tokenCounts = lastSession.tokenCounts;
      session.cost = lastSession.cost;
    }
    // Load config for compaction settings
    let compaction: CompactionPolicy | undefined;
    try {
      const cfg = await core.loadConfig({ projectRoot });
      if (cfg.compaction) {
        compaction = {
          auto: cfg.compaction.auto ?? true,
          prune: cfg.compaction.prune ?? true,
          reserved: cfg.compaction.reserved ?? 0,
        };
      }
    } catch {
      // No config file — use default compaction
    }

    const ctxMgr = compaction
      ? new core.ContextManager(128_000, (t: string) => Math.ceil(t.length / 4), 0.9, compaction)
      : null;

    const bus = new core.EventBus();

    const providers: ProviderRegistry = {
      getCurrent: () => ({ provider: providerName, model }),
      setCurrent: async (p: string, m: string) => {
        const newProvider = await createProvider(p, m, mode);
        currentProvider = newProvider;
        model = m;
        logToFile(`model switch: ${p}/${m}`);
      },
      validate: async (_p: string, _m: string) => true,
    };

    const projectFs: ProjectFs = {
      read: async (p: string) => fs.readFileSync(path.resolve(projectRoot, p), 'utf-8'),
      write: async (p: string, c: string) => fs.writeFileSync(path.resolve(projectRoot, p), c, 'utf-8'),
      exists: async (p: string) => { try { fs.accessSync(path.resolve(projectRoot, p)); return true; } catch { return false; } },
      resolve: (...segments: string[]) => path.resolve(projectRoot, ...segments),
    };

    const shadowGit = new core.ShadowGit(projectRoot);

    const mcpRegistry: McpRegistry = {
      listServers: () => [],
      addServer: async () => { logToFile('MCP add (stub)'); },
      removeServer: async () => { logToFile('MCP remove (stub)'); },
      rescan: async () => { logToFile('MCP rescan (stub)'); },
    };

    const globalSignal = new AbortController();

    // Global abort for SIGINT
    const abort = new AbortController();
    let requestAbort: AbortController | null = null;
    let rerender: ((el: unknown) => void) | null = null;

    const buildAppElement = () => {
      const historyEntries: Array<{ role: 'user' | 'assistant'; content: string; tokens?: number }> = [];
      for (const msg of session.history) {
        if (msg.role === 'user' && msg.content) {
          historyEntries.push({ role: 'user', content: msg.content, tokens: Math.ceil(msg.content.length / 4) });
        } else if (msg.role === 'assistant' && msg.content) {
          historyEntries.push({ role: 'assistant', content: msg.content, tokens: Math.ceil(msg.content.length / 4) });
        }
      }
      return React.createElement(tui.SentinelApp, {
        key: session.id,
        projectName: process.cwd().split('/').pop(),
        sessionId: session.id,
        modelName: model,
        mode,
        showToolOutput: (config as Record<string, unknown>).showToolOutput !== false,
        initialHistory: historyEntries,
        providers: [
          { name: 'anthropic', label: 'Anthropic' },
          { name: 'nim', label: 'NVIDIA NIM' },
          { name: 'openai', label: 'OpenAI' },
          { name: 'openrouter', label: 'OpenRouter' },
        ],
        commands: commandRegistry.all().map((c: { name: string; summary: string; usage: string; argHint?: string }) => ({
          name: c.name, summary: c.summary, usage: c.usage, argHint: c.argHint,
        })),
        onSend: sendToLLM,
        onConnectProvider: async (providerName: string, apiKey: string) => {
          // Use the same fetch logic as the /provider connect command
          const PROVIDER_API: Record<string, { modelsUrl: string; header: string }> = {
            anthropic: { modelsUrl: 'https://api.anthropic.com/v1/models', header: 'x-api-key' },
            nim: { modelsUrl: 'https://integrate.api.nvidia.com/v1/models', header: 'Authorization' },
            openai: { modelsUrl: 'https://api.openai.com/v1/models', header: 'Authorization' },
            openrouter: { modelsUrl: 'https://openrouter.ai/api/v1/models', header: 'Authorization' },
          };
          const info = PROVIDER_API[providerName];
          if (!info) throw new Error(`Unknown provider: ${providerName}`);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (info.header === 'Authorization') {
            headers['Authorization'] = `Bearer ${apiKey}`;
          } else {
            headers[info.header] = apiKey;
          }
          const res = await fetch(info.modelsUrl, { headers, signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
          return (body.data ?? []).map((entry) => String(entry.id ?? '')).sort();
        },
        onSwitchProvider: async (providerName: string, modelName: string) => {
          config.model = modelName;
          await providers.setCurrent(providerName, modelName);
          model = modelName;
          if (rerender) rerender(buildAppElement());
        },
        onPermissionResponse: (response: 'y' | 'a' | 'n' | 'd') => {
          const resolved = response === 'y' || response === 'a' ? 'approved' : 'denied';
          bus.emit({ type: 'permission_response', turnId: session.id, response: resolved });
        },
      });
    };

    const sendToLLM = async (msg: string, pushEvent: (e: import('@sentinel/sdk').SentinelEvent) => void) => {
      const unsub = bus.on('*', pushEvent);
      if (msg.startsWith('/')) {
        const handled = await runCommand(msg);
        unsub();
        if (handled) return;
      }
      unsub();

      // Context compaction check before turn
      if (ctxMgr) {
        ctxMgr.addMessage('user', msg);
        if (ctxMgr.shouldCompact()) {
          const result = ctxMgr.compact();
          pushEvent({
            type: 'compact_boundary',
            reason: `Context compacted: pruned ${result.pruned}, kept ${result.kept}`,
          });
        }
      }

      history.push({ role: 'user', content: msg });

      requestAbort?.abort();
      requestAbort = new AbortController();
      const turnTimeout = setTimeout(() => requestAbort!.abort(), 600_000);
      const combinedSignal = AbortSignal.any
        ? AbortSignal.any([abort.signal, requestAbort.signal])
        : abort.signal;

      const accumulatedCost = { usd: session.cost };
      const stream = core.runTurn({
        turnId: Date.now().toString(36),
        config: { maxTurns: 50, timeoutMs: 600_000 },
            systemPrompt: buildSystemPrompt(),
        history,
        tools: [
          tools.readFileTool, tools.writeFileTool, tools.editFileTool,
          tools.bashTool, tools.globTool, tools.grepTool, tools.todoTool,
          tools.webFetchTool, tools.webSearchTool, tools.applyPatchTool,
          tools.questionTool, tools.skillTool,
        ],
            provider: currentProvider as import('@sentinel/providers').Provider,
        gate: new core.InteractiveGate((e) => pushEvent(e), bus),
        signal: combinedSignal,
        accumulatedCost,
      });
      let assistantOutput = '';
      try {
        for await (const event of stream) {
          if (event.type === 'turn_end' && event.usage) {
            session.tokenCounts.input += event.usage.input;
            session.tokenCounts.output += event.usage.output;
            if (event.usage.cache_read) session.tokenCounts.cached += event.usage.cache_read;
            const costs = currentProvider.costPer1kTokens ?? { input: 0, output: 0 };
            session.cost += (event.usage.input * costs.input + event.usage.output * costs.output) / 1000;
          }
          if (event.type === 'text_delta') {
            assistantOutput += (event as { delta: string }).delta;
          }
          pushEvent(event);
        }
      } finally {
        clearTimeout(turnTimeout);
        requestAbort = null;
      }

      // Track assistant output in context manager
      if (ctxMgr && assistantOutput) {
        ctxMgr.addMessage('assistant', assistantOutput);
      }
    };

    const runCommand = async (line: string) => {
      const resolved = commandRegistry.resolve(line);
      if (!resolved) return false;
      const { cmd, rawArgs } = resolved;
      if (cmd.requiresGit) await shadowGit.init();

      const origModel = model;
      const origMode = mode;
      const origSessionId = session.id;

      await cmd.run({
        session, bus, config, providers, registry: commandRegistry,
        fs: projectFs, git: shadowGit, mcp: mcpRegistry,
        log: (m: unknown) => {
          logToFile(m);
          bus.emit({ type: 'text_delta', turnId: session.id, delta: String(m) + '\n' });
        },
        signal: globalSignal.signal,
      }, rawArgs);

      // Sync model/mode from config (commands modify config, not our local vars)
      model = config.model;
      mode = config.mode as 'plan' | 'build' | 'auto' | 'yolo';

      if (rerender && (model !== origModel || mode !== origMode || session.id !== origSessionId)) {
        rerender(buildAppElement());
      }
      return true;
    };

    const inkResult = ink.render(buildAppElement(), { maxFps: 12, patchConsole: true, exitOnCtrlC: true });
    rerender = inkResult.rerender as ((el: unknown) => void);
    const { waitUntilExit } = inkResult;

    process.on('SIGINT', () => {
      requestAbort?.abort();
      abort.abort();
      core.saveSession(projectRoot, session, config);
      bus.emit({ type: 'text_delta', turnId: session.id, delta: `\nSession saved: ${session.id}\nResume with: /sessions resume ${session.id}\n` });
      setTimeout(() => process.exit(0), 100);
    });
    await waitUntilExit();
  });

program
  .command('serve')
  .description('Start the HTTP API server')
  .option('-p, --port <port>', 'Port number', '4096')
  .option('--host <hostname>', 'Hostname', '127.0.0.1')
  .option('--password <password>', 'Auth password')
  .option('--no-auth', 'Disable authentication (not recommended)')
  .option('--cors <origins...>', 'CORS origins')
  .option('--mdns', 'Enable mDNS discovery')
  .option('--mdns-domain <domain>', 'mDNS domain')
  .action(async (opts: Record<string, string>) => {
    const { SentinelServer } = await import('@sentinel/server');
    const server = new SentinelServer({
      port: parseInt(opts.port ?? '4096', 10),
      hostname: opts.host ?? '127.0.0.1',
      password: opts.password ?? '',
      requireAuth: opts.noAuth !== 'true',
      cors: opts.cors ? (Array.isArray(opts.cors) ? opts.cors : [opts.cors]) : undefined,
      mdns: opts.mdns === 'true',
      mdnsDomain: opts.mdnsDomain,
    });
    await server.start();
    console.log(`Server running at ${server.url}`);
  });

const sessionCmd = program.command('session').description('Manage sessions');

sessionCmd
  .command('list')
  .description('List saved sessions')
  .option('-n, --max-count <n>', 'Maximum number of sessions to show')
  .option('--format <format>', 'Output format (table|json)', 'table')
  .action(async (opts: Record<string, string>) => {
    const { listSessions } = await import('@sentinel/core');
    const sessions = listSessions(process.cwd());
    if (sessions.length === 0) {
      console.log('No saved sessions.');
      return;
    }
    const count = opts.maxCount ? parseInt(opts.maxCount, 10) : sessions.length;
    const display = sessions.slice(0, count);
    if (opts.format === 'json') {
      process.stdout.write(JSON.stringify(display, null, 2));
      process.stdout.write('\n');
    } else {
      for (const s of display) {
        console.log(`${s.id.padEnd(24)} ${s.model.padEnd(32)} ${new Date(s.startTime).toISOString()}`);
      }
    }
  });

sessionCmd
  .command('show <id>')
  .description('Show session details')
  .action(async (id: string, _opts: Record<string, string>) => {
    const { loadSession } = await import('@sentinel/core');
    const s = loadSession(process.cwd(), id);
    if (!s) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(s, null, 2));
    process.stdout.write('\n');
  });

sessionCmd
  .command('delete <id>')
  .description('Delete a session')
  .action(async (id: string, _opts: Record<string, string>) => {
    const { removeSession } = await import('@sentinel/core');
    const removed = removeSession(process.cwd(), id);
    if (!removed) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }
    console.log(`Session deleted: ${id}`);
  });

program
  .command('config')
  .description('Show current configuration')
  .option('--json', 'Output as JSON')
  .action(async (opts: Record<string, string>) => {
    if (opts.json) {
      const cfg = {
        version: pkg.version,
        providers: {
          anthropic: { apiKey: process.env.ANTHROPIC_API_KEY ? '***' : null },
          nim: { apiKey: process.env.NVIDIA_API_KEY ? '***' : null },
          openai: { apiKey: process.env.OPENAI_API_KEY ? '***' : null },
          openrouter: { apiKey: process.env.OPENROUTER_API_KEY ? '***' : null },
          custom: {
            apiKey: process.env.CUSTOM_API_KEY ? '***' : null,
            baseUrl: process.env.CUSTOM_BASE_URL ?? null,
            model: process.env.CUSTOM_MODEL ?? null,
          },
        },
      };
      process.stdout.write(JSON.stringify(cfg, null, 2));
      process.stdout.write('\n');
    } else {
      console.log(`Sentinel v${pkg.version ?? '0.1.0'}`);
      console.log(`Project root: ${process.cwd()}`);
      console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '***' : '(not set)'}`);
      console.log(`NVIDIA_API_KEY: ${process.env.NVIDIA_API_KEY ? '***' : '(not set)'}`);
      console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '***' : '(not set)'}`);
      console.log(`OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? '***' : '(not set)'}`);
      console.log(`CUSTOM_API_KEY: ${process.env.CUSTOM_API_KEY ? '***' : '(not set)'}`);
      console.log(`CUSTOM_BASE_URL: ${process.env.CUSTOM_BASE_URL ?? '(not set)'}`);
      console.log(`CUSTOM_MODEL: ${process.env.CUSTOM_MODEL ?? '(not set)'}`);
    }
  });

const authCmd = program.command('auth').description('Manage authentication');

authCmd
  .command('test')
  .description('Test API key connectivity')
  .option('-p, --provider <provider>', 'Provider to test', 'anthropic')
  .action(async (opts: Record<string, string>) => {
    const provider = opts.provider ?? 'anthropic';
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      console.error(`No API key found for provider: ${provider}`);
      process.exit(1);
    }
    const urls: Record<string, string> = {
      anthropic: 'https://api.anthropic.com/v1/messages',
      nim: 'https://integrate.api.nvidia.com/v1/models',
      openai: 'https://api.openai.com/v1/models',
      openrouter: 'https://openrouter.ai/api/v1/models',
    };
    const url = urls[provider];
    if (!url) {
      console.error(`Unknown provider: ${provider}`);
      process.exit(1);
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log(`${provider} API: OK`);
        process.exit(0);
      } else {
        console.error(`${provider} API: FAILED (${res.status})`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`${provider} API: ERROR - ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

authCmd
  .command('login')
  .description('Interactive provider login')
  .option('--provider <provider>', 'Provider name')
  .option('--method <method>', 'Login method (api-key|oauth)')
  .action(async (opts: Record<string, string>) => {
    console.log(`Login initiated for provider: ${opts.provider ?? '(not specified)'}, method: ${opts.method ?? 'api-key'}`);
  });

authCmd
  .command('list')
  .description('List authenticated providers')
  .action(async () => {
    console.log('Authenticated providers:');
    const providers = ['anthropic', 'nim', 'openai', 'openrouter'];
    for (const p of providers) {
      const key = getApiKey(p);
      console.log(`  ${p}: ${key ? 'authenticated' : 'not configured'}`);
    }
  });

authCmd
  .command('logout [name]')
  .description('Logout from provider')
  .action(async (name: string) => {
    console.log(`Logged out from: ${name ?? 'all providers'}`);
  });

const mcpCmd = program.command('mcp').description('Manage MCP servers');

mcpCmd
  .command('list')
  .description('List configured MCP servers')
  .action(async (_opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const mcpPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp.json');
    try {
      const data = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      for (const [name, cfg] of Object.entries(data)) {
        console.log(`${name}: ${JSON.stringify(cfg)}`);
      }
    } catch {
      console.log('No MCP servers configured.');
    }
  });

mcpCmd
  .command('add <command> [args...]')
  .description('Add an MCP server')
  .action(async (command: string, args: string[], _opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const mcpDir = path.join(os.homedir(), '.config', 'sentinel');
    const mcpPath = path.join(mcpDir, 'mcp.json');
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch { /* new file */ }
    const name = path.basename(command);
    config[name] = { command, args };
    fs.mkdirSync(mcpDir, { recursive: true });
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`MCP server added: ${name}`);
  });

mcpCmd
  .command('remove <name>')
  .description('Remove an MCP server')
  .action(async (name: string, _opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const mcpPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp.json');
    try {
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      if (!(name in config)) {
        console.error(`MCP server not found: ${name}`);
        process.exit(1);
      }
      delete config[name];
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`MCP server removed: ${name}`);
    } catch {
      console.error(`MCP server not found: ${name}`);
      process.exit(1);
    }
  });

const mcpAuthCmd = mcpCmd.command('auth').description('MCP server authentication');

mcpAuthCmd
  .command('list')
  .description('List OAuth-capable servers and their status')
  .action(async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const mcpPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp.json');
    const authPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp-auth.json');

    let mcpData: Record<string, unknown> = {};
    try { mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')); } catch { /* */ }
    let authData: Record<string, unknown> = {};
    try { authData = JSON.parse(fs.readFileSync(authPath, 'utf-8')); } catch { /* */ }

    const servers = Object.keys(mcpData);
    if (servers.length === 0) {
      console.log('No MCP servers configured.');
      return;
    }

    for (const name of servers) {
      const cfg = mcpData[name] as Record<string, unknown>;
      const hasOAuth = !!(cfg.auth || (cfg.env as Record<string, string>)?.OAUTH_AUTHORIZE_URL);
      const authToken = (authData[name] as Record<string, unknown>)?.accessToken;
      const status = authToken ? 'authenticated' : hasOAuth ? 'oauth-ready' : 'no-oauth';
      console.log(`  ${name}: ${status}${authToken ? ` (token: ${(authToken as string).slice(0, 8)}...)` : ''}`);
    }
  });

mcpAuthCmd
  .argument('[name]', 'MCP server name')
  .option('--token <token>', 'Access token (set manually)')
  .option('--client-id <id>', 'OAuth client ID', 'sentinel-cli')
  .option('--scopes <scopes>', 'OAuth scopes (comma-separated)')
  .action(async (name: string | undefined, opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { spawn } = await import('node:child_process');

    if (!name) {
      mcpAuthCmd.help();
      return;
    }

    const mcpPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp.json');
    const authPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp-auth.json');

    let mcpData: Record<string, unknown> = {};
    try {
      mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch {
      console.error('No MCP servers configured.');
      process.exit(1);
    }

    const serverCfg = mcpData[name] as Record<string, unknown> | undefined;
    if (!serverCfg) {
      console.error(`MCP server "${name}" not found.`);
      process.exit(1);
    }

    let authData: Record<string, unknown> = {};
    try { authData = JSON.parse(fs.readFileSync(authPath, 'utf-8')); } catch { /* */ }

    if (opts.token) {
      const entry = ((authData[name] ?? {}) as Record<string, unknown>);
      entry.accessToken = opts.token;
      entry.updatedAt = new Date().toISOString();
      authData[name] = entry;
      fs.mkdirSync(path.dirname(authPath), { recursive: true });
      fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf-8');
      console.log(`Auth token stored for MCP server "${name}".`);
      return;
    }

    const authField = serverCfg.auth as Record<string, unknown> | undefined;
    const env = serverCfg.env as Record<string, string> | undefined;
    const authorizeUrl = authField?.authorizeUrl as string ?? env?.OAUTH_AUTHORIZE_URL ?? '';
    const tokenUrl = authField?.tokenUrl as string ?? env?.OAUTH_TOKEN_URL ?? '';
    const clientId = opts.clientId ?? (authField?.clientId as string) ?? 'sentinel-cli';
    const scopes = opts.scopes ?? (authField?.scopes as string) ?? '';

    if (!authorizeUrl && !tokenUrl) {
      console.log(`No OAuth configuration found for "${name}".`);
      console.log('  Provide a token with --token <token>, or');
      console.log('  add an "auth" block (authorizeUrl, tokenUrl) to the server entry in mcp.json.');
      process.exit(1);
    }

    console.log(`Starting OAuth flow for "${name}"...`);
    try {
      const deviceRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          scope: scopes || undefined,
          audience: name,
        }),
      });

      if (!deviceRes.ok) {
        console.log('Device authorization not supported; opening browser directly...');
        const authUrl = scopes
          ? `${authorizeUrl}?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&response_type=token`
          : `${authorizeUrl}?client_id=${encodeURIComponent(clientId)}&response_type=token`;
        const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        spawn(openCmd, [authUrl], { detached: true, stdio: 'ignore' });
        console.log(`Opened browser: ${authUrl}`);
        console.log('After authorizing, run: sentinel mcp auth ' + name + ' --token <your-token>');
        return;
      }

      const deviceData = (await deviceRes.json()) as Record<string, unknown>;
      const verificationUri = (deviceData.verification_uri_complete ?? deviceData.verification_uri) as string;
      const deviceCode = deviceData.device_code as string;
      const interval = (deviceData.interval as number) ?? 5;

      if (verificationUri) {
        const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        spawn(openCmd, [verificationUri], { detached: true, stdio: 'ignore' });
      }
      console.log(`Browser opened. Complete authorization at the prompt.`);
      console.log(`If the browser doesn't open, visit: ${verificationUri ?? authorizeUrl}`);

      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, interval * 1000));
        try {
          const pollRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          });
          const pollData = (await pollRes.json()) as Record<string, unknown>;
          if (pollData.access_token) {
            const entry: Record<string, unknown> = {
              accessToken: pollData.access_token,
              tokenType: pollData.token_type ?? 'Bearer',
              scope: pollData.scope ?? scopes,
              expiresAt: pollData.expires_in ? new Date(Date.now() + (pollData.expires_in as number) * 1000).toISOString() : undefined,
              updatedAt: new Date().toISOString(),
            };
            authData[name] = entry;
            fs.mkdirSync(path.dirname(authPath), { recursive: true });
            fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf-8');
            console.log(`Successfully authenticated for "${name}".`);
            return;
          }
          if (pollData.error === 'authorization_pending') continue;
          if (pollData.error === 'slow_down') { await new Promise((r) => setTimeout(r, 1000)); continue; }
          if (pollData.error) {
            console.error(`OAuth error: ${pollData.error}`);
            process.exit(1);
          }
        } catch { /* poll failed, retry */ }
      }
      console.error('Authorization timed out.');
      process.exit(1);
    } catch (err) {
      console.error(`OAuth flow failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

mcpCmd
  .command('logout')
  .description('Remove OAuth credentials for an MCP server')
  .argument('[name]', 'MCP server name (omit to clear all)')
  .action(async (name: string | undefined) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const authPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp-auth.json');

    let authData: Record<string, unknown> = {};
    try { authData = JSON.parse(fs.readFileSync(authPath, 'utf-8')); } catch {
      console.log('No auth credentials found.');
      return;
    }

    if (name) {
      if (!(name in authData)) {
        console.error(`No auth credentials found for "${name}".`);
        process.exit(1);
      }
      delete authData[name];
      console.log(`Auth credentials removed for "${name}".`);
    } else {
      const count = Object.keys(authData).length;
      authData = {};
      console.log(`Auth credentials cleared for ${count} server(s).`);
    }
    fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf-8');
  });

mcpCmd
  .command('debug')
  .description('Debug OAuth connection for an MCP server')
  .argument('<name>', 'MCP server name')
  .action(async (name: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { spawn } = await import('node:child_process');

    const mcpPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp.json');
    const authPath = path.join(os.homedir(), '.config', 'sentinel', 'mcp-auth.json');

    let mcpData: Record<string, unknown> = {};
    try { mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')); } catch {
      console.error('No MCP servers configured.');
      process.exit(1);
    }

    const serverCfg = mcpData[name] as Record<string, unknown> | undefined;
    if (!serverCfg) {
      console.error(`MCP server "${name}" not found.`);
      process.exit(1);
    }

    console.log(`Debugging MCP server: ${name}`);
    console.log(`  Config: ${JSON.stringify(serverCfg, null, 4)}`);

    let authData: Record<string, unknown> = {};
    try {
      authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch { /* */ }

    const authEntry = authData[name] as Record<string, unknown> | undefined;
    if (authEntry?.accessToken) {
      console.log(`  Auth: token present (${(authEntry.accessToken as string).slice(0, 8)}...)`);
      if (authEntry.expiresAt) {
        const expires = new Date(authEntry.expiresAt as string);
        const now = new Date();
        console.log(`  Token expires: ${expires.toISOString()}${expires < now ? ' (EXPIRED)' : ' (valid)'}`);
      }
    } else {
      console.log(`  Auth: no token stored`);
    }

    const hasOAuth = !!(serverCfg.auth || (serverCfg.env as Record<string, string>)?.OAUTH_AUTHORIZE_URL);
    console.log(`  OAuth capable: ${hasOAuth ? 'yes' : 'no'}`);

    console.log(`  Testing connection...`);
    const cmd = serverCfg.command as string;
    const args = (serverCfg.args as string[]) ?? [];
    const env = (serverCfg.env as Record<string, string>) ?? {};

    if (authEntry?.accessToken) {
      env.SENTINEL_MCP_TOKEN = authEntry.accessToken as string;
    }

    try {
      const child = spawn(cmd, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      });

      const initMsg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sentinel', version: '0.1.0' } } });
      child.stdin!.write(initMsg + '\n');

      const output = await new Promise<string>((resolve, reject) => {
        let data = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 8000);
        child.stdout!.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes('\n')) {
            clearTimeout(timer);
            child.kill();
            resolve(data);
          }
        });
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('exit', (code) => { clearTimeout(timer); if (!data) reject(new Error(`exited with code ${code}`)); else resolve(data); });
      });

      console.log(`  Connection: OK`);
      const lines = output.trim().split('\n');
      for (const line of lines.slice(0, 5)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.result) {
            console.log(`  Server info: ${JSON.stringify(parsed.result.serverInfo ?? parsed.result, null, 4)}`);
          }
        } catch { /* */ }
      }
    } catch (err) {
      console.error(`  Connection: FAILED`);
      console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

const agentCmd = program.command('agent').description('Manage agents');

agentCmd
  .command('create')
  .description('Interactive agent creation wizard')
  .option('--path <path>', 'Agent file or directory path')
  .option('--description <text>', 'Agent description')
  .option('--mode <mode>', 'Agent mode (all|primary|subagent)', 'all')
  .option('--permissions <list>', 'Comma-separated allowed permissions (bash,read,edit,glob,grep,webfetch,websearch,question)')
  .option('--model <model>', 'Default model')
  .action(async (opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const readline = await import('node:readline');

    const allPerms = ['bash', 'read', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'question'];
    const hasAllOpts = opts.path && opts.description && opts.permissions;

    function kebabify(s: string): string {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
    }

    // --- Gather inputs ---
    let targetDir: string;
    let description: string;
    let identifier: string;
    let mode: string;
    let model: string | undefined;
    let allowedPerms: string[];

    if (hasAllOpts) {
      // Non-interactive mode
      targetDir = path.resolve(opts.path!);
      description = opts.description!;
      identifier = kebabify(description);
      mode = opts.mode ?? 'all';
      model = opts.model || undefined;
      allowedPerms = opts.permissions!.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      // Interactive mode
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

      // 1. Path selection
      if (opts.path) {
        targetDir = path.resolve(opts.path);
      } else {
        const globalDir = path.join(os.homedir(), '.config', 'sentinel', 'agents');
        const projectDir = path.join(process.cwd(), '.sentinel', 'agents');
        const ans = await ask(
          `Where to save the agent?\n  1) Global (~/.config/sentinel/agents/)\n  2) Project (.sentinel/agents/)\n  Choice (1-2): `
        );
        targetDir = ans.trim() === '2' ? projectDir : globalDir;
      }

      // 2. Description
      description = opts.description || '';
      while (!description.trim()) {
        const ans = await ask('Agent description: ');
        description = ans.trim();
      }

      // 3. Identifier
      identifier = kebabify(description);
      const idAns = await ask(`Agent identifier [${identifier}]: `);
      if (idAns.trim()) identifier = kebabify(idAns.trim());

      // 4. Mode
      if (opts.mode) {
        mode = opts.mode;
      } else {
        const ans = await ask('Agent mode (primary/subagent/all) [all]: ');
        mode = ans.trim() || 'all';
      }

      // 5. Permissions
      if (opts.permissions) {
        allowedPerms = opts.permissions.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        allowedPerms = [];
        console.log('Select permissions to ALLOW (anything not selected is denied):');
        for (const perm of allPerms) {
          const ans = await ask(`  Allow "${perm}"? (y/N): `);
          if (ans.trim().toLowerCase() === 'y') allowedPerms.push(perm);
        }
      }

      // 6. Model
      if (opts.model) {
        model = opts.model;
      } else {
        const ans = await ask('Model override (e.g. anthropic/claude-sonnet-4, or empty for default): ');
        model = ans.trim() || undefined;
      }

      rl.close();
    }

    // --- Determine final file path ---
    let filePath: string;
    try {
      if (fs.statSync(targetDir).isDirectory()) {
        filePath = path.join(targetDir, `${identifier}.md`);
      } else {
        filePath = targetDir;
      }
    } catch {
      // Path doesn't exist -- treat as directory and create
      filePath = path.join(targetDir, `${identifier}.md`);
    }

    // --- Compute denied permissions ---
    const deniedPerms = allPerms.filter(p => !allowedPerms.includes(p));

    // --- Build YAML frontmatter ---
    let content = '---\n';
    content += `description: ${description}\n`;
    content += `mode: ${mode}\n`;
    if (model) content += `model: ${model}\n`;
    if (deniedPerms.length > 0) {
      content += 'permission:\n';
      for (const perm of deniedPerms) content += `  ${perm}: deny\n`;
    }
    content += '---\n';
    content += '\nGenerate responses based on this agent\'s purpose.\n';

    // --- Write file ---
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`\nAgent created: ${filePath}`);
  });

agentCmd
  .command('list')
  .description('List all available agents')
  .action(async () => {
    console.log('Available agents: (none configured)');
  });

program
  .command('models')
  .description('List available models from configured providers')
  .argument('[provider]', 'Provider name')
  .option('--refresh', 'Refresh model cache')
  .option('--verbose', 'Show detailed model info')
  .action(async (providerFilter: string, opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    const cacheDir = path.join(os.homedir(), '.config', 'sentinel');
    const cacheFile = path.join(cacheDir, 'models-cache.json');

    const ANTHROPIC_MODELS = [...BUILTIN_MODELS];

    const configured: Array<{ name: string; apiKey: string; modelsUrl?: string }> = [
      { name: 'anthropic', apiKey: getApiKey('anthropic') },
      { name: 'openai', apiKey: getApiKey('openai'), modelsUrl: 'https://api.openai.com/v1/models' },
      { name: 'nim', apiKey: getApiKey('nim'), modelsUrl: 'https://integrate.api.nvidia.com/v1/models' },
      { name: 'openrouter', apiKey: getApiKey('openrouter'), modelsUrl: 'https://openrouter.ai/api/v1/models' },
    ];

    // Custom provider uses its own baseUrl
    const customKey = getApiKey('custom');
    const customBaseUrl = process.env.CUSTOM_BASE_URL ?? 'https://api.openai.com/v1';
    if (customKey) {
      configured.push({ name: 'custom', apiKey: customKey, modelsUrl: `${customBaseUrl}/models` });
    }

    const active = configured
      .filter((p) => p.apiKey)
      .filter((p) => !providerFilter || p.name === providerFilter);

    if (active.length === 0) {
      if (providerFilter) {
        console.error(`Error: No API key configured for provider "${providerFilter}"`);
      } else {
        console.error('Error: No API keys configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, NVIDIA_API_KEY, or CUSTOM_API_KEY.');
      }
      process.exit(1);
    }

    // Use cache unless --refresh is passed (5 min TTL)
    if (!opts.refresh) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (Date.now() - (cached.timestamp ?? 0) < 300_000) {
          const filtered = providerFilter
            ? (cached.models ?? []).filter((m: string) => m.startsWith(providerFilter + '/'))
            : (cached.models ?? []);
          for (const m of filtered) console.log(m);
          if (opts.verbose) console.error(`  (cached ${filtered.length} models)`);
          return;
        }
      } catch { /* no cache */ }
    }

    const allModels: string[] = [];
    const errors: string[] = [];

    for (const p of active) {
      try {
        let models: string[] = [];

        if (p.name === 'anthropic') {
          models = ANTHROPIC_MODELS;
        } else {
          const res = await fetch(p.modelsUrl!, {
            headers: { Authorization: `Bearer ${p.apiKey}` },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) throw new Error(`${p.name} API returned ${res.status}`);
          const body = (await res.json()) as { data?: Array<{ id: string }> };
          models = (body.data ?? []).map((m) => m.id).sort();
        }

        for (const m of models) allModels.push(`${p.name}/${m}`);
        if (opts.verbose) console.error(`  ${p.name}: ${models.length} models`);
      } catch (err) {
        errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Persist cache
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), models: allModels }), 'utf-8');
    } catch { /* cache write is best-effort */ }

    for (const m of allModels) console.log(m);
    for (const e of errors) console.error(`  Error: ${e}`);
    if (errors.length > 0) process.exit(1);
  });

program
  .command('stats')
  .description('Show token usage and cost stats')
  .option('--days <n>', 'Number of days to show', '7')
  .option('--tools <n>', 'Top N tools to show', '10')
  .option('--models', 'Show per-model breakdown')
  .option('--project <name>', 'Filter by project')
  .action(async (opts: Record<string, string>) => {
    console.log(`Stats (last ${opts.days ?? 7} days):`);
    if (opts.project) console.log(`  Project: ${opts.project}`);
    console.log('  (StatsTracker stub — no data yet)');
  });

program
  .command('export')
  .description('Export session as JSON')
  .argument('[sessionID]', 'Session ID to export')
  .option('--sanitize', 'Sanitize sensitive data')
  .action(async (sessionID: string, opts: Record<string, string>) => {
    const { loadSession } = await import('@sentinel/core');
    const sid = sessionID || 'current';
    const s = loadSession(process.cwd(), sid);
    if (!s) {
      console.log(`Session not found: ${sid}. Exporting empty stub.`);
      process.stdout.write(JSON.stringify({ id: sid, exported: new Date().toISOString() }, null, 2));
      process.stdout.write('\n');
      return;
    }
    const data = opts.sanitize ? { ...s, history: '[sanitized]' } : s;
    process.stdout.write(JSON.stringify(data, null, 2));
    process.stdout.write('\n');
  });

program
  .command('import')
  .description('Import session from JSON file or URL')
  .argument('<source>', 'File path or URL')
  .action(async (source: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    try {
      let data: string;
      if (source.startsWith('http://') || source.startsWith('https://')) {
        const res = await fetch(source);
        data = await res.text();
      } else {
        data = fs.readFileSync(path.resolve(process.cwd(), source), 'utf-8');
      }
      const session = JSON.parse(data);
      console.log(`Imported session: ${session.id ?? '(unknown)'}`);
    } catch (err) {
      console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('web')
  .description('Start server and open web UI in browser')
  .option('--port <port>', 'Port number', '4096')
  .option('--hostname <hostname>', 'Hostname', '127.0.0.1')
  .option('--mdns', 'Enable mDNS discovery')
  .option('--cors <origins>', 'CORS origins (comma-separated)')
  .action(async (opts: Record<string, string>) => {
    const { SentinelServer } = await import('@sentinel/server');
    const server = new SentinelServer({
      port: parseInt(opts.port ?? '4096', 10),
      hostname: opts.hostname ?? '127.0.0.1',
      cors: opts.cors ? opts.cors.split(',').map((s: string) => s.trim()) : undefined,
      mdns: opts.mdns === 'true',
    });
    await server.start();
    const url = `http://${opts.hostname ?? '127.0.0.1'}:${opts.port ?? '4096'}`;
    console.log(`Web UI started at ${url}`);
  });

program
  .command('attach')
  .description('Attach TUI to a remote server')
  .argument('[url]', 'Remote server URL')
  .option('--dir <dir>', 'Working directory')
  .option('--continue', 'Continue last session')
  .option('--session <id>', 'Session ID to resume')
  .option('--fork', 'Fork session when continuing')
  .option('--password <password>', 'Server password')
  .option('--username <username>', 'Server username')
  .action(async (url: string, opts: Record<string, string>) => {
    const serverUrl = (url ?? 'http://127.0.0.1:4096').replace(/\/+$/, '');
    const withUsername = opts.username ?? '';
    const withPassword = opts.password ?? '';

    const authHeaders: Record<string, string> = {};
    if (withUsername && withPassword) {
      authHeaders['Authorization'] = 'Basic ' + Buffer.from(`${withUsername}:${withPassword}`).toString('base64');
    } else if (withPassword) {
      authHeaders['Authorization'] = 'Bearer ' + withPassword;
    }

    const api = async (path: string, init: RequestInit = {}) => {
      const merged: RequestInit = {
        ...init,
        headers: { ...authHeaders, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
      };
      const res = await fetch(`${serverUrl}${path}`, merged);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Server returned ${res.status}: ${body.slice(0, 200)}`);
      }
      return res;
    };

    // Health check
    console.log(`Attaching to ${serverUrl}${withUsername ? ` as ${withUsername}` : ''}...`);
    try {
      await api('/global/health');
    } catch (err) {
      console.error(`Error: cannot reach ${serverUrl} —`, err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // Session resolution
    let sessionId = opts.session;
    if (!sessionId && opts.continue) {
      try {
        const res = await api('/session');
        const data = await res.json() as Record<string, unknown>;
        const sessions = (data as { sessions?: Record<string, unknown> }).sessions ?? {};
        const keys = Object.keys(sessions);
        if (keys.length > 0) sessionId = keys[keys.length - 1];
      } catch { /* continue without session */ }
    }

    if (sessionId && opts.fork) {
      const forkRes = await api(`/session/${sessionId}/fork`, { method: 'POST' });
      const forkData = await forkRes.json() as { id: string };
      sessionId = forkData.id;
    } else if (!sessionId) {
      const createRes = await api('/session', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const createData = await createRes.json() as { id: string };
      sessionId = createData.id;
    }

    console.log(`  Session: ${sessionId}`);

    // Import TUI deps
    const React = await import('react');
    const ink = await import('ink');
    const tui = await import('@sentinel/tui');

    // SSE connection — forward remote events to TUI via pushEvent
    const sseAbort = new AbortController();
    let activePushEvent: ((e: import('@sentinel/sdk').SentinelEvent) => void) | null = null;

    const sanitizeJson = (raw: string): unknown => {
      return JSON.parse(raw, (_key, value) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const sanitized: Record<string, unknown> = {};
          for (const k of Object.keys(value)) {
            if (k !== '__proto__' && k !== 'constructor') {
              sanitized[k] = value[k];
            }
          }
          return sanitized;
        }
        return value;
      });
    };

    const connectSSE = async () => {
      try {
        const res = await fetch(`${serverUrl}/global/event`, {
          headers: authHeaders,
          signal: sseAbort.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const event = sanitizeJson(line.slice(6)) as import('@sentinel/sdk').SentinelEvent;
                  if (activePushEvent && (event as Record<string, unknown>).turnId === sessionId) {
                    activePushEvent(event);
                  }
                } catch { /* skip malformed SSE */ }
              }
            }
          }
        }
      } catch { /* SSE closed */ }
    };

    connectSSE();

    const buildAppElement = () => {
      return React.createElement(tui.SentinelApp, {
        key: sessionId,
        projectName: serverUrl.replace(/^https?:\/\//, ''),
        sessionId,
        modelName: 'remote',
        providers: [],
        onSend: async (msg: string, pushEvent: (e: import('@sentinel/sdk').SentinelEvent) => void) => {
          if (msg.startsWith('/')) {
            // Send slash-commands as shell commands to the server
            try {
              const res = await api(`/session/${sessionId}/command`, {
                method: 'POST',
                body: JSON.stringify({ command: msg.slice(1) }),
              });
              const data = await res.json() as Record<string, unknown>;
              const output = String(data.output ?? '');
              if (output) pushEvent({ type: 'text_delta', turnId: sessionId!, delta: output + '\n' } as import('@sentinel/sdk').SentinelEvent);
            } catch (err) {
              pushEvent({ type: 'error', turnId: sessionId!, message: err instanceof Error ? err.message : String(err) } as import('@sentinel/sdk').SentinelEvent);
            }
            return;
          }

          // Send message — events arrive via SSE in real-time
          activePushEvent = pushEvent;
          try {
            await api(`/session/${sessionId}/message`, {
              method: 'POST',
              body: JSON.stringify({ message: msg }),
              signal: AbortSignal.timeout(600_000),
            });
          } catch (err) {
            pushEvent({ type: 'error', turnId: sessionId!, message: err instanceof Error ? err.message : String(err) } as import('@sentinel/sdk').SentinelEvent);
          } finally {
            activePushEvent = null;
          }
        },
        onConnectProvider: async () => [],
        onSwitchProvider: async () => {},
      });
    };

    const inkResult = ink.render(buildAppElement(), { maxFps: 12 });
    const { waitUntilExit } = inkResult;

    process.on('SIGINT', () => sseAbort.abort());
    await waitUntilExit();
    sseAbort.abort();
  });

program
  .command('acp')
  .description('Start ACP protocol server over stdio')
  .option('--cwd <dir>', 'Working directory')
  .option('--port <port>', 'TCP port (omit for stdio)')
  .option('--hostname <hostname>', 'Hostname for TCP mode')
  .action(async (opts: Record<string, string>) => {
    const cwd = opts.cwd ?? process.cwd();
    const port = opts.port ? parseInt(opts.port, 10) : undefined;
    const hostname = opts.hostname ?? '127.0.0.1';

    const { createACPServer } = await import('@sentinel/core');
    const toolModule = await import('@sentinel/tools');

    const tools: Tool[] = [
      toolModule.readFileTool,
      toolModule.writeFileTool,
      toolModule.editFileTool,
      toolModule.bashTool,
      toolModule.globTool,
      toolModule.grepTool,
      toolModule.webFetchTool,
      toolModule.webSearchTool,
      toolModule.dispatchAgentTool,
      toolModule.lspDiagnosticsTool,
    ].filter((t): t is Tool => !!t);

    // MCP tools discovery
    let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];
    try {
      const { getMcpTools } = await import('@sentinel/core');
      const mcpToolInstances = await getMcpTools();
      mcpTools = mcpToolInstances.map((t: { name: string; description: string; inputSchema: unknown }) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      console.error(`  ACP: discovered ${mcpTools.length} MCP tools`);
    } catch { /* no MCP tools */ }

    const allTools = [
      ...tools.map((t: Tool) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      ...mcpTools,
    ];

    const server = createACPServer({ cwd, log: (msg: string) => console.error(`  ACP: ${msg}`) });

    server.on('tools/list', async () => ({
      tools: allTools,
    }));

    server.on('tools/call', async (params: Record<string, unknown>) => {
      const name = params.name as string;
      const args = params.arguments as Record<string, unknown> ?? {};
      const tool = tools.find((t: Tool) => t.name === name);
      if (!tool) {
        return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
      }
      try {
        const resultParts: string[] = [];
        const ctx = { sessionId: 'acp', signal: new AbortController().signal };
        for await (const event of tool.execute(args, ctx)) {
          if (event.type === 'tool_result' && event.result) {
            return { content: [{ type: 'text' as const, text: event.result.output }], isError: event.result.isError };
          }
          if (event.type === 'text_delta' && event.delta) {
            resultParts.push(event.delta);
          }
        }
        return { content: [{ type: 'text' as const, text: resultParts.join('') || '(no output)' }], isError: false };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
      }
    });

    console.error(`ACP server starting (cwd: ${cwd})${port ? ` on ${hostname}:${port}` : ' over stdio'}...`);

    if (port) {
      const { createServer } = await import('node:net');
      const tcpServer = createServer((socket) => {
        server.setIo(socket, socket);
        server.start().catch((e: Error) => console.error('ACP handler error:', e));
      });
      tcpServer.listen(port, hostname, () => {
        console.error(`ACP server listening on ${hostname}:${port}`);
      });
      tcpServer.on('error', (err: Error) => {
        console.error(`ACP server error: ${err.message}`);
        process.exit(1);
      });
    } else {
      server.start().catch((e: Error) => {
        console.error('ACP server error:', e);
        process.exit(1);
      });
    }
  });

program
  .command('plugin')
  .alias('plug')
  .description('Install a plugin from npm')
  .argument('<module>', 'npm module name')
  .option('--global', 'Install globally')
  .option('--force', 'Force reinstall')
  .action(async (module: string, opts: Record<string, string>) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const { spawnSync } = await import('node:child_process');

    const isGlobal = !!opts.global;
    const isForce = !!opts.force;

    console.log(`Installing plugin: ${module}${isGlobal ? ' (global)' : ''}${isForce ? ' (force)' : ''}`);

    try {
      const args = ['install', isGlobal && '-g', isForce && '--force', module].filter(Boolean) as string[];
      spawnSync('npm', args, { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to install ${module}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    const configDir = path.join(os.homedir(), '.config', 'sentinel');
    const configPath = path.join(configDir, 'opencode.json');
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch { /* new config */ }

    const plugins = (config.plugin as string[]) ?? [];
    if (plugins.includes(module)) {
      console.log(`Plugin "${module}" already in config.`);
    } else {
      plugins.push(module);
      config.plugin = plugins;
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`Added "${module}" to plugin config.`);
    }

    console.log(`Plugin "${module}" installed successfully.`);
  });

program
  .command('pr')
  .description('Fetch and checkout a GitHub PR, then run Sentinel')
  .argument('<number>', 'PR number')
  .action(async (number: string) => {
    const { GitHubAgent } = await import('@sentinel/core');
      const { spawnSync, spawn } = await import('node:child_process');

    const prNum = parseInt(number, 10);
    if (isNaN(prNum)) {
      console.error('Invalid PR number');
      process.exit(1);
    }

    const gh = new GitHubAgent();
    const authed = await gh.checkAuth();
    if (!authed) {
      console.error('gh CLI not authenticated. Run: gh auth login');
      process.exit(1);
    }

    console.log(`Fetching PR #${prNum}...`);
    let prInfo;
    try {
      prInfo = await gh.getPRInfo(prNum);
    } catch (err) {
      console.error(`Failed to fetch PR #${prNum}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    console.log(`\nPR #${prInfo.number}: ${prInfo.title}`);
    console.log(`  Author: ${prInfo.author}`);
    console.log(`  Branch: ${prInfo.head} -> ${prInfo.base}`);
    console.log(`  State: ${prInfo.state}`);
    console.log(`  URL: ${prInfo.url}\n`);

    const diff = await gh.reviewPR(prNum);
    const context = [
      `PR #${prNum}: ${prInfo.title}`,
      `Author: ${prInfo.author}`,
      `Description: ${prInfo.body}`,
      `\nDiff:\n${diff.slice(0, 10000)}`,
    ].join('\n');

    console.log('Checking out PR branch...');
    try {
      const { status } = spawnSync('gh', ['pr', 'checkout', prNum], { stdio: 'inherit' });
      if (status !== 0) throw new Error(`gh pr checkout exited with code ${status}`);
    } catch (err) {
      console.error(`Failed to checkout PR #${prNum}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    console.log('Launching interactive session with PR context...');
    const binPath = process.argv[1] || 'sentinel';
    const child = spawn(
      binPath,
      ['interactive', '--prompt', `Review PR #${prNum}: ${prInfo.title}`],
      { stdio: 'inherit', env: { ...process.env, SENTINEL_PR_CONTEXT: context } },
    );
    child.on('exit', (code: number | null) => process.exit(code ?? 0));
  });

program
  .command('db')
  .description('Database operations')
  .argument('[query]', 'Query string or "path"')
  .option('--format <format>', 'Output format: json|tsv')
  .action(async (query: string, opts: Record<string, string>) => {
    const os = await import('node:os');
    const path = await import('node:path');
    const dbDir = path.join(os.homedir(), '.local', 'share', 'sentinel');
    const dbFile = path.join(dbDir, 'sessions.json');
    if (query === 'path') {
      console.log(dbDir);
      return;
    }
    const fs = await import('node:fs');
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(fs.readFileSync(dbFile, 'utf-8')); } catch { /* no data */ }
    if (opts.format === 'tsv') {
      const sessions = (data.sessions ?? []) as Array<Record<string, unknown>>;
      for (const s of sessions) {
        console.log([s.id, s.model, s.startTime].join('\t'));
      }
    } else {
      process.stdout.write(JSON.stringify(data, null, 2));
      process.stdout.write('\n');
    }
  });

program
  .command('debug')
  .description('Debug utilities')
  .argument('[command]', 'Debug command: config|env|permissions|registry|config-resolved')
  .action(async (command: string) => {
    const core = await import('@sentinel/core');
    if (!command) {
      console.log('Debug commands: config, config-resolved, env, permissions, registry');
      return;
    }
    switch (command) {
      case 'config': {
        console.log(`Config path: ${process.cwd()}/sentinel.json`);
        break;
      }
      case 'config-resolved': {
        try {
          const config = await core.loadConfig({ projectRoot: process.cwd() });
          process.stdout.write(JSON.stringify(config, null, 2));
          process.stdout.write('\n');
        } catch (err) {
          console.error(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }
      case 'env':
        console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '***' : '(not set)'}`);
        console.log(`NVIDIA_API_KEY: ${process.env.NVIDIA_API_KEY ? '***' : '(not set)'}`);
        console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '***' : '(not set)'}`);
        console.log(`CUSTOM_API_KEY: ${process.env.CUSTOM_API_KEY ? '***' : '(not set)'}`);
        console.log(`CUSTOM_BASE_URL: ${process.env.CUSTOM_BASE_URL ?? '(not set)'}`);
        console.log(`CUSTOM_MODEL: ${process.env.CUSTOM_MODEL ?? '(not set)'}`);
        console.log(`OPENCODE_DISABLE_AUTOCOMPACT: ${process.env.OPENCODE_DISABLE_AUTOCOMPACT ?? '(not set)'}`);
        console.log(`OPENCODE_DISABLE_CLAUDE_CODE: ${process.env.OPENCODE_DISABLE_CLAUDE_CODE ?? '(not set)'}`);
        console.log(`OPENCODE_DISABLE_LSP_DOWNLOAD: ${process.env.OPENCODE_DISABLE_LSP_DOWNLOAD ?? '(not set)'}`);
        console.log(`OPENCODE_DISABLE_PRUNE: ${process.env.OPENCODE_DISABLE_PRUNE ?? '(not set)'}`);
        console.log(`OPENCODE_DISABLE_AUTOUPDATE: ${process.env.OPENCODE_DISABLE_AUTOUPDATE ?? '(not set)'}`);
        break;
      case 'permissions': {
        const bus = new core.EventBus();
        const gate = new core.InteractiveGate(() => {}, bus);
        console.log(`Gate type: ${gate.constructor.name}`);
        break;
      }
      case 'registry': {
        let count = 0;
        for (const _ of ['groupACommands', 'groupBCommands', 'groupCCommands', 'groupDCommands', 'groupECommands'] as const) {
          const arr = core[_];
          if (arr) count += arr.length;
        }
        console.log(`Command registry: ~${count} commands loaded`);
        break;
      }
      default:
        console.log(`Unknown debug command: ${command}`);
    }
  });

program
  .command('uninstall')
  .description('Uninstall Sentinel')
  .option('--keep-config', 'Keep configuration files')
  .option('--keep-data', 'Keep data files')
  .option('--dry-run', 'Show what would be deleted')
  .option('--force', 'Skip confirmation')
  .action(async (opts: Record<string, string>) => {
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const readline = await import('node:readline');

    const configDir = path.join(os.homedir(), '.config', 'sentinel');
    const dataDir = path.join(os.homedir(), '.local', 'share', 'sentinel');

    const dryRun = !!opts.dryRun;
    const force = !!opts.force;
    const keepConfig = !!opts.keepConfig;
    const keepData = !!opts.keepData;

    console.log(`Uninstalling Sentinel${dryRun ? ' (dry-run)' : ''}...`);

    if (!keepConfig) console.log(`  ${dryRun ? 'Would delete' : 'Delete'}: ${configDir}`);
    if (!keepData) console.log(`  ${dryRun ? 'Would delete' : 'Delete'}: ${dataDir}`);

    if (dryRun) {
      console.log('  (dry-run — no changes made)');
      return;
    }

    if (!force) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question('Are you sure you want to uninstall Sentinel? (y/N) ', resolve);
      });
      rl.close();
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('Uninstall cancelled.');
        return;
      }
    }

    let removed = false;
    if (!keepConfig) {
      try {
        await fs.rm(configDir, { recursive: true, force: true });
        console.log(`  Removed: ${configDir}`);
        removed = true;
      } catch (err) {
        console.error(`  Failed to remove ${configDir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!keepData) {
      try {
        await fs.rm(dataDir, { recursive: true, force: true });
        console.log(`  Removed: ${dataDir}`);
        removed = true;
      } catch (err) {
        console.error(`  Failed to remove ${dataDir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (removed) console.log('Sentinel has been uninstalled.');
  });

program
  .command('upgrade')
  .description('Upgrade Sentinel to latest version')
  .argument('[target]', 'Target version or "latest"')
  .option('--method <method>', 'Upgrade method (npm|pnpm|brew)', 'npm')
  .action(async (target: string, opts: Record<string, string>) => {
    const currentVersion = pkg.version ?? '0.1.0';
    const method = opts.method ?? 'npm';

    let targetVersion = target || 'latest';

    if (!target || target === 'latest') {
      try {
        const res = await fetch('https://registry.npmjs.org/sentinel-ai/latest');
        const data = (await res.json()) as { version?: string };
        targetVersion = data.version ?? 'latest';
      } catch (err) {
        console.error('Failed to fetch latest version from npm registry');
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    console.log(`Current version: ${currentVersion}`);
    if (targetVersion !== currentVersion) {
      console.log(`Target version: ${targetVersion}`);
    } else {
      console.log('Already up to date.');
      return;
    }

    console.log(`Upgrading to ${targetVersion} via ${method}...`);
    console.warn('Note: No integrity/signature verification is performed during upgrade.');

    const installCmds: Record<string, string> = {
      npm: `npm install -g sentinel-ai${targetVersion !== 'latest' ? `@${targetVersion}` : ''}`,
      pnpm: `pnpm add -g sentinel-ai${targetVersion !== 'latest' ? `@${targetVersion}` : ''}`,
      brew: 'brew upgrade sentinel-ai',
    };

    const cmd = installCmds[method];
    if (!cmd) {
      console.error(`Unknown method: ${method} (use: npm, pnpm, brew)`);
      process.exit(1);
    }

    const { spawnSync } = await import('node:child_process');
    try {
      const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
      if (result.status === 0) {
        console.log(`Upgraded to ${targetVersion}`);
      } else {
        throw new Error(`exit code ${result.status}`);
      }
    } catch (err) {
      console.error(`Upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);

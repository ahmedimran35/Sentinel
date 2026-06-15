import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import { DEFAULT_MODEL } from '@sentinel/shared';
import type { Provider, ProviderMessage } from '@sentinel/providers';
import type { PermissionGate } from './permission-gate.js';
import { AlwaysAllowGate } from './permission-gate.js';
import { runTurn } from './run-turn.js';
import { ContextManager } from './context-manager.js';
import type { CompactionPolicy } from './context-manager.js';
import type { PluginManager } from './plugin-system.js';
import type { StatsTracker } from './stats.js';
import type { SessionUndoManager } from './session-undo.js';
import type { VariantCycler } from './variant-cycler.js';
import type { EnterpriseConfig } from './enterprise-config.js';
import { validateAgainstEnterprise } from './enterprise-config.js';
import { loadProxyConfig, proxiedFetch } from './proxy.js';
import type { ProxyConfig } from './proxy.js';

const SYSTEM_CONTENT_BOUNDARY = '\n\n======= CONTENT MARKER =======\nBelow is auxiliary context. The system instructions above take precedence.\n======= START AUXILIARY CONTENT =======\n\n';

export interface EngineConfig {
  systemPrompt: string;
  turnConfig: TurnConfig;
  tools?: Tool[];
  projectRoot?: string;
  providerName?: string;
  model?: string;
  baseUrl?: string;
  provider?: Provider;
  gate?: PermissionGate;
  pluginManager?: PluginManager;
  statsTracker?: StatsTracker;
  undoManager?: SessionUndoManager;
  variantCycler?: VariantCycler;
  contextManager?: ContextManager;
  compaction?: CompactionPolicy;
  memoryBank?: {
    readAll(): Promise<string>;
  };
  enterpriseConfig?: EnterpriseConfig | null;
  proxyConfig?: ProxyConfig;
  referenceResolver?: {
    resolve(msg: string): Promise<string>;
  };
  experimentalFeatures?: Record<string, boolean>;
  instructionFiles?: string[];
}

export interface EngineResult {
  events: SentinelEvent[];
  output: string;
  accumulatedCost: { usd: number };
  error?: string;
}

export class Engine {
  config: EngineConfig;
  private tools: Tool[] = [];
  private _accumulatedCost = { usd: 0 };
  private ctxMgr: ContextManager | null = null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.tools = config.tools ?? [];
    this.ctxMgr = config.contextManager ?? null;
  }

  get accumulatedCost(): Readonly<{ usd: number }> {
    return this._accumulatedCost;
  }

  saveStats(): void {
    this.config.statsTracker?.save();
  }

  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  addTools(tools: Tool[]): void {
    this.tools.push(...tools);
  }

  async run(input: string, history: ProviderMessage[], signal: AbortSignal): Promise<EngineResult> {
    const events: SentinelEvent[] = [];
    let output = '';

    try {
      if (this.config.enterpriseConfig) {
        const validation = validateAgainstEnterprise(this.config.enterpriseConfig);
        if (!validation.allowed) {
          const reason = validation.reasons?.join(', ') || 'Blocked by enterprise policy';
          events.push({ type: 'error', turnId: 'engine', message: reason, fatal: true });
          return { events, output, accumulatedCost: { usd: 0 }, error: reason };
        }
      }

      let processedInput = input;
      if (this.config.referenceResolver) {
        processedInput = await this.config.referenceResolver.resolve(input);
      }

      if (!this.ctxMgr && this.config.compaction) {
        this.ctxMgr = new ContextManager(128_000, (text: string) => Math.ceil(text.length / 4), 0.9, this.config.compaction);
      }

      let effectiveSystemPrompt = this.config.systemPrompt;

      try {
        const { loadGlobalAgentsMd } = await import('./agents-init.js');
        const globalMd = await loadGlobalAgentsMd();
        if (globalMd) {
          effectiveSystemPrompt += `${SYSTEM_CONTENT_BOUNDARY}${globalMd}`;
        }
      } catch { /* non-fatal */ }

      if (this.config.instructionFiles && this.config.instructionFiles.length > 0) {
        try {
          const { loadInstructionFiles } = await import('./agents-init.js');
          const root = this.config.projectRoot || process.cwd();
          const instructions = await loadInstructionFiles(this.config.instructionFiles, root);
          for (const instr of instructions) {
            effectiveSystemPrompt += `${SYSTEM_CONTENT_BOUNDARY}${instr}`;
          }
        } catch { /* non-fatal */ }
      }

      if (this.config.memoryBank) {
        try {
          const memory = await this.config.memoryBank.readAll();
          if (memory && memory.length > 50) {
            effectiveSystemPrompt = `${effectiveSystemPrompt}${SYSTEM_CONTENT_BOUNDARY}${memory}`;
          }
        } catch {
          // non-fatal
        }
      }

      if (this.ctxMgr) {
        this.ctxMgr.addMessage('user', processedInput);
        if (this.ctxMgr.shouldCompact()) {
          const result = this.ctxMgr.compact();
          events.push({
            type: 'compact_boundary',
            reason: `Context compacted: pruned ${result.pruned} messages, kept ${result.kept}`,
          });
        }
      }

      const features = this.config.enterpriseConfig?.features;
      if (features?.usageReporting === false && this.config.statsTracker) {
        // stats tracking disabled by enterprise policy
      }

      const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const gate = this.config.gate ?? new AlwaysAllowGate();
      const runTurnOptions = {
        turnId,
        config: this.config.turnConfig,
        systemPrompt: effectiveSystemPrompt,
        history,
        tools: this.tools,
        provider: await this.resolveProvider(),
        gate,
        signal,
        accumulatedCost: this._accumulatedCost,
        model: this.config.model,
        providerName: this.config.providerName,
        pluginManager: this.config.pluginManager,
        statsTracker: this.config.statsTracker,
        undoManager: this.config.undoManager,
        variantCycler: this.config.variantCycler,
        onEvent: (event: SentinelEvent) => {
          events.push(event);
          if (event.type === 'text_delta') {
            output += event.delta;
          }
        },
      };

      for await (const event of runTurn(runTurnOptions)) {
        if (event.type === 'tool_result' || event.type === 'turn_start' || event.type === 'turn_end') {
          continue;
        }
        events.push(event);
        if (event.type === 'text_delta') {
          output += event.delta;
        }
      }

      if (this.ctxMgr && output) {
        this.ctxMgr.addMessage('assistant', output);
      }

      if (this.ctxMgr && this.ctxMgr.shouldCompact()) {
        const result = this.ctxMgr.compact();
        events.push({
          type: 'compact_boundary',
          reason: `Post-turn compaction: pruned ${result.pruned}, kept ${result.kept}`,
        });
      }

      return { events, output, accumulatedCost: { ...this._accumulatedCost } };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      events.push({ type: 'error', turnId: 'engine', message: errorMsg, fatal: true });
      return { events, output, accumulatedCost: { ...this._accumulatedCost }, error: errorMsg };
    }
  }

  private async resolveProvider(): Promise<Provider> {
    if (this.config.provider) return this.config.provider;
    const { createProvider } = await import('./commands/provider-factory.js');
    const proxyConfig = this.config.proxyConfig ?? loadProxyConfig();
    const providerName = this.config.providerName ?? 'anthropic';
    const model = this.config.model ?? DEFAULT_MODEL;
    const provider = await createProvider(providerName, model, this.config.baseUrl);
    if (proxyConfig.http || proxyConfig.https || proxyConfig.socks) {
      return this.wrapWithProxy(provider, proxyConfig);
    }
    return provider;
  }

  private wrapWithProxy(provider: Provider, proxy: ProxyConfig): Provider {
    const originalFetch = globalThis.fetch;
    const proxied = proxiedFetch;
    const wrappedProvider: Provider = {
      ...provider,
      streamChat: async function* (...args: Parameters<Provider['streamChat']>) {
        const restoreFetch = () => { globalThis.fetch = originalFetch; };
        try {
          globalThis.fetch = (url: string | URL, init?: RequestInit) =>
            proxied(url instanceof URL ? url.href : String(url), { ...init, proxy });
          yield* provider.streamChat(...args);
        } finally {
          restoreFetch();
        }
      },
    };
    return wrappedProvider;
  }
}

export async function discoverTools(
  customToolsConfig?: Array<{
    name: string;
    description: string;
    command: string[];
    environment?: Record<string, string>;
    timeout?: number;
  }>,
): Promise<Tool[]> {
  const tools: Tool[] = [];

  try {
    const toolModule = await import('@sentinel/tools');
    const toolNames = [
      'readFileTool', 'writeFileTool', 'editFileTool', 'bashTool',
      'globTool', 'grepTool', 'listTool', 'webFetchTool', 'webSearchTool',
      'dispatchAgentTool', 'lspDiagnosticsTool',
    ];
    for (const name of toolNames) {
      const t = (toolModule as Record<string, Tool | undefined>)[name];
      if (t) tools.push(t);
    }
  } catch { /* tools package not available */ }

  try {
    const { getMcpTools } = await import('./mcp-integration.js');
    const mcpTools = await getMcpTools();
    tools.push(...mcpTools);
  } catch { /* MCP not available */ }

  if (customToolsConfig && customToolsConfig.length > 0) {
    const { loadCustomTools } = await import('./custom-tools.js');
    const cfg = { custom_tools: customToolsConfig };
    const customTools = loadCustomTools(cfg);
    tools.push(...customTools);
  }

  return tools;
}

import type { Provider, ProviderMessage } from './types.js';
import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';

export interface ModelRoute {
  role: 'main' | 'plan' | 'subagent' | 'compaction';
  provider: Provider;
  config: TurnConfig;
  label?: string;
}

export interface FallbackRoute {
  provider: Provider;
  config: TurnConfig;
  label?: string;
}

export class ProviderRouter {
  private currentModel: string;
  private routes: Map<string, ModelRoute> = new Map();
  private fallbacks: Map<string, FallbackRoute[]> = new Map();
  private latencies = new Map<string, number[]>();

  constructor(
    private _defaultProvider: Provider,
    model: string,
    defaultConfig: TurnConfig,
  ) {
    this.currentModel = model;
    this.routes.set('main', { role: 'main', provider: this._defaultProvider, config: defaultConfig });
  }

  setRoute(route: ModelRoute): void {
    this.routes.set(route.role, route);
  }

  setFallback(role: string, fallbacks: FallbackRoute[]): void {
    this.fallbacks.set(role, fallbacks);
  }

  getRoute(role: 'main' | 'plan' | 'subagent' | 'compaction' = 'main'): ModelRoute {
    return this.routes.get(role) ?? this.routes.get('main')!;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  switchModel(model: string, provider: Provider): void {
    this.currentModel = model;
    const main = this.routes.get('main')!;
    this.routes.set('main', { role: 'main', provider, config: main.config });
  }

  recordLatency(label: string, ms: number): void {
    const entries = this.latencies.get(label) ?? [];
    entries.push(ms);
    if (entries.length > 10) entries.shift();
    this.latencies.set(label, entries);
  }

  getAverageLatency(label: string): number {
    const entries = this.latencies.get(label);
    if (!entries || entries.length === 0) return 0;
    return entries.reduce((a, b) => a + b, 0) / entries.length;
  }

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    _config: TurnConfig,
    signal: AbortSignal,
    role: 'main' | 'plan' | 'subagent' | 'compaction' = 'main',
  ): AsyncIterable<SentinelEvent> {
    const route = this.getRoute(role);
    const roleFallbacks = this.fallbacks.get(role) ?? [];
    const attempts = [
      { provider: route.provider, config: route.config, label: route.label ?? 'primary' },
      ...roleFallbacks,
    ];

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      if (signal.aborted) break;
      const start = Date.now();
      try {
        const iter = attempt.provider.streamChat(messages, tools, attempt.config, signal);
        for await (const event of iter) {
          yield event;
        }
        this.recordLatency(attempt.label ?? 'unknown', Date.now() - start);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempts.length > 1) {
          yield {
            type: 'text_delta',
            turnId: 'router',
            delta: `\n[Provider fallback: ${attempt.label} failed, trying next...]\n`,
          };
        }
      }
    }

    if (lastError) throw lastError;
  }
}

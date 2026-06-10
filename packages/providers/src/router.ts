import type { Provider, ProviderMessage } from './types.js';
import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';

export interface ModelRoute {
  role: 'main' | 'plan' | 'subagent' | 'compaction';
  provider: Provider;
  config: TurnConfig;
}

export class ProviderRouter {
  private currentModel: string;
  private routes: Map<string, ModelRoute> = new Map();

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

  getRoute(role: 'main' | 'plan' | 'subagent' | 'compaction' = 'main'): ModelRoute {
    return this.routes.get(role) ?? this.routes.get('main')!;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  switchModel(model: string, provider: Provider): void {
    this.currentModel = model;
    this.routes.set('main', { role: 'main', provider, config: this.routes.get('main')!.config });
  }

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    _config: TurnConfig,
    signal: AbortSignal,
    role: 'main' | 'plan' | 'subagent' | 'compaction' = 'main',
  ): AsyncIterable<SentinelEvent> {
    const route = this.getRoute(role);
    yield* route.provider.streamChat(messages, tools, route.config, signal);
  }
}

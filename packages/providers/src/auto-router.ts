import type { Provider, ProviderMessage } from './types.js';
import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import { ProviderRouter, type ModelRoute, type FallbackRoute } from './router.js';

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

export interface ComplexityClassifier {
  classify(messages: ProviderMessage[], tools: Tool[]): ComplexityLevel | Promise<ComplexityLevel>;
}

export interface AutoRouterConfig {
  simple: ModelRoute;
  medium: ModelRoute;
  complex: ModelRoute;
  classifier?: ComplexityClassifier;
}

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|what('s| is) (up|new)|how are you|goodbye|bye|thanks|thank you)/i,
  /^(yes|no|ok|okay|sure|yep|nope|maybe)/i,
  /^what (time|date|day) (is )?it/i,
  /^(who|what) (are|is) (you|your)/i,
  /^(list|show) (my )?(files|dir|directory)/i,
];

const COMPLEX_PATTERNS = [
  /(implement|build|create|write|develop|refactor|redesign|migrate)/i,
  /(plan|design|architect|strategy|analyze|evaluate|compare)/i,
  /(test|debug|fix|troubleshoot|investigate)/i,
  /(multi[- ]?step|complex|comprehensive|full)/i,
  /\b(repo|repository|codebase|project)\b.*\b(wide|overview|restructure|audit)\b/i,
  /generate.*(plan|architecture|schema|diagram)/i,
];

function keywordClassify(messages: ProviderMessage[], tools: Tool[]): ComplexityLevel {
  const text = messages.map((m) => m.content ?? '').join(' ').slice(0, 2000);
  const hasTools = tools.length > 0;

  for (const p of SIMPLE_PATTERNS) {
    if (p.test(text)) return 'simple';
  }

  if (hasTools) {
    for (const p of COMPLEX_PATTERNS) {
      if (p.test(text)) return 'complex';
    }
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 100) return 'complex';
    return 'medium';
  }

  return 'simple';
}

export class AutoModelRouter {
  private router: ProviderRouter;
  private config: AutoRouterConfig;
  private classifier: ComplexityClassifier;
  private fallbacks: Map<ComplexityLevel, FallbackRoute[]> = new Map();

  constructor(
    defaultProvider: Provider,
    model: string,
    defaultConfig: TurnConfig,
    config: AutoRouterConfig,
  ) {
    this.router = new ProviderRouter(defaultProvider, model, defaultConfig);
    this.config = config;
    this.classifier = config.classifier ?? { classify: keywordClassify };
  }

  setFallback(level: ComplexityLevel, fb: FallbackRoute[]): void {
    this.fallbacks.set(level, fb);
  }

  setRoute(route: ModelRoute): void {
    this.router.setRoute(route);
  }

  getRouter(): ProviderRouter {
    return this.router;
  }

  getRoute(level: ComplexityLevel): ModelRoute {
    return this.config[level];
  }

  async classify(messages: ProviderMessage[], tools: Tool[]): Promise<ComplexityLevel> {
    return this.classifier.classify(messages, tools);
  }

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const level = await this.classify(messages, tools);
    const route = this.config[level];
    const levelFallbacks = this.fallbacks.get(level) ?? [];

    const attempts = [
      { provider: route.provider, config: route.config, label: route.label ?? level },
      ...levelFallbacks,
    ];

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      if (signal.aborted) break;
      try {
        const iter = attempt.provider.streamChat(messages, tools, attempt.config, signal);
        for await (const event of iter) {
          yield event;
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempts.length > 1) {
          yield {
            type: 'text_delta',
            turnId: 'auto-router',
            delta: `\n[AutoRouter: ${attempt.label} failed, trying next...]\n`,
          };
        }
      }
    }

    if (lastError) throw lastError;
  }
}

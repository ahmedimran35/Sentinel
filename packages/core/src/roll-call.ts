export interface RollCallResult {
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'timeout';
  latencyMs: number;
  error?: string;
}

export interface RollCallConfig {
  providers: Array<{ name: string; apiKey?: string; baseUrl?: string }>;
  timeout?: number;
  concurrency?: number;
}

interface ProviderEndpoint {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Resolves provider configs to their default API endpoints.
 */
function resolveEndpoints(providers: RollCallConfig['providers']): ProviderEndpoint[] {
  const known: Record<string, { baseUrl: string; model: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' },
    google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    together: { baseUrl: 'https://api.together.xyz/v1', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1' },
    fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p1-8b-instruct' },
    perplexity: { baseUrl: 'https://api.perplexity.ai', model: 'sonar-small-chat' },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'mistralai/mixtral-8x7b-instruct' },
  };

  return providers.map(p => {
    const knownEntry = known[p.name];
    const envKey = `SENTINEL_${p.name.toUpperCase()}_API_KEY`;
    return {
      name: p.name,
      baseUrl: p.baseUrl ?? knownEntry?.baseUrl ?? `https://api.${p.name}.com/v1`,
      apiKey: p.apiKey ?? process.env[envKey] ?? '',
      model: knownEntry?.model ?? 'default',
    };
  });
}

/**
 * Sends a lightweight ping to a single OpenAI-compatible chat completion endpoint.
 */
async function pingEndpoint(
  ep: ProviderEndpoint,
  signal: AbortSignal,
): Promise<RollCallResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${ep.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ep.apiKey}`,
      },
      body: JSON.stringify({
        model: ep.model,
        messages: [{ role: 'user', content: 'Respond with just the word "ok" and nothing else.' }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal,
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        provider: ep.name,
        model: ep.model,
        status: 'error',
        latencyMs,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (content.toLowerCase().includes('ok')) {
      return { provider: ep.name, model: ep.model, status: 'ok', latencyMs };
    }
    return { provider: ep.name, model: ep.model, status: 'ok', latencyMs, error: 'Unexpected response: ' + content.slice(0, 100) };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { provider: ep.name, model: ep.model, status: 'timeout', latencyMs, error: 'Request timed out' };
    }
    return {
      provider: ep.name,
      model: ep.model,
      status: 'error',
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Runs a roll-call across all configured providers, measuring connectivity and latency.
 *
 * Sends a simple "respond with just the word 'ok'" message to each model and
 * reports status + response time.
 */
export async function runRollCall(config: RollCallConfig): Promise<RollCallResult[]> {
  const endpoints = resolveEndpoints(config.providers);
  const timeoutMs = config.timeout ?? 15_000;
  const concurrency = config.concurrency ?? endpoints.length;

  const results: RollCallResult[] = [];

  // Process in batches to respect concurrency
  for (let i = 0; i < endpoints.length; i += concurrency) {
    const batch = endpoints.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(ep => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        return pingEndpoint(ep, ac.signal).finally(() => clearTimeout(timer));
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Produces a human-readable summary of roll-call results.
 */
export function summarizeRollCall(results: RollCallResult[]): string {
  if (results.length === 0) return 'No providers configured.';

  const lines: string[] = [];
  let okCount = 0;
  let errCount = 0;

  for (const r of results) {
    const icon = r.status === 'ok' ? '\u2713' : r.status === 'timeout' ? '\u23F1' : '\u2717';
    const latency = r.status === 'ok' ? `${r.latencyMs}ms` : '-';
    lines.push(`${icon} ${r.provider}/${r.model}  ${latency}${r.error ? `  (${r.error})` : ''}`);
    if (r.status === 'ok') okCount++;
    else errCount++;
  }

  const total = results.length;
  lines.push('');
  lines.push(`${okCount}/${total} ok, ${errCount}/${total} failed`);
  return lines.join('\n');
}

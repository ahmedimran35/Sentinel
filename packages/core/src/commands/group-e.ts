import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';

interface ProviderInfo {
  name: string;
  label: string;
  envKey: string;
  modelsUrl: string;
  listKey: string; // JSON path to the array of models
  modelIdKey: string; // key for model id within each entry
  apiKeyHeader: string;
}

const PROVIDERS: ProviderInfo[] = [
  { name: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', modelsUrl: 'https://api.anthropic.com/v1/models', listKey: 'data', modelIdKey: 'id', apiKeyHeader: 'x-api-key' },
  { name: 'nim', label: 'NVIDIA NIM', envKey: 'NVIDIA_API_KEY', modelsUrl: 'https://integrate.api.nvidia.com/v1/models', listKey: 'data', modelIdKey: 'id', apiKeyHeader: 'Authorization' },
  { name: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY', modelsUrl: 'https://api.openai.com/v1/models', listKey: 'data', modelIdKey: 'id', apiKeyHeader: 'Authorization' },
  { name: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', modelsUrl: 'https://openrouter.ai/api/v1/models', listKey: 'data', modelIdKey: 'id', apiKeyHeader: 'Authorization' },
];

function getApiKey(providerName: string): string | null {
  const prov = PROVIDERS.find((p) => p.name === providerName);
  if (!prov) return null;
  return process.env[prov.envKey] ?? null;
}

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'builtin', source: 'core' } as SlashCommand;
}

async function fetchModels(provider: ProviderInfo, apiKey: string): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (provider.apiKeyHeader === 'Authorization') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers[provider.apiKeyHeader] = apiKey;
  }
  headers['Content-Type'] = 'application/json';

  const res = await fetch(provider.modelsUrl, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`API returned ${res.status}: ${res.statusText}`);

  const body = (await res.json()) as Record<string, unknown>;
  const list = body[provider.listKey];
  if (!Array.isArray(list)) throw new Error(`Unexpected response format from ${provider.label}`);

  return list.map((entry: Record<string, unknown>) => String(entry[provider.modelIdKey] ?? ''));
}

async function providerCmd(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0];

  if (!sub || sub === 'list') {
    const current = ctx.providers.getCurrent();
    const lines = [`Current: ${current.provider} / ${current.model}`, ''];
    lines.push('Available providers:');
    for (const prov of PROVIDERS) {
      const key = getApiKey(prov.name);
      const status = key ? '✓ key set' : '✗ no key';
      lines.push(`  ${prov.name.padEnd(12)} ${prov.label.padEnd(16)} ${status}`);
    }
    lines.push('', 'Commands:');
    lines.push('  /provider connect <name> [api-key]  — connect and fetch models');
    lines.push('  /provider list                       — show this list');
    ctx.log(lines.join('\n'));
    return;
  }

  if (sub === 'connect') {
    const name = args.positional[1];
    if (!name) { ctx.log('Usage: /provider connect <name> [api-key]\nProviders: anthropic, nim, openai, openrouter'); return; }

    const prov = PROVIDERS.find((p) => p.name === name);
    if (!prov) { ctx.log(`Unknown provider: ${name}. Available: ${PROVIDERS.map((p) => p.name).join(', ')}`); return; }

    // Check for API key: arg > env
    const inlineKey = args.positional[2];
    const envKey = getApiKey(name);
    const apiKey = inlineKey ?? envKey;

    if (!apiKey) {
      ctx.log(`No API key found for ${prov.label}.\n  Set ${prov.envKey} environment variable\n  Or pass key: /provider connect ${name} <your-api-key>`);
      return;
    }

    ctx.log(`Fetching models from ${prov.label}...`);

    try {
      const models = await fetchModels(prov, apiKey);

      if (models.length === 0) {
        ctx.log('No models returned. The API key may not have model:list permission.');
        return;
      }

      const sorted = models.sort();
      const showCount = Math.min(sorted.length, 30);
      const lines = [
        `Found ${sorted.length} models from ${prov.label}. Showing ${showCount}:`,
        '',
        ...sorted.slice(0, showCount).map((m, i) => `  ${(i + 1).toString().padEnd(3)} ${m}`),
        '',
        `Use /model ${name}/<model-name> to switch`,
        'Or /model <model-name> if already using this provider',
      ];
      ctx.log(lines.join('\n'));
    } catch (err) {
      ctx.log(`Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  ctx.log('Usage: /provider [list|connect <name> [api-key]]');
}

export const groupECommands: SlashCommand[] = [
  cmd({ name: 'provider', summary: 'List/connect AI providers and fetch models', usage: '/provider [list|connect <name> [api-key]]', argHint: 'list|connect', category: 'system', run: providerCmd }),
];

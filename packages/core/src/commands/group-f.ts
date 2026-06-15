import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';
import { isOllamaRunning, listLocalModels, pullModel, getRecommendedModels } from '@sentinel/providers';

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'prompt', source: 'core' } as SlashCommand;
}

async function localList(ctx: CommandContext): Promise<void> {
  const running = await isOllamaRunning();
  if (!running) {
    ctx.log('Ollama is not running. Start it with: ollama serve');
    ctx.log('Recommended models to install:');
    for (const m of getRecommendedModels()) {
      ctx.log(`  ${m.name}:${m.size} — ${m.description} (requires ~${m.ram})`);
    }
    return;
  }

  const models = await listLocalModels();
  if (models.length === 0) {
    ctx.log('No local models found. Install one: /local pull <model>');
    ctx.log('Recommended: /local pull llama3.2');
    return;
  }

  ctx.log(`Local models [${models.length}]:`);
  for (const m of models) {
    const sizeGb = (m.size / 1_000_000_000).toFixed(1);
    ctx.log(`  ${m.name} (${sizeGb}GB, modified ${m.modified?.slice(0, 10) ?? 'unknown'})`);
  }
  ctx.log(`\nUse: /local pull <model> to download more`);
}

async function localPull(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const model = args.positional[0];
  if (!model) {
    ctx.log('Usage: /local pull <model> (e.g., /local pull llama3.2)');
    ctx.log('Recommended: ' + getRecommendedModels().map((m) => `${m.name}:${m.size}`).slice(0, 5).join(', '));
    return;
  }

  const running = await isOllamaRunning();
  if (!running) {
    ctx.log('Ollama is not running. Start it first: ollama serve');
    return;
  }

  ctx.log(`Pulling ${model}...`);
  for await (const progress of pullModel(model)) {
    if (progress.status === 'success') {
      ctx.log(`Done: ${model} installed`);
      return;
    }
    if (progress.completed && progress.total) {
      const pct = ((progress.completed / progress.total) * 100).toFixed(0);
      ctx.log(`  ${progress.status}: ${pct}%`);
    }
  }
}

async function localSwitch(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const model = args.positional[0];
  if (!model) {
    ctx.log('Usage: /local switch <model>');
    return;
  }

  const running = await isOllamaRunning();
  if (!running) {
    ctx.log('Ollama is not running. Start it first: ollama serve');
    return;
  }

  const models = await listLocalModels();
  const found = models.find((m) => m.name === model || m.name.startsWith(model));
  if (!found) {
    ctx.log(`Model "${model}" not found locally. Pull it first: /local pull ${model}`);
    return;
  }

  await ctx.providers.setCurrent('ollama', found.name);
  ctx.log(`Switched to local model: ${found.name}`);
}

export const groupFCommands: SlashCommand[] = [
  cmd({
    name: 'local',
    aliases: ['ollama'],
    summary: 'Manage local models via Ollama',
    usage: '/local [list|pull <model>|switch <model>]',
    argHint: 'list|pull|switch',
    category: 'model',
    run: async (ctx, raw) => {
      const args = parseArgs(raw);
      const sub = args.positional[0] ?? 'list';

      if (sub === 'list') {
        await localList(ctx);
      } else if (sub === 'pull') {
        await localPull(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'switch') {
        await localSwitch(ctx, args.positional.slice(1).join(' '));
      } else {
        ctx.log('Usage: /local [list|pull <model>|switch <model>]');
      }
    },
    isAsync: true,
  }),
];

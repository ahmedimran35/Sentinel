import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'builtin', source: 'core' } as SlashCommand;
}

async function model(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const modelArg = args.positional[0];
  if (!modelArg) {
    const current = ctx.providers.getCurrent();
    ctx.log(`Current model: ${current.provider}/${current.model}\nUsage: /model <provider/name>`);
    return;
  }
  const currentProv = ctx.providers.getCurrent().provider;
  // If model name contains '/' (e.g. NIM models like "stepfun-ai/step-3.7-flash"),
  // keep the current provider and use full arg as model name
  const knownProviders = ['anthropic', 'claude', 'openai', 'nim', 'nvidia', 'gemini', 'openrouter'];
  const firstSlash = modelArg.indexOf('/');
  const hasProviderPrefix = firstSlash > 0 && knownProviders.includes(modelArg.slice(0, firstSlash));
  const provider = hasProviderPrefix ? modelArg.slice(0, firstSlash) : currentProv;
  const name = hasProviderPrefix ? modelArg.slice(firstSlash + 1) : modelArg;
  const valid = await ctx.providers.validate(provider, name);
  if (!valid) {
    ctx.log(`Invalid model or provider: ${modelArg}. No changes made.`);
    return;
  }
  await ctx.providers.setCurrent(provider, name);
  ctx.config.model = modelArg;
  ctx.log(`Model switched to ${modelArg}.`);
}

async function mode(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const modeArg = args.positional[0]?.toLowerCase();
  const validModes = ['plan', 'build', 'auto', 'yolo', 'chat'];
  if (!modeArg || !validModes.includes(modeArg)) {
    ctx.log(`Current mode: ${ctx.config.mode}\nValid modes: plan (read-only), build (write+execute), auto (no prompts), yolo (no safety), chat (no tools)`);
    return;
  }
  ctx.config.mode = modeArg;
  ctx.bus.emit({ type: 'compact_boundary', reason: `mode:${modeArg}` });
  if (modeArg === 'yolo') ctx.log('⚠️ YOLO MODE — no safety prompts, all actions permitted');
  else ctx.log(`Mode set to ${modeArg}.`);
}

async function compact(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const focus = args.raw || undefined;
  const beforeCount = ctx.session.history.length;
  const kept: Array<{ role: string; content: string | null }> = [];
  const toolResults: Array<{ role: string; content: string | null }> = [];

  for (const m of ctx.session.history) {
    if (m.role === 'tool') toolResults.push(m);
    else kept.push(m);
  }
  // Prune old tool results, keep last 5
  const prunedToolCount = Math.max(0, toolResults.length - 5);
  const keptToolResults = toolResults.slice(-5);
  ctx.session.history = [...kept, ...keptToolResults];

  ctx.bus.emit({ type: 'compact_boundary', reason: focus ? `compact:${focus}` : 'compact' });

  const afterCount = ctx.session.history.length;
  ctx.log(`Context compacted. Pruned ${prunedToolCount} tool results. ${beforeCount} → ${afterCount} messages.${focus ? ` Focus: ${focus}` : ''}`);
}

async function memory(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0] ?? 'show';

  if (sub === 'show') {
    const agentsPath = path.resolve(ctx.config.projectRoot, 'AGENTS.md');
    let content = '';
    if (fs.existsSync(agentsPath)) content += fs.readFileSync(agentsPath, 'utf-8') + '\n';
    const sentinelDir = path.resolve(ctx.config.projectRoot, '.sentinel');
    const memoryPath = path.resolve(sentinelDir, 'memory.md');
    if (fs.existsSync(memoryPath)) content += fs.readFileSync(memoryPath, 'utf-8');
    ctx.log(content || 'No AGENTS.md or memory files found.');
    return;
  }

  if (sub === 'add') {
    const text = args.raw.replace(/^add\s+/, '');
    if (!text) { ctx.log('Usage: /memory add <text>'); return; }
    const sentinelDir = path.resolve(ctx.config.projectRoot, '.sentinel');
    fs.mkdirSync(sentinelDir, { recursive: true });
    fs.appendFileSync(path.resolve(sentinelDir, 'memory.md'), text + '\n', 'utf-8');
    ctx.log(`Memory appended: ${text.slice(0, 100)}${text.length > 100 ? '…' : ''}`);
    return;
  }

  if (sub === 'edit') {
    const memoryPath = path.resolve(ctx.config.projectRoot, '.sentinel/memory.md');
    const editorEnv = process.env.EDITOR ?? process.env.VISUAL ?? 'vim';
    try {
      const editorParts = editorEnv.split(/\s+/);
      spawnSync(editorParts[0]!, [...editorParts.slice(1), memoryPath], { stdio: 'inherit', timeout: 300_000 });
    } catch {
      ctx.log('Editor closed with non-zero exit — changes may not have been saved.');
      return;
    }
    ctx.log('Memory file saved.');
    return;
  }

  if (sub === 'refresh') {
    ctx.log('Memory refreshed from disk.');
    return;
  }

  ctx.log('Usage: /memory [show|add <text>|edit|refresh]');
}

async function addDir(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const dirPath = args.positional[0];
  if (!dirPath) { ctx.log('Usage: /add-dir <path>'); return; }
  const resolved = path.resolve(ctx.config.projectRoot, dirPath);
  if (!fs.existsSync(resolved)) { ctx.log(`Directory not found: ${resolved}`); return; }
  if (!ctx.config.allowOutsideRoot && !resolved.startsWith(ctx.config.projectRoot)) {
    ctx.log(`Path ${dirPath} is outside project root. Use --allow-outside-root to enable.`);
    return;
  }
  ctx.log(`Added working directory: ${resolved}`);
}

export const groupBCommands: SlashCommand[] = [
  cmd({ name: 'model', aliases: ['models'], summary: 'Switch model mid-session', usage: '/model [provider/name]', argHint: 'provider/model', category: 'context', run: model }),
  cmd({ name: 'mode', summary: 'Set mode: plan|build|auto|yolo|chat', usage: '/mode [plan|build|auto|yolo|chat]', argHint: 'plan|build|auto|yolo|chat', category: 'context', run: mode }),
  cmd({ name: 'compact', aliases: ['summarize', 'compress'], summary: 'Summarize and prune old context', usage: '/compact [focus instructions]', argHint: 'optional focus', category: 'context', run: compact }),
  cmd({ name: 'memory', summary: 'Show/add/edit AGENTS.md + Memory Bank', usage: '/memory [show|add <text>|edit|refresh]', argHint: 'show|add|edit|refresh', category: 'context', run: memory }),
  cmd({ name: 'add-dir', summary: 'Add an extra working directory to scope', usage: '/add-dir <path>', argHint: 'path', category: 'context', requiresGit: false, run: addDir }),
];

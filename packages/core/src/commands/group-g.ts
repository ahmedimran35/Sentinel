import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';
import { createProvider } from './provider-factory.js';
import { AlwaysAllowGate } from '../permission-gate.js';

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'prompt', source: 'core' } as SlashCommand;
}

async function agentSpawn(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const task = args.raw;
  if (!task) { ctx.log('Usage: /agent spawn <task>'); return; }

  const { AgentManager } = await import('../agent-manager.js');
  const current = ctx.providers.getCurrent();
  const provider = await createProvider(current.provider, current.model);
  const manager = new AgentManager();
  const tools = ctx.tools ?? [];
  const id = await manager.spawn(
    { task, model: current.model },
    current.model,
    provider,
    tools,
    ctx.signal,
  );
  ctx.log(`Agent spawned: ${id}. Check status: /agent status ${id}`);
}

async function agentStatus(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const id = args.positional[0];
  const { AgentManager } = await import('../agent-manager.js');
  const manager = new AgentManager();
  if (id) {
    const agent = manager.get(id);
    if (!agent) { ctx.log(`Agent not found: ${id}`); return; }
    ctx.log(`[${agent.id}] ${agent.status} — ${agent.spec.task.slice(0, 80)}`);
    ctx.log(`  Progress: ${agent.progress}%`);
    ctx.log(`  Started: ${new Date(agent.startedAt).toISOString()}`);
    if (agent.finishedAt) ctx.log(`  Finished: ${new Date(agent.finishedAt).toISOString()}`);
    if (agent.output) ctx.log(`  Output: ${agent.output.slice(0, 300)}`);
    if (agent.error) ctx.log(`  Error: ${agent.error}`);
  } else {
    const agents = manager.list();
    if (agents.length === 0) { ctx.log('No agents spawned yet.'); return; }
    ctx.log(`Agents [${agents.length}]:`);
    for (const a of agents) {
      ctx.log(`  [${a.id}] ${a.status} (${a.progress}%) — ${a.spec.task.slice(0, 60)}`);
    }
  }
}

async function agentCancel(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const id = args.positional[0];
  if (!id) { ctx.log('Usage: /agent cancel <id>'); return; }
  const { AgentManager } = await import('../agent-manager.js');
  const manager = new AgentManager();
  if (manager.cancel(id)) {
    ctx.log(`Agent ${id} cancelled`);
  } else {
    ctx.log(`Agent ${id} not found or already finished`);
  }
}

async function memoryStore(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const type = (args.positional[0] as 'fact' | 'decision' | 'convention' | 'preference' | 'note') ?? 'note';
  const content = args.positional.slice(1).join(' ');
  if (!content) { ctx.log('Usage: /memory store <type> <content>'); return; }

  const { PersistentMemory } = await import('../persistent-memory.js');
  const mem = new PersistentMemory(ctx.config.projectRoot);
  const id = await mem.store(type, content, [], 'user');
  ctx.log(`Stored as ${type} (id: ${id})`);
}

async function memorySearch(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const query = args.raw;
  if (!query) { ctx.log('Usage: /memory search <query>'); return; }

  const { PersistentMemory } = await import('../persistent-memory.js');
  const mem = new PersistentMemory(ctx.config.projectRoot);
  const results = await mem.search(query);
  if (results.length === 0) { ctx.log('No results found'); return; }
  ctx.log(`Memory search results for "${query}":`);
  for (const r of results) {
    ctx.log(`  [${r.type}] ${r.content.slice(0, 200)}`);
  }
}

async function memoryList(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const { PersistentMemory } = await import('../persistent-memory.js');
  const mem = new PersistentMemory(ctx.config.projectRoot);
  const entries = await mem.getAll();
  if (entries.length === 0) { ctx.log('No memories stored yet.'); return; }
  ctx.log(`Memories [${entries.length}]:`);
  for (const e of entries) {
    const date = new Date(e.timestamp).toISOString().slice(0, 10);
    ctx.log(`  [${e.type}] ${date} — ${e.content.slice(0, 100)}`);
  }
}

async function voiceRecord(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const duration = parseInt(args.positional[0] ?? '5', 10);
  const { detectVoiceSupport, captureAndTranscribe } = await import('../voice-input.js');
  const support = await detectVoiceSupport();
  if (!support.available) {
    ctx.log('Voice input not available. Install rec (sox) or ffmpeg.');
    return;
  }
  ctx.log(`Recording for ${duration} seconds... (speak now)`);
  try {
    const text = await captureAndTranscribe({
      recordDuration: duration,
      openAiApiKey: process.env.OPENAI_API_KEY,
      whisperCppPath: process.env.WHISPER_CPP_PATH,
      whisperModelPath: process.env.WHISPER_MODEL_PATH,
    });
    ctx.log(`Transcribed: ${text}`);
  } catch (err) {
    ctx.log(`Voice input failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const groupGCommands: SlashCommand[] = [
  cmd({
    name: 'agent',
    aliases: ['subagent'],
    summary: 'Spawn and manage background agents',
    usage: '/agent [spawn <task>|status [id]|cancel <id>]',
    argHint: 'spawn|status|cancel',
    category: 'agent',
    run: async (ctx, raw) => {
      const args = parseArgs(raw);
      const sub = args.positional[0] ?? 'list';
      if (sub === 'spawn') {
        await agentSpawn(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'status') {
        await agentStatus(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'cancel') {
        await agentCancel(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'list') {
        await agentStatus(ctx, '');
      } else {
        ctx.log('Usage: /agent [spawn <task>|status [id]|cancel <id>]');
      }
    },
    isAsync: true,
  }),
  cmd({
    name: 'memory',
    aliases: ['mem'],
    summary: 'Store and search persistent memory',
    usage: '/memory [store <type> <content>|search <query>|list]',
    argHint: 'store|search|list',
    category: 'project',
    run: async (ctx, raw) => {
      const args = parseArgs(raw);
      const sub = args.positional[0] ?? 'list';
      if (sub === 'store') {
        await memoryStore(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'search') {
        await memorySearch(ctx, args.positional.slice(1).join(' '));
      } else if (sub === 'list') {
        await memoryList(ctx, raw);
      } else {
        ctx.log('Usage: /memory [store <type> <content>|search <query>|list]');
      }
    },
    isAsync: true,
  }),
  cmd({
    name: 'voice',
    aliases: ['record'],
    summary: 'Record and transcribe voice input',
    usage: '/voice [duration_sec]',
    argHint: 'seconds',
    category: 'extend',
    run: async (ctx, raw) => {
      const args = parseArgs(raw);
      const duration = args.positional[0] ?? '5';
      await voiceRecord(ctx, duration);
    },
    isAsync: true,
  }),
];

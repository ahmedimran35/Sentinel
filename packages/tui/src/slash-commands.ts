import { spawnSync } from 'node:child_process';
import { BUILTIN_MODELS } from '@sentinel/shared';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { analyzeRepo, generateAgentsMd, shareSession, listSessions, SessionUndoManager, ContextManager, StatsTracker } from '@sentinel/core';
import type { CompactionPolicy } from '@sentinel/core';

export interface EventBus {
  on(type: string, listener: (event: unknown) => void): () => void;
  emit(event: unknown): void;
}

export interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  execute(args: string[], ctx: SlashCommandContext): Promise<void>;
}

export interface SlashCommandContext {
  appendOutput(text: string): void;
  sendMessage(text: string): void;
  getHistory(): Array<{ role: string; content: string }>;
  setMode(mode: string): void;
  getMode(): string;
  getConfig(): Record<string, unknown>;
  setConfig(key: string, value: unknown): void;
  onStateChange(cb: () => void): void;
  bus: EventBus;
  sessionId?: string;
  projectRoot?: string;
  undoManager?: SessionUndoManager;
  statsTracker?: StatsTracker;
}

function formatConversationForExport(history: Array<{ role: string; content: string }>): string {
  const lines: string[] = ['# Sentinel Session Export', '', `*Exported: ${new Date().toISOString()}*`, ''];
  for (const entry of history) {
    if (entry.role === 'user') {
      lines.push('## User', '', entry.content, '');
    } else if (entry.role === 'assistant') {
      lines.push('## Assistant', '', entry.content, '');
    } else if (entry.role === 'error') {
      lines.push('## Error', '', entry.content, '');
    }
  }
  return lines.join('\n');
}

interface CommandEntry {
  name: string;
  summary: string;
  usage: string;
  argHint?: string;
}

const ALL_COMMANDS: CommandEntry[] = [
  { name: 'connect', summary: 'Add provider, enter API key', usage: '/connect', argHint: '' },
  { name: 'compact', summary: 'Compact session context', usage: '/compact', argHint: '' },
  { name: 'details', summary: 'Toggle tool execution details', usage: '/details', argHint: '' },
  { name: 'editor', summary: 'Open $EDITOR to compose message', usage: '/editor', argHint: '' },
  { name: 'exit', summary: 'Exit the TUI', usage: '/exit', argHint: '' },
  { name: 'export', summary: 'Export conversation to markdown', usage: '/export', argHint: '' },
  { name: 'help', summary: 'Show help dialog', usage: '/help', argHint: '' },
  { name: 'init', summary: 'Analyze project, create AGENTS.md', usage: '/init', argHint: '' },
  { name: 'models', summary: 'List available models', usage: '/models', argHint: '' },
  { name: 'new', summary: 'Start new session', usage: '/new', argHint: '' },
  { name: 'redo', summary: 'Redo undone message', usage: '/redo', argHint: '' },
  { name: 'sessions', summary: 'List and switch sessions', usage: '/sessions', argHint: '' },
  { name: 'share', summary: 'Share current session', usage: '/share', argHint: '' },
  { name: 'themes', summary: 'List and switch themes', usage: '/themes', argHint: '' },
  { name: 'thinking', summary: 'Toggle thinking blocks', usage: '/thinking', argHint: '' },
  { name: 'undo', summary: 'Undo last message', usage: '/undo', argHint: '' },
  { name: 'unshare', summary: 'Unshare current session', usage: '/unshare', argHint: '' },
];

function getApiKey(provider: string): string {
  if (provider === 'nim') return process.env.NVIDIA_API_KEY ?? process.env.NIM_API_KEY ?? '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY ?? '';
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY ?? '';
  if (provider === 'custom') return process.env.CUSTOM_API_KEY ?? '';
  return process.env.ANTHROPIC_API_KEY ?? '';
}

const COMMAND_REGISTRY: SlashCommand[] = [
  {
    name: 'connect',
    aliases: [],
    description: 'Add a provider, select from available providers, enter API key',
    async execute(_args, ctx) {
      ctx.appendOutput('Opening provider configuration...');
      ctx.setConfig('showWizard', true);
      ctx.onStateChange(() => {});
    },
  },
  {
    name: 'compact',
    aliases: ['summarize'],
    description: 'Compact current session context',
    async execute(_args, ctx) {
      const history = ctx.getHistory();
      if (history.length === 0) {
        ctx.appendOutput('No conversation to compact.');
        return;
      }
      const compactionConfig: CompactionPolicy = { auto: true, prune: true, reserved: 0 };
      const cm = new ContextManager(128_000, (t: string) => Math.ceil(t.length / 4), 0.9, compactionConfig);
      for (const msg of history) {
        if (msg.content) cm.addMessage(msg.role, msg.content);
      }
      const usage = cm.getUsage();
      ctx.appendOutput(`Context: ${usage.used} tokens / ${usage.max} max (${Math.round(usage.ratio * 100)}%).`);
      if (cm.shouldCompact()) {
        const result = cm.compact();
        ctx.appendOutput(`Compacted: pruned ${result.pruned} messages, kept ${result.kept}.`);
        ctx.bus.emit({ type: 'compact_boundary', reason: `Compact: pruned ${result.pruned}, kept ${result.kept}` });
      } else {
        ctx.appendOutput('Context within limits, no compaction needed.');
      }
    },
  },
  {
    name: 'details',
    aliases: [],
    description: 'Toggle tool execution details visibility',
    async execute(_args, ctx) {
      const current = ctx.getConfig().showToolOutput;
      const next = !(current as boolean);
      ctx.setConfig('showToolOutput', next);
      ctx.appendOutput(`Tool details: ${next ? 'shown' : 'hidden'}`);
      ctx.onStateChange(() => {});
    },
  },
  {
    name: 'editor',
    aliases: [],
    description: 'Open external editor ($EDITOR) for composing message',
    async execute(_args, ctx) {
      ctx.appendOutput('Opening editor...');
      const editor = process.env.EDITOR || 'vi';
      const tmp = path.join(os.tmpdir(), `sentinel-msg-${Date.now()}.md`);
      fs.writeFileSync(tmp, '', 'utf-8');
      try {
        const editorParts = editor.split(/\s+/);
        spawnSync(editorParts[0]!, [...editorParts.slice(1), tmp], { stdio: 'inherit', timeout: 300_000 });
        const content = fs.readFileSync(tmp, 'utf-8').trim();
        fs.unlinkSync(tmp);
        if (content) {
          ctx.sendMessage(content);
        } else {
          ctx.appendOutput('Empty message, not sent.');
        }
      } catch {
        fs.unlinkSync(tmp);
        ctx.appendOutput('Editor closed without saving.');
      }
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit the TUI',
    async execute(_args, _ctx) {
      process.exit(0);
    },
  },
  {
    name: 'export',
    aliases: [],
    description: 'Export conversation to markdown',
    async execute(_args, ctx) {
      const history = ctx.getHistory();
      if (history.length === 0) {
        ctx.appendOutput('No conversation to export.');
        return;
      }
      const md = formatConversationForExport(history);
      const filePath = path.join(process.cwd(), `sentinel-export-${Date.now()}.md`);
      fs.writeFileSync(filePath, md, 'utf-8');
      ctx.appendOutput(`Exported to ${filePath}`);
      const editor = process.env.EDITOR || 'open';
      try {
        const editorParts = editor.split(/\s+/);
        spawnSync(editorParts[0]!, [...editorParts.slice(1), filePath], { stdio: 'ignore', timeout: 5_000 });
      } catch {
        // editor may not support non-blocking
      }
    },
  },
  {
    name: 'help',
    aliases: [],
    description: 'Show help dialog with all commands',
    async execute(_args, ctx) {
      const lines: string[] = [
        '',
        '╔══════════════════════════════════════╗',
        '║         Sentinel Slash Commands       ║',
        '╚══════════════════════════════════════╝',
        '',
      ];
      for (const cmd of ALL_COMMANDS) {
        const aliasText = (() => {
          const found = COMMAND_REGISTRY.find((c) => c.name === cmd.name);
          if (found && found.aliases.length > 0) {
            return ` (aliases: ${found.aliases.map((a) => `/${a}`).join(', ')})`;
          }
          return '';
        })();
        lines.push(`  /${cmd.name}${aliasText}`);
        lines.push(`    ${cmd.summary}`);
        lines.push('');
      }
      lines.push('  @file          Attach file reference');
      lines.push('  @file:123      Specific line');
      lines.push('  @file:10-20    Line range');
      lines.push('  !command       Run bash command');
      lines.push('');
      ctx.appendOutput(lines.join('\n'));
    },
  },
  {
    name: 'init',
    aliases: [],
    description: 'Analyze project, create AGENTS.md',
    async execute(_args, ctx) {
      const projectRoot = ctx.projectRoot || process.cwd();
      ctx.appendOutput(`Analyzing project: ${projectRoot}...`);
      try {
        const analysis = await analyzeRepo(projectRoot);
        const mdPath = path.join(projectRoot, 'AGENTS.md');
        const md = generateAgentsMd(analysis, projectRoot);
        fs.writeFileSync(mdPath, md, 'utf-8');
        ctx.appendOutput(`AGENTS.md created at ${mdPath}. Languages: ${analysis.languages.join(', ')}.`);
      } catch (err) {
        ctx.appendOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: 'models',
    aliases: [],
    description: 'List available models',
    async execute(_args, ctx) {
      ctx.appendOutput('Fetching available models...');
      const configured: Array<{ name: string; apiKey: string; url?: string }> = [
        { name: 'anthropic', apiKey: getApiKey('anthropic') },
        { name: 'openai', apiKey: getApiKey('openai'), url: 'https://api.openai.com/v1/models' },
        { name: 'nim', apiKey: getApiKey('nim'), url: 'https://integrate.api.nvidia.com/v1/models' },
      ];
      const customKey = getApiKey('custom');
      const customBaseUrl = process.env.CUSTOM_BASE_URL || 'https://api.openai.com/v1';
      if (customKey) configured.push({ name: 'custom', apiKey: customKey, url: `${customBaseUrl}/models` });

      const results: string[] = [];
      for (const p of configured) {
        if (!p.apiKey) continue;
        try {
          if (p.name === 'anthropic') {
            const models = BUILTIN_MODELS;
            for (const m of models) results.push(`  ${p.name}/${m}`);
          } else {
            const res = await fetch(p.url!, {
              headers: { Authorization: `Bearer ${p.apiKey}` },
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
              const body = await res.json() as { data?: Array<{ id: string }> };
              const models = (body.data ?? []).map((m) => m.id).slice(0, 20);
              for (const m of models) results.push(`  ${p.name}/${m}`);
            }
          }
        } catch {
          results.push(`  ${p.name}: (unreachable)`);
        }
      }
      if (results.length === 0) {
        ctx.appendOutput('No providers configured. Use /connect to add one.');
      } else {
        ctx.appendOutput('Available models:\n' + results.join('\n'));
      }
    },
  },
  {
    name: 'new',
    aliases: ['clear'],
    description: 'Start a new session',
    async execute(_args, ctx) {
      ctx.appendOutput('Starting new session...');
      ctx.sendMessage('/new');
    },
  },
  {
    name: 'redo',
    aliases: [],
    description: 'Redo previously undone message (Git-backed)',
    async execute(_args, ctx) {
      const um = ctx.undoManager;
      if (!um) {
        ctx.appendOutput('Undo manager not available.');
        return;
      }
      try {
        const entry = await um.redo(ctx.sessionId || 'session_1');
        if (entry) {
          ctx.appendOutput(`Redone: ${entry.message}`);
          ctx.bus.emit({ type: 'undo', action: 'redo' });
        } else {
          ctx.appendOutput('Nothing to redo.');
        }
      } catch (err) {
        ctx.appendOutput(`Redo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: 'sessions',
    aliases: ['resume', 'continue'],
    description: 'List and switch sessions',
    async execute(_args, ctx) {
      const projectRoot = ctx.projectRoot || process.cwd();
      try {
        const sessions = listSessions(projectRoot);
        if (sessions.length === 0) {
          ctx.appendOutput('No saved sessions.');
          return;
        }
        const lines = sessions.slice(-10).map((s: { id: string; model: string; startTime: string }) =>
          `  ${s.id.padEnd(20)} ${s.model.padEnd(30)} ${new Date(s.startTime).toISOString().slice(0, 19)}`
        );
        ctx.appendOutput(`Saved sessions (last ${Math.min(sessions.length, 10)}):\n${lines.join('\n')}`);
        ctx.appendOutput('Use --session <id> or /resume <id> to switch.');
      } catch {
        ctx.appendOutput('Could not list sessions.');
      }
    },
  },
  {
    name: 'share',
    aliases: [],
    description: 'Share current session',
    async execute(_args, ctx) {
      const projectRoot = ctx.projectRoot || process.cwd();
      const sessionId = ctx.sessionId || 'current';
      try {
        const result = await shareSession(sessionId, projectRoot);
        ctx.appendOutput(`Session shared: ${result.url || '(local record created)'}`);
        if (result.url) {
          try {
            const cp = await import('node:child_process');
            cp.spawnSync('pbcopy', [], { input: result.url, timeout: 2000 });
            ctx.appendOutput('Link copied to clipboard.');
          } catch { /* clipboard unavailable */ }
        }
      } catch (err) {
        ctx.appendOutput(`Share failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: 'themes',
    aliases: [],
    description: 'List available themes, switch themes',
    async execute(_args, ctx) {
      const builtinThemes = [
        'system', 'tokyonight', 'everforest', 'ayu', 'catppuccin',
        'catppuccin-macchiato', 'gruvbox', 'kanagawa', 'nord', 'matrix',
        'one-dark',
      ];
      const current = ctx.getConfig().theme || 'dark';
      ctx.appendOutput(`Current theme: ${current}\n\nAvailable themes:\n${builtinThemes.map((t) => `  ${t === current ? '→' : ' '} ${t}`).join('\n')}`);
      ctx.appendOutput('Switch with: setConfig("theme", "name") or edit config file.');
    },
  },
  {
    name: 'thinking',
    aliases: [],
    description: 'Toggle thinking/reasoning blocks visibility',
    async execute(_args, ctx) {
      const current = ctx.getConfig().showThinking;
      const next = !(current as boolean);
      ctx.setConfig('showThinking', next);
      ctx.appendOutput(`Thinking blocks: ${next ? 'shown' : 'hidden'}`);
      ctx.onStateChange(() => {});
    },
  },
  {
    name: 'undo',
    aliases: [],
    description: 'Undo last message (Git-backed file revert)',
    async execute(_args, ctx) {
      const um = ctx.undoManager;
      if (!um) {
        ctx.appendOutput('Undo manager not available.');
        return;
      }
      try {
        const entry = await um.undo(ctx.sessionId || 'session_1');
        if (entry) {
          ctx.appendOutput(`Undone: ${entry.message}`);
          ctx.bus.emit({ type: 'undo', action: 'undo' });
        } else {
          ctx.appendOutput('Nothing to undo.');
        }
      } catch (err) {
        ctx.appendOutput(`Undo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: 'unshare',
    aliases: [],
    description: 'Unshare current session',
    async execute(_args, ctx) {
      const sessionId = ctx.sessionId || 'current';
      ctx.appendOutput(`Session ${sessionId} unshared.`);
      ctx.bus.emit({ type: 'unshare', sessionId });
    },
  },
];

export function getSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  const cmdName = parts[0]?.toLowerCase() ?? '';
  for (const cmd of COMMAND_REGISTRY) {
    if (cmd.name === cmdName || cmd.aliases.includes(cmdName)) {
      return cmd;
    }
  }
  return null;
}

export function parseSlashCommand(input: string): { command: SlashCommand | null; args: string[]; rawArgs: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { command: null, args: [], rawArgs: '' };
  const rest = trimmed.slice(1);
  const parts = rest.split(/\s+/);
  const args = parts.slice(1);
  const cmd = getSlashCommand(input);
  return { command: cmd, args, rawArgs: args.join(' ') };
}

export interface CommandsForPalette {
  name: string;
  summary: string;
  usage: string;
  argHint?: string;
}

export function getCommandsForPalette(): CommandsForPalette[] {
  return ALL_COMMANDS;
}

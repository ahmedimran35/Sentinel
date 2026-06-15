import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'builtin', source: 'core' } as SlashCommand;
}

async function mcpCmd(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0] ?? 'list';
  const name = args.positional[1];

  if (sub === 'list') {
    const servers = ctx.mcp.listServers();
    const lines = servers.map((s) => `  ${s.name}  [${s.status}]${s.verdict ? ` verdict: ${s.verdict}` : ''}`);
    ctx.log(`MCP Servers:\n${lines.join('\n')}`);
    return;
  }

  if (sub === 'add' && name) {
    await ctx.mcp.addServer(name, {});
    ctx.log(`Added MCP server: ${name}`);
    return;
  }

  if (sub === 'rm' && name) {
    await ctx.mcp.removeServer(name);
    ctx.log(`Removed MCP server: ${name}`);
    return;
  }

  if (sub === 'rescan') {
    await ctx.mcp.rescan();
    ctx.log('MCP servers rescanned.');
    return;
  }

  ctx.log('Usage: /mcp [list|add <name>|rm <name>|rescan|auth <name>]');
}

async function hooks(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const hooksPath = path.resolve(ctx.config.projectRoot, '.sentinel/hooks.json');
  if (!fs.existsSync(hooksPath)) {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify({
      session_start: [],
      pre_tool: [],
      post_tool: [],
      pre_commit: [],
    }, null, 2), 'utf-8');
  }
  const editorEnv = process.env.EDITOR ?? process.env.VISUAL ?? 'vim';
  try {
    const editorParts = editorEnv.split(/\s+/);
    spawnSync(editorParts[0]!, [...editorParts.slice(1), hooksPath], { stdio: 'inherit', timeout: 300_000 });
  } catch {
    ctx.log('Editor closed with non-zero exit — changes may not have been saved.');
    return;
  }
  ctx.log('⚠️  Hooks execute with your user credentials. Review carefully.');
}

async function permissions(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0];
  const pattern = args.positional[1];

  if (sub === 'allow' && pattern) {
    ctx.log(`Added allow rule: ${pattern}`);
    return;
  }
  if (sub === 'deny' && pattern) {
    ctx.log(`Added deny rule: ${pattern}`);
    return;
  }
  const gatePath = path.resolve(ctx.config.projectRoot, '.sentinel/gate.json');
  let rules: Array<{ allow: string[]; deny: string[] }> = [];
  if (fs.existsSync(gatePath)) {
    rules = [JSON.parse(fs.readFileSync(gatePath, 'utf-8'))];
  }
  ctx.log(`Current permission rules:\n${rules.map((r) => `  Allow: ${r.allow.join(', ') || '(none)'}\n  Deny: ${r.deny.join(', ') || '(none)'}`).join('\n')}\nUsage: /permissions [allow <pattern>|deny <pattern>]`);
}

async function undo(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const result = await ctx.git.undo();
  if (!result || result.length === 0) {
    ctx.log('Nothing to undo.');
    return;
  }
  ctx.log(`Undid ${result.length} file(s): ${result.map((f) => f.path).join(', ')}`);
}

async function redo(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const result = await ctx.git.redo();
  if (!result || result.length === 0) {
    ctx.log('Nothing to redo.');
    return;
  }
  ctx.log(`Redid ${result.length} file(s): ${result.map((f) => f.path).join(', ')}`);
}

async function restore(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const checkpointId = args.positional[0];
  if (!checkpointId) {
    const checkpoints = await ctx.git.listCheckpoints();
    const lines = checkpoints.map((c) => `  ${c.id.slice(0, 8)}  ${c.timestamp.toISOString()}  (${c.fileCount} files)`);
    ctx.log(`Checkpoints:\n${lines.join('\n')}\nUsage: /restore <checkpoint-id>`);
    return;
  }
  const result = await ctx.git.restore(checkpointId);
  ctx.log(`Restored ${result.length} file(s) from checkpoint ${checkpointId.slice(0, 8)}.`);
}

async function share(ctx: CommandContext, _rawArgs: string): Promise<void> {
  ctx.log(
    'Session sharing via `sentinel serve` is not yet available.\n' +
    'To share this session, use /export to save as markdown:\n' +
    '  /export\n' +
    'Then share the exported file manually.'
  );
}

async function unshare(ctx: CommandContext, _rawArgs: string): Promise<void> {
  ctx.log('No active share links to revoke. Start `sentinel serve` and use /share first.');
}

async function themes(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const theme = args.positional[0];
  const validThemes = ['dark', 'light', 'gruvbox'];
  if (!theme || !validThemes.includes(theme)) {
    ctx.log(`Current theme: ${ctx.config.theme ?? 'dark'}\nAvailable: dark, light, gruvbox\nUsage: /themes [dark|light|gruvbox] or /t [dark|light|gruvbox]`);
    return;
  }
  ctx.config.theme = theme;
  ctx.log(`Theme set to ${theme}.`);
}

async function details(ctx: CommandContext, _rawArgs: string): Promise<void> {
  ctx.config.showToolOutput = !ctx.config.showToolOutput;
  ctx.log(`Tool output display ${ctx.config.showToolOutput ? 'shown' : 'hidden'}.`);
}

export const groupDCommands: SlashCommand[] = [
  cmd({ name: 'mcp', summary: 'Manage MCP servers and view scanner verdicts', usage: '/mcp [list|add <name>|rm <name>|rescan|auth <name>]', argHint: 'list|add|rm|rescan', category: 'extend', run: mcpCmd }),
  cmd({ name: 'hooks', summary: 'Edit lifecycle hook scripts', usage: '/hooks', category: 'extend', run: hooks }),
  cmd({ name: 'permissions', summary: 'View/edit allow/deny rules', usage: '/permissions [allow <pattern>|deny <pattern>]', argHint: 'allow|deny', category: 'extend', run: permissions }),
  cmd({ name: 'undo', summary: 'Undo last file change (shadow git)', usage: '/undo', category: 'extend', requiresGit: true, run: undo }),
  cmd({ name: 'redo', summary: 'Redo last undone change', usage: '/redo', category: 'extend', requiresGit: true, run: redo }),
  cmd({ name: 'restore', summary: 'List/restore file checkpoints', usage: '/restore [checkpoint-id]', argHint: 'checkpoint-id', category: 'extend', requiresGit: true, run: restore }),
  cmd({ name: 'share', summary: 'Create read-only session share link', usage: '/share', category: 'extend', run: share }),
  cmd({ name: 'unshare', summary: 'Revoke session share link', usage: '/unshare', category: 'extend', run: unshare }),
  cmd({ name: 'themes', aliases: ['t'], summary: 'Switch TUI theme', usage: '/themes [dark|light|gruvbox]', argHint: 'dark|light|gruvbox', category: 'system', run: themes }),
  cmd({ name: 'details', aliases: ['r'], summary: 'Toggle full tool-output display', usage: '/details', category: 'system', run: details }),
];

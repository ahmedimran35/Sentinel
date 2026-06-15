import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';
import { saveSession } from '../session-store.js';

const AGENT_TIMEOUT_MS = 300_000;
const DEFAULT_TOOL_TIMEOUT_MS = 5_000;

function cmd(def: Omit<SlashCommand, 'source' | 'kind'> & { kind?: SlashCommand['kind']; source?: SlashCommand['source'] }): SlashCommand {
  return { ...def, kind: def.kind ?? 'builtin', source: def.source ?? 'core' } as SlashCommand;
}

async function help(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const all = ctx.registry.all();
  const groups: Record<string, SlashCommand[]> = {};
  for (const c of all) {
    if (!groups[c.category]) groups[c.category] = [];
    groups[c.category]!.push(c);
  }
  const lines: string[] = ['Available commands:'];
  for (const [cat, cmds] of Object.entries(groups)) {
    lines.push(`\n  ${cat.toUpperCase()}:`);
    for (const c of cmds) {
      const aliasStr = c.aliases?.length ? ` (/${c.aliases.join(', /')})` : '';
      lines.push(`    ${c.usage}${aliasStr}  ${c.summary}`);
    }
  }
  lines.push('', 'Keybindings:  Tab=complete  Esc=interrupt  ↑↓=history');
  ctx.log(lines.join('\n'));
}

async function clear(ctx: CommandContext, _rawArgs: string): Promise<void> {
  ctx.session.history = [];
  ctx.session.tokenCounts = { input: 0, output: 0, cached: 0 };
  ctx.session.cost = 0;
  ctx.bus.emit({ type: 'compact_boundary', reason: 'clear' });
  ctx.log('Session cleared. Prior session is still resumable via /sessions.');
}

async function sessions(ctx: CommandContext, rawArgs: string): Promise<void> {
  const { listSessions, loadSession, removeSession, saveSession } = await import('../session-store.js');
  const args = parseArgs(rawArgs);
  const sub = args.positional[0];
  const id = args.positional[1];

  if (!sub || sub === 'list') {
    const all = listSessions(ctx.config.projectRoot);
    if (all.length === 0) {
      ctx.log(`No saved sessions.\nCurrent session: ${ctx.session.id}`);
      return;
    }
    let now = 'Current';
    const lines = all.slice(0, 20).map((s) => {
      const label = s.id === ctx.session.id ? ` ← ${now}` : '';
      if (s.id === ctx.session.id) now = '';
      const date = new Date(s.startTime).toLocaleString();
      const msgCount = s.history.filter((m) => m.role === 'user').length;
      return `  ${s.id}  ${date}  ${msgCount} msgs  $${s.cost.toFixed(4)}${label}`;
    });
    ctx.log(`Current session: ${ctx.session.id}\nSaved sessions:\n${lines.join('\n')}\nUse /sessions resume <id>`);
    return;
  }

  if (sub === 'resume') {
    if (!id) { ctx.log('Usage: /sessions resume <session-id>'); return; }
    const saved = loadSession(ctx.config.projectRoot, id);
    if (!saved) { ctx.log(`Session not found: ${id}`); return; }
    ctx.session.history = saved.history as typeof ctx.session.history;
    ctx.session.tokenCounts = saved.tokenCounts;
    ctx.session.cost = saved.cost;
    ctx.session.startTime = new Date(saved.startTime);
    ctx.config.model = saved.model;
    ctx.config.mode = saved.mode;
    ctx.session.id = saved.id;
    ctx.bus.emit({ type: 'compact_boundary', reason: 'session_switch' });
    ctx.log(`Resumed session ${id} (${saved.history.length} messages, $${saved.cost.toFixed(4)}).`);
    return;
  }

  if (sub === 'fork' && id) {
    const saved = loadSession(ctx.config.projectRoot, id);
    if (!saved) { ctx.log(`Session not found: ${id}`); return; }
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ctx.session.history = saved.history as typeof ctx.session.history;
    ctx.session.tokenCounts = saved.tokenCounts;
    ctx.session.cost = saved.cost;
    ctx.session.startTime = new Date();
    ctx.session.id = newId;
    ctx.config.model = saved.model;
    ctx.config.mode = saved.mode;
    saveSession(ctx.config.projectRoot, ctx.session, ctx.config);
    ctx.log(`Forked ${id} → ${newId}. Now working in forked session.`);
    return;
  }

  if (sub === 'rm' && id) {
    if (id === ctx.session.id) { ctx.log('Cannot delete the active session. Use /clear first.'); return; }
    if (removeSession(ctx.config.projectRoot, id)) {
      ctx.log(`Removed session ${id}.`);
    } else {
      ctx.log(`Session not found: ${id}`);
    }
    return;
  }

  ctx.log(`Usage: /sessions [list|resume <id>|fork <id>|rm <id>]`);
}

async function cost(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const { input, output, cached } = ctx.session.tokenCounts;
  const total = ctx.session.cost;
  const lines = [
    `Session tokens:  Input ${input.toLocaleString()}  Output ${output.toLocaleString()}  Cached ${cached.toLocaleString()}`,
    `Session cost:    $${total.toFixed(6)}`,
    `Lifetime total:  $${total.toFixed(6)} (SQLite tracking TBD)`,
  ];
  ctx.log(lines.join('\n'));
}

async function exportCmd(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const outPath = args.positional[0] ?? `./sentinel-session-${ctx.session.id}.md`;
  const safePath = path.resolve(ctx.config.projectRoot, outPath);

  const lines: string[] = [
    `# Sentinel Session: ${ctx.session.id}`,
    `**Date:** ${ctx.session.startTime.toISOString()}`,
    `**Project:** ${ctx.config.projectRoot}`,
    `**Model:** ${ctx.config.model}`,
    '',
    '## Messages',
    '',
  ];
  for (const msg of ctx.session.history) {
    if (msg.role === 'user') lines.push(`### User\n\n${msg.content ?? ''}\n`);
    else if (msg.role === 'assistant') lines.push(`### Sentinel\n\n${msg.content ?? ''}\n`);
    else if (msg.role === 'tool') lines.push(`### Tool: ${msg.name ?? 'unknown'}\n\n\`\`\`\n${msg.content ?? ''}\n\`\`\`\n`);
  }
  lines.push('---\n*Generated by Sentinel*');

  const output = lines.join('\n');
  const { redactSecrets } = await import('../secret-redactor.js');
  const { text } = redactSecrets(output);
  fs.writeFileSync(safePath, text, 'utf-8');
  ctx.log(`Session written to ${safePath}`);
}

async function editor(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `sentinel-compose-${Date.now()}.md`);
  const editorEnv = process.env.EDITOR ?? process.env.VISUAL ?? 'vim';
  try {
    fs.writeFileSync(tmpFile, '', 'utf-8');
    const editorParts = editorEnv.split(/\s+/);
    const editorResult = spawnSync(editorParts[0]!, [...editorParts.slice(1), tmpFile], { stdio: 'inherit', timeout: AGENT_TIMEOUT_MS });
    if (editorResult.status !== 0) throw new Error(`Editor exited with code ${editorResult.status}`);
    const content = fs.readFileSync(tmpFile, 'utf-8').trim();
    if (content) {
      ctx.session.history.push({ role: 'user', content });
      ctx.log(`Composed message injected as user turn (${content.length} chars).`);
    } else {
      ctx.log('Editor was empty — no message sent.');
    }
  } finally {
    try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
  }
}

async function copy(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const lastAssistant = [...ctx.session.history].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.content) {
    ctx.log('No assistant output to copy.');
    return;
  }
  try {
    const proc = process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
    const procParts = proc.split(/\s+/);
    const procResult = spawnSync(procParts[0]!, procParts.slice(1), { input: lastAssistant.content, timeout: DEFAULT_TOOL_TIMEOUT_MS });
    if (procResult.status !== 0) throw new Error();
    ctx.log(`Copied ${lastAssistant.content.length} chars to clipboard.`);
  } catch {
    const encoded = Buffer.from(lastAssistant.content).toString('base64');
    process.stdout.write(`\x1b]52;;${encoded}\x07`);
    ctx.log('Copied via OSC52 escape sequence.');
  }
}

async function status(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const lines = [
    `Project:    ${ctx.config.projectRoot}`,
    `Provider:   ${ctx.providers.getCurrent().provider}`,
    `Model:      ${ctx.config.model}`,
    `Mode:       ${ctx.config.mode}`,
    `Session:    ${ctx.session.id}`,
    `Messages:   ${ctx.session.history.length}`,
    `Tokens:     ${ctx.session.tokenCounts.input.toLocaleString()} in / ${ctx.session.tokenCounts.output.toLocaleString()} out`,
    `Cost:       $${ctx.session.cost.toFixed(6)}`,
  ];
  ctx.log(lines.join('\n'));
}

async function doctor(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const issues: string[] = [];
  try { spawnSync('node', ['--version'], { stdio: 'pipe', timeout: 5_000 }); } catch { issues.push('Node.js not found'); }
  try { spawnSync('rg', ['--version'], { stdio: 'pipe', timeout: 5_000 }); } catch { issues.push('ripgrep (rg) not found'); }
  try { spawnSync('typescript-language-server', ['--version'], { stdio: 'pipe', timeout: 5_000 }); } catch { issues.push('typescript-language-server not found'); }

  const authFiles = ['.env', '.env.local', '.sentinel/auth.json'];
  for (const f of authFiles) {
    const fp = path.resolve(process.cwd(), f);
    if (fs.existsSync(fp)) {
      const stat = fs.statSync(fp);
      if (stat.mode & 0o077) issues.push(`${f} has overly permissive permissions: ${(stat.mode & 0o777).toString(8)}`);
    }
  }

  if (issues.length === 0) {
    ctx.log('All checks passed. Sentinel is healthy.');
  } else {
    ctx.log(`Issues found:\n${issues.map((i) => `  ❌ ${i}`).join('\n')}`);
  }
}

async function configCmd(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const configPath = path.resolve(ctx.config.projectRoot, '.sentinel/config.json');
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(ctx.config, null, 2), 'utf-8');
  }
  const { z } = await import('zod');
  const ConfigSchema = z.object({
    projectRoot: z.string(),
    allowOutsideRoot: z.boolean().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
    theme: z.string().optional(),
  });

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    ConfigSchema.parse(raw);
  } catch (err) {
    ctx.log(`Config validation error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const editorEnv = process.env.EDITOR ?? process.env.VISUAL ?? 'vim';
  try {
    const editorParts = editorEnv.split(/\s+/);
    const editorResult = spawnSync(editorParts[0]!, [...editorParts.slice(1), configPath], { stdio: 'inherit', timeout: AGENT_TIMEOUT_MS });
    if (editorResult.status !== 0) throw new Error();
  } catch {
    ctx.log('Editor closed with non-zero exit — changes may not have been saved.');
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    ConfigSchema.parse(raw);
    ctx.log('Config saved and valid.');
  } catch (err) {
    ctx.log(`Config validation error after edit: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function bug(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const { redactSecrets } = await import('../secret-redactor.js');
  const body = redactSecrets(JSON.stringify({
    version: '0.1.0',
    platform: process.platform,
    node: process.version,
    model: ctx.config.model,
    mode: ctx.config.mode,
    messageCount: ctx.session.history.length,
    messages: ctx.session.history.map((m) => ({ role: m.role, content: m.content?.slice(0, 500) })),
  }, null, 2)).text;

  const url = `https://github.com/anomalyco/sentinel/issues/new?title=${encodeURIComponent('[bug] Report from session ' + ctx.session.id)}&body=${encodeURIComponent(body)}`;
  try {
    const openResult = spawnSync('open', [url], { stdio: 'ignore', timeout: 5_000 });
    if (openResult.status !== 0) throw new Error();
  } catch {
    try { const xdgResult = spawnSync('xdg-open', [url], { stdio: 'ignore', timeout: 5_000 }); if (xdgResult.status !== 0) throw new Error(); } catch { /* */ }
  }
  ctx.log('Bug report URL opened in browser (secrets redacted).');
}

async function exitCmd(ctx: CommandContext, _rawArgs: string): Promise<void> {
  saveSession(ctx.config.projectRoot, ctx.session, ctx.config);
  ctx.log(`Session saved: ${ctx.session.id}`);
  ctx.log(`Resume with: /sessions resume ${ctx.session.id}`);
  setTimeout(() => process.exit(0), 100);
}

export const groupACommands: SlashCommand[] = [
  cmd({ name: 'help', aliases: ['?', 'h'], summary: 'Show available commands grouped by category', usage: '/help', category: 'session', run: help }),
  cmd({ name: 'clear', aliases: ['new', 'n'], summary: 'Clear current session (resumable)', usage: '/clear', category: 'session', run: clear }),
  cmd({ name: 'sessions', aliases: ['resume', 'continue'], summary: 'List/resume/fork/rm sessions', usage: '/sessions [resume <id>|fork <id>|rm <id>]', argHint: 'list|resume|fork|rm', category: 'session', run: sessions }),
  cmd({ name: 'cost', summary: 'Show token usage and cost for this session', usage: '/cost', category: 'session', run: cost }),
  cmd({ name: 'export', summary: 'Write session transcript to markdown file', usage: '/export [path]', argHint: 'output path', category: 'session', run: exportCmd }),
  cmd({ name: 'editor', summary: 'Open $EDITOR to compose a long message', usage: '/editor', category: 'session', run: editor }),
  cmd({ name: 'copy', summary: 'Copy last assistant output to clipboard', usage: '/copy', category: 'session', run: copy }),
  cmd({ name: 'status', summary: 'Show account/provider/model/context health', usage: '/status', category: 'session', run: status }),
  cmd({ name: 'doctor', summary: 'Diagnose installation and environment', usage: '/doctor', category: 'session', run: doctor }),
  cmd({ name: 'config', aliases: ['settings'], summary: 'Open merged config in $EDITOR with validation', usage: '/config', category: 'system', run: configCmd }),
  cmd({ name: 'bug', summary: 'Open prefilled GitHub issue with session data', usage: '/bug', category: 'system', run: bug }),
  cmd({ name: 'exit', aliases: ['quit', 'q'], summary: 'Graceful shutdown', usage: '/exit', category: 'session', run: exitCmd }),
];

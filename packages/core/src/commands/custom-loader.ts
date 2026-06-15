import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import type { SlashCommand, CustomCommandMeta, CommandContext } from './types.js';

const FORBIDDEN_CMD_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs\./,
  /dd\s+if=/,
  /:\(\)\s*\{/,
  />\s*\/dev\/(sda|sdb|sdc|nvme)/,
];

export function loadCustomCommands(projectRoot: string): SlashCommand[] {
  const commands: SlashCommand[] = [];
  const dirs = [
    path.resolve(projectRoot, '.sentinel/commands'),
    path.resolve(os.homedir(), '.sentinel/commands'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findMdFiles(dir);
    for (const file of files) {
      const cmd = parseCommandFile(file, dir);
      if (cmd) commands.push(cmd);
    }
  }

  return commands;
}

export function refreshCustomCommands(registry: { register: (cmd: SlashCommand) => void; remove: (name: string) => boolean }, projectRoot: string): number {
  const cmds = loadCustomCommands(projectRoot);
  for (const cmd of cmds) {
    registry.register(cmd);
  }
  return cmds.length;
}

function findMdFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMdFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.toml')) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return files;
}

function parseCommandFile(filePath: string, baseDir: string): SlashCommand | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(baseDir, filePath);
    const parsed = parseFrontMatter(content);

    const name = parsed.meta.name ?? path.basename(filePath, path.extname(filePath));
    const namespace = parsed.meta.namespace ?? getNamespace(relativePath);

    const fullName = namespace ? `${namespace}:${name}` : name;

    return {
      name: fullName,
      summary: parsed.meta.description ?? `Custom command: ${fullName}`,
      usage: `/${fullName}` + (parsed.meta.argumentHint ? ` <${parsed.meta.argumentHint}>` : ''),
      argHint: parsed.meta.argumentHint,
      category: 'extend',
      kind: parsed.meta.disableModelInvocation ? 'builtin' : 'custom',
      source: baseDir.includes(os.homedir()) ? 'global' : 'project',
      requiresGit: false,
      run: async (ctx: CommandContext, rawArgs: string) => {
        const body = expandTemplate(parsed.body, rawArgs, ctx);
        if (parsed.meta.disableModelInvocation) {
          ctx.log(body);
        } else {
          const { runTurn } = await import('../run-turn.js');
          const { AlwaysAllowGate } = await import('../permission-gate.js');
          const { createProvider } = await import('./provider-factory.js');
          const current = ctx.providers.getCurrent();
          const provider = await createProvider(current.provider, parsed.meta.model ?? current.model);

          const turnId = `cmd-${Date.now().toString(36)}`;
          const stream = runTurn({
            turnId,
            config: { maxTurns: 1, timeoutMs: 60_000 },
            systemPrompt: body,
            history: [],
            tools: [],
            provider,
            gate: new AlwaysAllowGate(),
            signal: ctx.signal,
          });

          for await (const event of stream) {
            if (event.type === 'text_delta') process.stdout.write(event.delta);
          }
        }
      },
    };
  } catch {
    return null;
  }
}

interface ParsedCommandFile {
  meta: Partial<CustomCommandMeta>;
  body: string;
}

function parseFrontMatter(content: string): ParsedCommandFile {
  const meta: Partial<CustomCommandMeta> = {};

  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx > 0) {
      const yamlBlock = content.slice(3, endIdx).trim();
      for (const line of yamlBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (key === 'description') meta.description = val;
          else if (key === 'argument-hint') meta.argumentHint = val;
          else if (key === 'agent') meta.agent = val;
          else if (key === 'model') meta.model = val;
          else if (key === 'allowed-tools') meta.allowedTools = val.slice(1, -1).split(',').map((s: string) => s.trim());
          else if (key === 'disable-model-invocation') meta.disableModelInvocation = val === 'true';
        }
      }
      const body = content.slice(endIdx + 3).trim();
      return { meta, body };
    }
  }

  return { meta, body: content.trim() };
}

function expandTemplate(body: string, rawArgs: string, ctx: CommandContext): string {
  let result = body;

  // $ARGUMENTS → full raw string
  result = result.replace(/\$ARGUMENTS/g, rawArgs);

  // $1 $2 $3 → positional args
  const tokens = rawArgs.split(/\s+/);
  for (let i = 0; i < 9; i++) {
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), tokens[i] ?? '');
  }

  // @path → inject file content
  result = result.replace(/@(\S+)/g, (_match, p1: string) => {
    try {
      const fullPath = path.resolve(ctx.config.projectRoot, p1);
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return `@${p1}`;
    }
  });

  // !`cmd` → expand shell output (sandboxed with destructive-command guard)
  result = result.replace(/!`([^`]+)`/g, (_match, cmd: string) => {
    try {
      if (!cmd || cmd.length > 4096) return `!${cmd}`;
      if (FORBIDDEN_CMD_PATTERNS.some(p => p.test(cmd))) return `!${cmd}`;
      return spawnSync('sh', ['-c', cmd], { cwd: ctx.config.projectRoot, encoding: 'utf-8', timeout: 10_000 }).stdout?.trim() ?? '';
    } catch {
      return `!${cmd}`;
    }
  });

  return result;
}

function getNamespace(relativePath: string): string | null {
  const parts = relativePath.split(path.sep);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(':');
}

import { z } from 'zod';
import type { EventBus } from '../event-bus.js';
import type { CommandRegistry } from './registry.js';

export type CommandKind = 'builtin' | 'prompt' | 'mcp' | 'custom';
export type CommandSource = 'core' | 'project' | 'global' | 'mcp' | 'plugin';
export type CommandCategory = 'session' | 'context' | 'agent' | 'project' | 'extend' | 'system';

export interface Session {
  id: string;
  history: Array<{ role: string; content: string | null; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }>;
  startTime: Date;
  tokenCounts: { input: number; output: number; cached: number };
  cost: number;
}

export interface Config {
  projectRoot: string;
  allowOutsideRoot: boolean;
  mode: string;
  model: string;
  theme?: string;
  [key: string]: unknown;
}

export interface ProviderRegistry {
  getCurrent(): { provider: string; model: string };
  setCurrent(provider: string, model: string): Promise<void>;
  validate(provider: string, model: string): Promise<boolean>;
}

export interface ProjectFs {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  resolve(...segments: string[]): string;
}

export interface McpRegistry {
  listServers(): Array<{ name: string; status: string; verdict?: string }>;
  addServer(name: string, config: unknown): Promise<void>;
  removeServer(name: string): Promise<void>;
  rescan(): Promise<void>;
}

export interface ShadowGit {
  init(): Promise<void>;
  snapshot(files: Array<{ path: string; content: string }>): Promise<string>;
  undo(): Promise<Array<{ path: string; content: string }> | null>;
  redo(): Promise<Array<{ path: string; content: string }> | null>;
  listCheckpoints(): Promise<Array<{ id: string; timestamp: Date; fileCount: number }>>;
  restore(checkpointId: string): Promise<Array<{ path: string; content: string }>>;
}

export interface CommandContext {
  session: Session;
  bus: EventBus;
  config: Config;
  providers: ProviderRegistry;
  registry: CommandRegistry;
  fs: ProjectFs;
  git: ShadowGit;
  mcp: McpRegistry;
  log: (m: unknown) => void;
  signal: AbortSignal;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  summary: string;
  usage: string;
  argHint?: string;
  category: CommandCategory;
  kind: CommandKind;
  source: CommandSource;
  requiresGit?: boolean;
  args?: z.ZodTypeAny;
  run(ctx: CommandContext, rawArgs: string): Promise<void>;
}

export interface CustomCommandMeta {
  name: string;
  description?: string;
  argumentHint?: string;
  agent?: string;
  model?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  namespace?: string;
}

export interface ParsedArgs {
  positional: string[];
  named: Record<string, string>;
  files: Array<{ path: string; content: string }>;
  shellOutputs: Array<{ command: string; output: string }>;
  raw: string;
}

export function parseArgs(raw: string): ParsedArgs {
  const result: ParsedArgs = {
    positional: [],
    named: {},
    files: [],
    shellOutputs: [],
    raw,
  };

  if (!raw.trim()) return result;

  const tokens = tokenize(raw);
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;

    if (token.startsWith('@')) {
      result.files.push({ path: token.slice(1), content: '' });
      i++;
      continue;
    }

    if (token.startsWith('!') && token.length > 1) {
      result.shellOutputs.push({ command: token.slice(1), output: '' });
      i++;
      continue;
    }

    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx >= 0) {
        result.named[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      } else if (i + 1 < tokens.length) {
        const key = token.slice(2);
        i++;
        result.named[key] = tokens[i]!;
      }
      i++;
      continue;
    }

    result.positional.push(token);
    i++;
  }

  return result;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

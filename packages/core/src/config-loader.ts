import { readFileSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { SentinelConfigSchema } from './config-schema.js';
import { resolveConfigObject } from './config-vars.js';
import type { SentinelConfig } from './config-schema.js';

export enum ConfigSource {
  REMOTE = 'remote',
  GLOBAL = 'global',
  CUSTOM = 'custom',
  PROJECT = 'project',
  OPCODE_DIR = 'opcode_dir',
  INLINE = 'inline',
  MANAGED = 'managed',
}

export interface ConfigLevel {
  source: ConfigSource;
  data: SentinelConfig;
  path?: string;
}

const CONFIG_FILENAMES = ['opencode.json', 'opencode.jsonc'];
const REMOTE_TIMEOUT = 5_000;

function stripJsoncComments(raw: string): string {
  return raw
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*[\r\n]+/gm, '');
}

function parseConfig(raw: string, _path?: string): SentinelConfig {
  const cleaned = raw.trim().endsWith('.jsonc') || raw.includes('//') || raw.includes('/*')
    ? stripJsoncComments(raw)
    : raw;
  const parsed = JSON.parse(cleaned);
  return SentinelConfigSchema.parse(parsed);
}

function tryReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function findConfigInDir(dir: string): { path: string; raw: string } | null {
  for (const name of CONFIG_FILENAMES) {
    const fp = join(dir, name);
    const raw = tryReadFile(fp);
    if (raw !== null) return { path: fp, raw };
  }
  return null;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown> | undefined) ?? {} as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

async function tryFetchRemote(projectRoot: string): Promise<ConfigLevel | null> {
  try {
    const url = projectRoot.replace(/^https?:\/\//, '').split(/[/\\]/)[0] ?? 'localhost';
    const fetchUrl = `https://${url}/.well-known/opencode`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT);
    const response = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const raw = await response.text();
    const data = parseConfig(raw);
    return { source: ConfigSource.REMOTE, data, path: fetchUrl };
  } catch {
    return null;
  }
}

function loadGlobalConfig(): ConfigLevel | null {
  const home = homedir();
  const dir = join(home, '.config', 'sentinel');
  const found = findConfigInDir(dir);
  if (!found) return null;
  const data = parseConfig(found.raw, found.path);
  return { source: ConfigSource.GLOBAL, data, path: found.path };
}

function loadCustomConfig(customPath?: string): ConfigLevel | null {
  const path = customPath || process.env['OPENCODE_CONFIG'];
  if (!path) return null;
  const raw = tryReadFile(path);
  if (!raw) return null;
  const data = parseConfig(raw, path);
  return { source: ConfigSource.CUSTOM, data, path };
}

function loadProjectConfig(projectRoot: string): ConfigLevel | null {
  const found = findConfigInDir(projectRoot);
  if (!found) return null;
  const data = parseConfig(found.raw, found.path);
  return { source: ConfigSource.PROJECT, data, path: found.path };
}

function findGitRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

function loadOpcodeDirConfig(projectRoot: string): ConfigLevel | null {
  const gitRoot = findGitRoot(projectRoot);
  let current = gitRoot;
  while (true) {
    const opcodeDir = join(current, '.opencode');
    const found = findConfigInDir(opcodeDir);
    if (found) {
      const data = parseConfig(found.raw, found.path);
      return { source: ConfigSource.OPCODE_DIR, data, path: found.path };
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function loadInlineConfig(configContent?: string): ConfigLevel | null {
  if (!configContent) return null;
  const data = parseConfig(configContent);
  return { source: ConfigSource.INLINE, data };
}

function getManagedConfigPath(): string | null {
  const plt = platform();
  if (plt === 'darwin') {
    return '/Library/Application Support/sentinel/opencode.json';
  }
  if (plt === 'win32') {
    const progData = process.env['ProgramData'];
    return progData ? join(progData, 'sentinel', 'opencode.json') : null;
  }
  return '/etc/sentinel/opencode.json';
}

function loadManagedConfig(): ConfigLevel | null {
  const mgmtPath = getManagedConfigPath();
  if (!mgmtPath) return null;
  const raw = tryReadFile(mgmtPath);
  if (!raw) return null;
  const data = parseConfig(raw, mgmtPath);
  return { source: ConfigSource.MANAGED, data, path: mgmtPath };
}

export async function loadConfig(options?: {
  configPath?: string;
  configDir?: string;
  configContent?: string;
  projectRoot?: string;
}): Promise<SentinelConfig> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const configDir = options?.configDir ?? dirname(
    options?.configPath ?? join(projectRoot, 'opencode.json'),
  );

  const layers: ConfigLevel[] = [];

  const remote = await tryFetchRemote(projectRoot);
  if (remote) layers.push(remote);

  const global = loadGlobalConfig();
  if (global) layers.push(global);

  const custom = loadCustomConfig(options?.configPath);
  if (custom) layers.push(custom);

  const project = loadProjectConfig(projectRoot);
  if (project) layers.push(project);

  const opcodeDir = loadOpcodeDirConfig(projectRoot);
  if (opcodeDir) layers.push(opcodeDir);

  const inline = loadInlineConfig(options?.configContent);
  if (inline) layers.push(inline);

  const managed = loadManagedConfig();
  if (managed) layers.push(managed);

  let merged: Record<string, unknown> = {};
  for (const layer of layers) {
    merged = deepMerge(merged, layer.data as Record<string, unknown>);
  }

  const resolved = resolveConfigObject(merged, configDir);

  return SentinelConfigSchema.parse(resolved) as SentinelConfig;
}

export { SentinelConfigSchema } from './config-schema.js';
export type { SentinelConfig, PermissionConfig, FormatterEntryConfig, LSPEntryConfig, MCPEntryConfig, CustomToolEntry } from './config-schema.js';

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface AttentionConfig {
  enabled: boolean;
  notifications: boolean;
  sound: boolean;
  volume: number;
}

export type DiffStyle = 'auto' | 'stacked';

export interface TUIConfig {
  attention: AttentionConfig;
  diff_style: DiffStyle;
  theme?: string;
  scroll_speed?: number;
  scroll_acceleration?: { enabled?: boolean };
  mouse?: boolean;
}

const DEFAULT_CONFIG: TUIConfig = {
  attention: {
    enabled: false,
    notifications: true,
    sound: true,
    volume: 0.4,
  },
  diff_style: 'auto',
};

function findConfigFiles(): string[] {
  const candidates: string[] = [];

  const globalDir = join(homedir(), '.config', 'opencode');
  for (const ext of ['jsonc', 'json']) {
    const p = join(globalDir, `tui.${ext}`);
    if (existsSync(p)) candidates.push(p);
  }

  const envPath = process.env.OPENCODE_TUI_CONFIG;
  if (envPath && existsSync(envPath)) {
    candidates.push(envPath);
  }

  for (const ext of ['jsonc', 'json']) {
    const p = resolve(process.cwd(), `tui.${ext}`);
    if (existsSync(p) && !candidates.includes(p)) candidates.push(p);
  }

  return candidates;
}

function stripJsoncComments(raw: string): string {
  return raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseConfigFile(filePath: string): Partial<TUIConfig> | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const cleaned = filePath.endsWith('.jsonc') ? stripJsoncComments(raw) : raw;
    return JSON.parse(cleaned) as Partial<TUIConfig>;
  } catch {
    return null;
  }
}

export function loadTUIConfig(): TUIConfig {
  const config = { ...DEFAULT_CONFIG };
  const files = findConfigFiles();

  for (const file of files) {
    const partial = parseConfigFile(file);
    if (!partial) continue;
    if (partial.attention) {
      config.attention = { ...config.attention, ...partial.attention };
    }
    if (partial.diff_style === 'auto' || partial.diff_style === 'stacked') {
      config.diff_style = partial.diff_style;
    }
    if (partial.theme !== undefined) config.theme = partial.theme;
    if (partial.scroll_speed !== undefined) config.scroll_speed = partial.scroll_speed;
    if (partial.scroll_acceleration !== undefined) {
      config.scroll_acceleration = { ...config.scroll_acceleration, ...partial.scroll_acceleration };
    }
    if (partial.mouse !== undefined) config.mouse = partial.mouse;
  }

  return config;
}

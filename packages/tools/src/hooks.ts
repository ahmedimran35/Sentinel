import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export type HookEvent = 'session_start' | 'pre_tool' | 'post_tool' | 'pre_commit';

export interface HooksConfig {
  hooks?: Partial<Record<HookEvent, string>>;
}

const HOOKS_PATH = '.sentinel/hooks.json';

export async function loadHooks(rootDir?: string): Promise<HooksConfig> {
  try {
    const hooksPath = rootDir ? path.resolve(rootDir, HOOKS_PATH) : path.resolve(HOOKS_PATH);
    const content = await fs.readFile(hooksPath, 'utf-8');
    return JSON.parse(content) as HooksConfig;
  } catch {
    return {};
  }
}

export function runHook(hook: HookEvent, config: HooksConfig, data?: Record<string, string>): boolean {
  const cmd = config.hooks?.[hook];
  if (!cmd) return true;

  try {
    let resolved = cmd;
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        resolved = resolved.replaceAll(`{${key}}`, value);
      }
    }
    execSync(resolved, { timeout: 30_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

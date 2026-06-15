import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Plugin {
  name: string;
  version: string;
  hooks: Record<string, Function>;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
}

interface PluginConfig {
  enabled: string[];
}

interface LoadedPlugin {
  name: string;
  plugin: Plugin;
  active: boolean;
}

export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginsDir: string;
  private configPath: string;
  private importModule: (url: string) => Promise<Record<string, unknown>>;

  constructor(options?: {
    pluginsDir?: string;
    configPath?: string;
    importModule?: (url: string) => Promise<Record<string, unknown>>;
  }) {
    this.pluginsDir = options?.pluginsDir ?? join(homedir(), '.config', 'sentinel', 'plugins');
    this.configPath = options?.configPath ?? join(homedir(), '.config', 'sentinel', 'plugins.json');
    this.importModule = options?.importModule ?? ((url: string) => import(url));
  }

  scan(): string[] {
    if (!existsSync(this.pluginsDir)) return [];
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    const discovered: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(this.pluginsDir, entry.name);
      if (existsSync(join(dir, 'plugin.js')) || existsSync(join(dir, 'plugin.mjs'))) {
        discovered.push(entry.name);
      }
    }
    return discovered;
  }

  async load(name: string): Promise<void> {
    if (this.plugins.has(name)) return;

    const entryPath = join(this.pluginsDir, name);
    const jsPath = join(entryPath, 'plugin.js');
    const mjsPath = join(entryPath, 'plugin.mjs');

    let resolvedPath: string;
    if (existsSync(jsPath)) {
      resolvedPath = jsPath;
    } else if (existsSync(mjsPath)) {
      resolvedPath = mjsPath;
    } else {
      throw new Error(`Plugin "${name}" not found at ${entryPath}`);
    }

    const url = pathToFileURL(resolvedPath).href;
    const mod = await this.importModule(url);
    const plugin = ((mod as { default?: Plugin }).default ?? mod) as Plugin | undefined;

    if (!plugin || typeof plugin.activate !== 'function') {
      throw new Error(`Plugin "${name}" does not export a valid Plugin object`);
    }

    this.plugins.set(name, { name, plugin, active: false });
  }

  unload(name: string): void {
    const loaded = this.plugins.get(name);
    if (!loaded) return;
    if (loaded.active) {
      try {
        loaded.plugin.deactivate();
      } catch {
        // isolate deactivation errors
      }
    }
    this.plugins.delete(name);
  }

  async activateAll(): Promise<void> {
    const config = this.loadConfig();
    const enabled = new Set(config.enabled);
    const hasEnabledFilter = enabled.size > 0;

    for (const [, loaded] of this.plugins) {
      if (hasEnabledFilter && !enabled.has(loaded.name)) continue;
      if (loaded.active) continue;
      try {
        await loaded.plugin.activate();
        loaded.active = true;
      } catch {
        // isolate activation errors; one bad plugin doesn't break others
      }
    }
  }

  async deactivateAll(): Promise<void> {
    for (const [, loaded] of this.plugins) {
      if (!loaded.active) continue;
      try {
        await loaded.plugin.deactivate();
        loaded.active = false;
      } catch {
        // isolate deactivation errors
      }
    }
  }

  getHook(hookName: string): Function[] {
    const fns: Function[] = [];
    for (const [, loaded] of this.plugins) {
      const fn = loaded.plugin.hooks[hookName];
      if (typeof fn === 'function') {
        fns.push(fn);
      }
    }
    return fns;
  }

  /**
   * Auto-install npm plugins from the config's plugin array.
   * Installs missing plugins via npm, caches in ~/.cache/sentinel/plugins/
   */
  async installNpmPlugins(pluginNames: string[]): Promise<void> {
    const { spawnSync } = await import('node:child_process');
    const cacheDir = join(homedir(), '.cache', 'sentinel', 'plugins');
    const fs = await import('node:fs');

    for (const name of pluginNames) {
      const targetDir = join(cacheDir, name);
      if (existsSync(join(targetDir, 'node_modules'))) {
        this.pluginsDir = targetDir;
        continue;
      }

      try {
        fs.mkdirSync(targetDir, { recursive: true });
        spawnSync('npm', ['install', '--prefix', targetDir, name], {
          stdio: 'ignore',
          timeout: 60_000,
        });
        if (!existsSync(join(this.pluginsDir, name))) {
          try { fs.symlinkSync(targetDir, join(this.pluginsDir, name), 'junction'); } catch { /* fallback */ }
        }
      } catch {
        // non-fatal — plugin will be unavailable
      }
    }
  }

  private loadConfig(): PluginConfig {
    try {
      if (existsSync(this.configPath)) {
        return JSON.parse(readFileSync(this.configPath, 'utf-8')) as PluginConfig;
      }
    } catch {
      // config parse errors are non-fatal
    }
    return { enabled: [] };
  }
}

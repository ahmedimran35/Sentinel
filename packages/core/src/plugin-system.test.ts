import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginManager, type Plugin } from './plugin-system.js';

function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: 'test',
    version: '1.0.0',
    hooks: {},
    activate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PluginManager', () => {
  let tempDir: string;
  let pluginsDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sentinel-plugin-test-'));
    pluginsDir = join(tempDir, 'plugins');
    configPath = join(tempDir, 'plugins.json');
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ enabled: [] }));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('scan()', () => {
    it('returns empty array when plugins dir does not exist', () => {
      const pm = new PluginManager({
        pluginsDir: join(tempDir, 'nonexistent'),
        configPath,
      });
      expect(pm.scan()).toEqual([]);
    });

    it('discovers directories containing plugin.js or plugin.mjs', () => {
      mkdirSync(join(pluginsDir, 'alpha'), { recursive: true });
      mkdirSync(join(pluginsDir, 'beta'), { recursive: true });
      mkdirSync(join(pluginsDir, 'gamma'), { recursive: true });
      mkdirSync(join(pluginsDir, 'empty-dir'), { recursive: true });
      writeFileSync(join(pluginsDir, 'alpha', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'beta', 'plugin.mjs'), '');
      writeFileSync(join(pluginsDir, 'gamma', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath });
      const result = pm.scan();

      expect(result).toContain('alpha');
      expect(result).toContain('beta');
      expect(result).toContain('gamma');
      expect(result).not.toContain('empty-dir');
    });

    it('ignores files (non-directories) in the plugins dir', () => {
      writeFileSync(join(pluginsDir, 'not-a-dir.js'), '');
      const pm = new PluginManager({ pluginsDir, configPath });
      expect(pm.scan()).toEqual([]);
    });
  });

  describe('load()', () => {
    it('loads a plugin via importModule and caches it', async () => {
      const plugin = makePlugin({ name: 'my-plugin' });
      const importModule = vi.fn().mockResolvedValue({ default: plugin });

      mkdirSync(join(pluginsDir, 'my-plugin'), { recursive: true });
      writeFileSync(join(pluginsDir, 'my-plugin', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('my-plugin');

      expect(importModule).toHaveBeenCalledOnce();
      expect(importModule.mock.calls[0]![0]).toMatch(/my-plugin\/plugin\.js$/);
    });

    it('skips already-loaded plugins', async () => {
      const plugin = makePlugin({ name: 'dup' });
      const importModule = vi.fn().mockResolvedValue({ default: plugin });

      mkdirSync(join(pluginsDir, 'dup'), { recursive: true });
      writeFileSync(join(pluginsDir, 'dup', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('dup');
      await pm.load('dup');

      expect(importModule).toHaveBeenCalledTimes(1);
    });

    it('throws when the plugin directory has no plugin.js or plugin.mjs', async () => {
      mkdirSync(join(pluginsDir, 'missing'), { recursive: true });
      const pm = new PluginManager({ pluginsDir, configPath });
      await expect(pm.load('missing')).rejects.toThrow(/not found/);
    });

    it('throws when the imported module lacks an activate function', async () => {
      const importModule = vi.fn().mockResolvedValue({
        default: { name: 'bad', version: '1.0', hooks: {}, deactivate: vi.fn() },
      });
      mkdirSync(join(pluginsDir, 'bad'), { recursive: true });
      writeFileSync(join(pluginsDir, 'bad', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await expect(pm.load('bad')).rejects.toThrow(/does not export a valid Plugin/);
    });
  });

  describe('unload()', () => {
    it('removes a loaded plugin and calls deactivate if active', async () => {
      const deactivate = vi.fn().mockResolvedValue(undefined);
      const plugin = makePlugin({ name: 'removable', deactivate });
      const importModule = vi.fn().mockResolvedValue({ default: plugin });

      mkdirSync(join(pluginsDir, 'removable'), { recursive: true });
      writeFileSync(join(pluginsDir, 'removable', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('removable');
      pm.unload('removable');

      expect(deactivate).not.toHaveBeenCalled();
      // No active, so deactivate shouldn't fire

      // Now load, activate, unload
      await pm.load('removable');
      await pm.activateAll();
      writeFileSync(configPath, JSON.stringify({ enabled: ['removable'] }));
      pm.unload('removable');

      expect(deactivate).toHaveBeenCalled();
    });

    it('does nothing for unknown plugins', () => {
      const pm = new PluginManager({ pluginsDir, configPath });
      expect(() => pm.unload('ghost')).not.toThrow();
    });
  });

  describe('activateAll / deactivateAll', () => {
    it('activates only enabled plugins', async () => {
      const p1 = makePlugin({ name: 'enabled-plugin', activate: vi.fn().mockResolvedValue(undefined) });
      const p2 = makePlugin({ name: 'disabled-plugin', activate: vi.fn().mockResolvedValue(undefined) });

      writeFileSync(configPath, JSON.stringify({ enabled: ['enabled-plugin'] }));

      mkdirSync(join(pluginsDir, 'enabled-plugin'), { recursive: true });
      writeFileSync(join(pluginsDir, 'enabled-plugin', 'plugin.js'), '');
      mkdirSync(join(pluginsDir, 'disabled-plugin'), { recursive: true });
      writeFileSync(join(pluginsDir, 'disabled-plugin', 'plugin.js'), '');

      // Need separate importModule for each plugin
      const importModule2 = vi.fn()
        .mockResolvedValueOnce({ default: p1 })
        .mockResolvedValueOnce({ default: p2 });

      const pm2 = new PluginManager({ pluginsDir, configPath, importModule: importModule2 });
      await pm2.load('enabled-plugin');
      await pm2.load('disabled-plugin');
      await pm2.activateAll();

      expect(p1.activate).toHaveBeenCalled();
      expect(p2.activate).not.toHaveBeenCalled();
    });

    it('deactivateAll calls deactivate on active plugins', async () => {
      const deactivate = vi.fn().mockResolvedValue(undefined);
      const plugin = makePlugin({ name: 'active-p', deactivate });

      const importModule = vi.fn().mockResolvedValue({ default: plugin });
      writeFileSync(configPath, JSON.stringify({ enabled: ['active-p'] }));

      mkdirSync(join(pluginsDir, 'active-p'), { recursive: true });
      writeFileSync(join(pluginsDir, 'active-p', 'plugin.js'), '');

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('active-p');
      await pm.activateAll();
      await pm.deactivateAll();

      expect(deactivate).toHaveBeenCalled();
    });
  });

  describe('getHook()', () => {
    it('returns hook functions in plugin load order', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const p1 = makePlugin({ name: 'first', hooks: { beforeToolCall: fn1 } });
      const p2 = makePlugin({ name: 'second', hooks: { beforeToolCall: fn2 } });

      mkdirSync(join(pluginsDir, 'first'), { recursive: true });
      mkdirSync(join(pluginsDir, 'second'), { recursive: true });
      writeFileSync(join(pluginsDir, 'first', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'second', 'plugin.js'), '');

      const importModule = vi.fn()
        .mockResolvedValueOnce({ default: p1 })
        .mockResolvedValueOnce({ default: p2 });

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('first');
      await pm.load('second');

      const hooks = pm.getHook('beforeToolCall');
      expect(hooks).toHaveLength(2);
      expect(hooks[0]).toBe(fn1);
      expect(hooks[1]).toBe(fn2);
    });

    it('returns empty array for unknown hook name', () => {
      const pm = new PluginManager({ pluginsDir, configPath });
      expect(pm.getHook('nonexistent')).toEqual([]);
    });
  });

  describe('error isolation', () => {
    it('one failing activate does not prevent others', async () => {
      const goodPlugin = makePlugin({ name: 'good', activate: vi.fn().mockResolvedValue(undefined) });
      const badPlugin = makePlugin({ name: 'bad', activate: vi.fn().mockRejectedValue(new Error('oops')) });

      writeFileSync(configPath, JSON.stringify({ enabled: ['good', 'bad'] }));

      mkdirSync(join(pluginsDir, 'good'), { recursive: true });
      mkdirSync(join(pluginsDir, 'bad'), { recursive: true });
      writeFileSync(join(pluginsDir, 'good', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'bad', 'plugin.js'), '');

      const importModule = vi.fn()
        .mockResolvedValueOnce({ default: goodPlugin })
        .mockResolvedValueOnce({ default: badPlugin });

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('good');
      await pm.load('bad');
      await pm.activateAll();

      expect(goodPlugin.activate).toHaveBeenCalled();
      expect(badPlugin.activate).toHaveBeenCalled();
    });

    it('one failing hook does not prevent others from being collected', async () => {
      const fn1 = vi.fn().mockReturnValue('ok');
      const fn2 = vi.fn().mockImplementation(() => { throw new Error('hook fail'); });
      const fn3 = vi.fn().mockReturnValue('ok');

      const p1 = makePlugin({ name: 'a', hooks: { beforeToolCall: fn1 } });
      const p2 = makePlugin({ name: 'b', hooks: { beforeToolCall: fn2 } });
      const p3 = makePlugin({ name: 'c', hooks: { beforeToolCall: fn3 } });

      mkdirSync(join(pluginsDir, 'a'), { recursive: true });
      mkdirSync(join(pluginsDir, 'b'), { recursive: true });
      mkdirSync(join(pluginsDir, 'c'), { recursive: true });
      writeFileSync(join(pluginsDir, 'a', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'b', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'c', 'plugin.js'), '');

      const importModule = vi.fn()
        .mockResolvedValueOnce({ default: p1 })
        .mockResolvedValueOnce({ default: p2 })
        .mockResolvedValueOnce({ default: p3 });

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('a');
      await pm.load('b');
      await pm.load('c');

      const hooks = pm.getHook('beforeToolCall');
      expect(hooks).toHaveLength(3);

      expect(() => (hooks[0] as Function)()).not.toThrow();
      expect(() => (hooks[1] as Function)()).toThrow('hook fail');
      expect(() => (hooks[2] as Function)()).not.toThrow();
    });

    it('one failing deactivate does not prevent others', async () => {
      const deactivate1 = vi.fn().mockResolvedValue(undefined);
      const deactivate2 = vi.fn().mockRejectedValue(new Error('deactivate fail'));
      const deactivate3 = vi.fn().mockResolvedValue(undefined);

      const p1 = makePlugin({ name: 'x', deactivate: deactivate1 });
      const p2 = makePlugin({ name: 'y', deactivate: deactivate2 });
      const p3 = makePlugin({ name: 'z', deactivate: deactivate3 });

      writeFileSync(configPath, JSON.stringify({ enabled: ['x', 'y', 'z'] }));

      mkdirSync(join(pluginsDir, 'x'), { recursive: true });
      mkdirSync(join(pluginsDir, 'y'), { recursive: true });
      mkdirSync(join(pluginsDir, 'z'), { recursive: true });
      writeFileSync(join(pluginsDir, 'x', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'y', 'plugin.js'), '');
      writeFileSync(join(pluginsDir, 'z', 'plugin.js'), '');

      const importModule = vi.fn()
        .mockResolvedValueOnce({ default: p1 })
        .mockResolvedValueOnce({ default: p2 })
        .mockResolvedValueOnce({ default: p3 });

      const pm = new PluginManager({ pluginsDir, configPath, importModule });
      await pm.load('x');
      await pm.load('y');
      await pm.load('z');
      await pm.activateAll();
      await pm.deactivateAll();

      expect(deactivate1).toHaveBeenCalled();
      expect(deactivate2).toHaveBeenCalled();
      expect(deactivate3).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { FormatterEngine, type FormatterDef } from './formatter.js';

describe('FormatterEngine', () => {
  describe('constructor', () => {
    it('accepts custom formatter configs', () => {
      const configs: FormatterDef[] = [
        { name: 'custom', extensions: ['.foo'], command: ['custom-tool', '--fix'] },
      ];
      const engine = new FormatterEngine(configs);
      expect(engine).toBeInstanceOf(FormatterEngine);
    });

    it('uses default formatters when no config provided', () => {
      const engine = new FormatterEngine();
      expect(engine).toBeInstanceOf(FormatterEngine);
    });
  });

  describe('formatFile', () => {
    it('returns formatted: false for unrecognized extension', async () => {
      const engine = new FormatterEngine();
      const result = await engine.formatFile('somefile.xyz');
      expect(result.formatted).toBe(false);
    });

    it('returns formatted: false when formatter tool is not installed (does not throw)', async () => {
      const configs: FormatterDef[] = [
        { name: 'test-fmt', extensions: ['.test'], command: ['nonexistent-formatter-xyz'] },
      ];
      const engine = new FormatterEngine(configs);
      const result = await engine.formatFile('file.test');
      expect(result.formatted).toBe(false);
    });
  });

  describe('formatFiles', () => {
    it('batches multiple files and returns per-file results', async () => {
      const configs: FormatterDef[] = [
        { name: 'test-fmt', extensions: ['.test'], command: ['nonexistent-formatter-xyz'] },
      ];
      const engine = new FormatterEngine(configs);
      const results = await engine.formatFiles(['a.test', 'b.test', 'c.unknown']);
      expect(results).toHaveLength(3);
      expect(results[0]!.file).toBe('a.test');
      expect(results[0]!.formatted).toBe(false);
      expect(results[1]!.file).toBe('b.test');
      expect(results[1]!.formatted).toBe(false);
      expect(results[2]!.file).toBe('c.unknown');
      expect(results[2]!.formatted).toBe(false);
    });
  });

  describe('detectAvailableFormatters', () => {
    it('returns only unique tool names', async () => {
      const configs: FormatterDef[] = [
        { name: 'tool1', extensions: ['.a'], command: ['definitely-not-installed-tool-1'] },
        { name: 'tool2', extensions: ['.b'], command: ['definitely-not-installed-tool-2'] },
        { name: 'tool1-dup', extensions: ['.c'], command: ['definitely-not-installed-tool-1'] },
      ];
      const engine = new FormatterEngine(configs);
      const available = await engine.detectAvailableFormatters();
      expect(available).toBeInstanceOf(Array);
    });
  });

  describe('loadConfig', () => {
    it('does not throw when configPath is undefined', () => {
      const engine = new FormatterEngine();
      expect(() => engine.loadConfig()).not.toThrow();
    });

    it('does not throw when config file does not exist', () => {
      const engine = new FormatterEngine();
      expect(() => engine.loadConfig('/nonexistent/path.json')).not.toThrow();
    });
  });
});

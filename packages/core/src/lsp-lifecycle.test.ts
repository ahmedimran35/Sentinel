import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LSPLifecycle } from './lsp-lifecycle.js';
import { LSPManager } from './lsp-manager.js';

describe('LSPLifecycle', () => {
  let lifecycle: LSPLifecycle;

  beforeEach(() => {
    vi.spyOn(LSPManager.prototype, 'start').mockResolvedValue('typescript');
    vi.spyOn(LSPManager.prototype, 'stop').mockImplementation(() => {});
    vi.spyOn(LSPManager.prototype, 'requestDiagnostics').mockResolvedValue([]);
    vi.spyOn(LSPManager.prototype, 'openDocument').mockResolvedValue(undefined);
    vi.useFakeTimers();
    process.env.OPENCODE_DISABLE_LSP_DOWNLOAD = 'true';
    lifecycle = new LSPLifecycle(60_000);
  });

  afterEach(() => {
    delete process.env.OPENCODE_DISABLE_LSP_DOWNLOAD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('ensureLanguageServer', () => {
    it('creates an LSP manager for a known language', async () => {
      const lsp = await lifecycle.ensureLanguageServer('src/index.ts');
      expect(lsp).toBeInstanceOf(LSPManager);
      expect(lifecycle.runningLanguages).toContain('typescript');
    });

    it('returns null for unknown languages', async () => {
      const lsp = await lifecycle.ensureLanguageServer('README.md');
      expect(lsp).toBeNull();
      expect(lifecycle.runningLanguages).toHaveLength(0);
    });

    it('reuses an existing manager for the same language', async () => {
      const lsp1 = await lifecycle.ensureLanguageServer('src/index.ts');
      const lsp2 = await lifecycle.ensureLanguageServer('lib/util.ts');
      expect(lsp1).toBe(lsp2);
      expect(lsp1).toBeInstanceOf(LSPManager);
      expect(lifecycle.fileCounts.typescript).toBe(2);
    });

    it('handles LSP start failure gracefully', async () => {
      vi.spyOn(LSPManager.prototype, 'start').mockRejectedValue(new Error('server not found'));
      const lsp = await lifecycle.ensureLanguageServer('src/index.ts');
      expect(lsp).toBeInstanceOf(LSPManager);
      expect(lifecycle.runningLanguages).toContain('typescript');
    });

    it('increments fileCount on repeated calls', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await lifecycle.ensureLanguageServer('src/index.ts');
      expect(lifecycle.fileCounts.typescript).toBe(2);
    });
  });

  describe('onFileOpen', () => {
    it('does not throw for a known language', async () => {
      await expect(lifecycle.onFileOpen('src/index.ts')).resolves.toBeUndefined();
      expect(lifecycle.runningLanguages).toContain('typescript');
    });

    it('does not throw for an unknown language', async () => {
      await expect(lifecycle.onFileOpen('README.md')).resolves.toBeUndefined();
      expect(lifecycle.runningLanguages).toHaveLength(0);
    });

    it('does not throw when LSP start fails', async () => {
      vi.spyOn(LSPManager.prototype, 'start').mockRejectedValue(new Error('crash'));
      await expect(lifecycle.onFileOpen('src/index.ts')).resolves.toBeUndefined();
    });
  });

  describe('onFileSave', () => {
    it('does not throw for a known language', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await expect(lifecycle.onFileSave('src/index.ts')).resolves.toBeUndefined();
    });

    it('does not throw when no server is running', async () => {
      await expect(lifecycle.onFileSave('src/index.ts')).resolves.toBeUndefined();
    });

    it('does not throw for unknown languages', async () => {
      await expect(lifecycle.onFileSave('README.md')).resolves.toBeUndefined();
    });
  });

  describe('onFileClose', () => {
    it('decrements fileCount', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await lifecycle.ensureLanguageServer('lib/util.ts');
      expect(lifecycle.fileCounts.typescript).toBe(2);
      lifecycle.onFileClose('src/index.ts');
      expect(lifecycle.fileCounts.typescript).toBe(1);
    });

    it('schedules idle shutdown when count reaches zero', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      lifecycle.onFileClose('src/index.ts');
      expect(lifecycle.runningLanguages).toContain('typescript');
      vi.advanceTimersByTime(60_000);
      expect(lifecycle.runningLanguages).not.toContain('typescript');
    });

    it('cancels idle shutdown if a file is reopened', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      lifecycle.onFileClose('src/index.ts');
      vi.advanceTimersByTime(30_000);
      await lifecycle.ensureLanguageServer('src/index.ts');
      vi.advanceTimersByTime(60_000);
      expect(lifecycle.runningLanguages).toContain('typescript');
    });

    it('handles close for unknown language gracefully', () => {
      expect(() => lifecycle.onFileClose('README.md')).not.toThrow();
    });

    it('handles close for language with no running server gracefully', () => {
      expect(() => lifecycle.onFileClose('src/index.ts')).not.toThrow();
    });
  });

  describe('getDiagnostics', () => {
    it('ensures LSP is running and returns diagnostics', async () => {
      const diags = await lifecycle.getDiagnostics('src/index.ts');
      expect(diags).toEqual([]);
      expect(lifecycle.runningLanguages).toContain('typescript');
    });

    it('returns empty array for unknown languages', async () => {
      const diags = await lifecycle.getDiagnostics('README.md');
      expect(diags).toEqual([]);
    });

    it('opens the document before requesting diagnostics', async () => {
      const openSpy = vi.spyOn(LSPManager.prototype, 'openDocument');
      await lifecycle.getDiagnostics('src/index.ts');
      expect(openSpy).toHaveBeenCalledWith('typescript', 'src/index.ts');
    });
  });

  describe('shutdownAll', () => {
    it('cleans up all running servers', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await lifecycle.ensureLanguageServer('main.py');
      expect(lifecycle.runningLanguages).toHaveLength(2);
      lifecycle.shutdownAll();
      expect(lifecycle.runningLanguages).toHaveLength(0);
    });

    it('calls stop on each manager', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      const stopSpy = vi.spyOn(LSPManager.prototype, 'stop');
      lifecycle.shutdownAll();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('is safe to call when no servers are running', () => {
      expect(() => lifecycle.shutdownAll()).not.toThrow();
    });

    it('cancels idle timers on shutdown', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      lifecycle.onFileClose('src/index.ts');
      lifecycle.shutdownAll();
      vi.advanceTimersByTime(60_000);
      expect(lifecycle.runningLanguages).toHaveLength(0);
    });
  });

  describe('runningLanguages', () => {
    it('returns empty array initially', () => {
      expect(lifecycle.runningLanguages).toEqual([]);
    });

    it('returns running language names', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await lifecycle.ensureLanguageServer('main.py');
      expect(lifecycle.runningLanguages).toContain('typescript');
      expect(lifecycle.runningLanguages).toContain('pyright');
    });
  });

  describe('fileCounts', () => {
    it('returns empty object initially', () => {
      expect(lifecycle.fileCounts).toEqual({});
    });

    it('returns file counts per language', async () => {
      await lifecycle.ensureLanguageServer('src/index.ts');
      await lifecycle.ensureLanguageServer('lib/util.ts');
      await lifecycle.ensureLanguageServer('main.py');
      expect(lifecycle.fileCounts).toEqual({ typescript: 2, pyright: 1 });
    });
  });
});

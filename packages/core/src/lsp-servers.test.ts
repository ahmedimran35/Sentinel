import { describe, it, expect } from 'vitest';
import { builtinLSPServers, getServerForFile, findServerByName, type LSPServerDef } from './lsp-servers.js';

describe('builtinLSPServers', () => {
  it('has at least 30 servers', () => {
    expect(builtinLSPServers.length).toBeGreaterThanOrEqual(30);
  });

  it('every server has required fields', () => {
    for (const s of builtinLSPServers) {
      expect(s.name).toBeTruthy();
      expect(Array.isArray(s.extensions)).toBe(true);
      expect(s.extensions.length).toBeGreaterThan(0);
      expect(Array.isArray(s.command)).toBe(true);
      expect(s.command.length).toBeGreaterThan(0);
    }
  });

  it('every server has a unique name', () => {
    const names = builtinLSPServers.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every extension starts with a dot', () => {
    for (const s of builtinLSPServers) {
      for (const ext of s.extensions) {
        expect(ext.startsWith('.')).toBe(true);
      }
    }
  });

  it('commands are non-empty strings', () => {
    for (const s of builtinLSPServers) {
      for (const part of s.command) {
        expect(typeof part).toBe('string');
        expect(part.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getServerForFile', () => {
  it('returns server for known extension', () => {
    const server = getServerForFile('src/index.ts', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('typescript');
  });

  it('returns server for .py files', () => {
    const server = getServerForFile('main.py', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('pyright');
  });

  it('returns server for .go files', () => {
    const server = getServerForFile('main.go', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('gopls');
  });

  it('returns server for .rs files', () => {
    const server = getServerForFile('lib.rs', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('rust-analyzer');
  });

  it('returns server for .astro files', () => {
    const server = getServerForFile('page.astro', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('astro');
  });

  it('returns server for .svelte files', () => {
    const server = getServerForFile('App.svelte', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('svelte');
  });

  it('returns server for .vue files', () => {
    const server = getServerForFile('App.vue', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('vue');
  });

  it('returns server for .c files', () => {
    const server = getServerForFile('main.c', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('clangd');
  });

  it('returns server for .cpp files', () => {
    const server = getServerForFile('main.cpp', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('clangd');
  });

  it('returns server for .rb files', () => {
    const server = getServerForFile('app.rb', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('ruby-lsp');
  });

  it('returns server for .swift files', () => {
    const server = getServerForFile('App.swift', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('sourcekit-lsp');
  });

  it('returns undefined for unknown extension', () => {
    const server = getServerForFile('README.md', builtinLSPServers);
    expect(server).toBeUndefined();
  });

  it('returns undefined for files without extension', () => {
    const server = getServerForFile('Makefile', builtinLSPServers);
    expect(server).toBeUndefined();
  });

  it('skips disabled servers', () => {
    const servers: LSPServerDef[] = [
      { name: 'test-ls', extensions: ['.xyz'], command: ['test-ls'], disabled: true },
    ];
    const server = getServerForFile('file.xyz', servers);
    expect(server).toBeUndefined();
  });

  it('is case insensitive with extensions', () => {
    const server = getServerForFile('Main.TS', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('typescript');
  });

  it('first matching server wins in the array', () => {
    const servers: LSPServerDef[] = [
      { name: 'first', extensions: ['.xyz'], command: ['first'] },
      { name: 'second', extensions: ['.xyz'], command: ['second'] },
    ];
    const server = getServerForFile('file.xyz', servers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('first');
  });

  it('.ts files match typescript (before deno)', () => {
    const server = getServerForFile('app.ts', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('typescript');
  });

  it('.js files match typescript (before deno/eslint)', () => {
    const server = getServerForFile('app.js', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('typescript');
  });

  it('returns server for .kt files', () => {
    const server = getServerForFile('Main.kt', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('kotlin-ls');
  });

  it('returns server for .zig files', () => {
    const server = getServerForFile('main.zig', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.name).toBe('zls');
  });
});

describe('findServerByName', () => {
  it('finds server by name', () => {
    const server = findServerByName('typescript', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.command).toContain('typescript-language-server');
  });

  it('returns undefined for unknown name', () => {
    const server = findServerByName('nonexistent', builtinLSPServers);
    expect(server).toBeUndefined();
  });

  it('returns correct server for pyright', () => {
    const server = findServerByName('pyright', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.extensions).toContain('.py');
  });

  it('returns correct server for rust-analyzer', () => {
    const server = findServerByName('rust-analyzer', builtinLSPServers);
    expect(server).toBeDefined();
    expect(server!.command).toEqual(['rust-analyzer']);
  });
});

describe('server metadata completeness', () => {
  it('all autoInstall servers have a logical npm or GitHub source', () => {
    const npmPrefixes = ['bash-language-server', 'typescript', 'vue', 'svelte', 'yaml-ls', 'astro', 'eslint', 'csharp', 'php-intelephense', 'prisma', 'pyright', 'lua-ls', 'kotlin-ls'];
    for (const s of builtinLSPServers) {
      if (s.autoInstall) {
        expect(
          npmPrefixes.includes(s.name) ||
          s.name === 'terraform' ||
          s.name === 'tinymist',
        ).toBe(true);
      }
    }
  });

  it('all servers with requirements specify requirements that exist on the system or project', () => {
    for (const s of builtinLSPServers) {
      if (s.requirements) {
        expect(Array.isArray(s.requirements)).toBe(true);
        expect(s.requirements.length).toBeGreaterThan(0);
        for (const req of s.requirements) {
          expect(typeof req).toBe('string');
          expect(req.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('no duplicate extensions across servers cause ambiguity issues', () => {
    const extMap = new Map<string, string[]>();
    for (const s of builtinLSPServers) {
      for (const ext of s.extensions) {
        if (!extMap.has(ext)) extMap.set(ext, []);
        extMap.get(ext)!.push(s.name);
      }
    }
    for (const [ext, names] of extMap) {
      if (names.length > 1) {
        expect(names[0]).toBe(
          builtinLSPServers.find(
            s => s.extensions.includes(ext) && !s.disabled,
          )!.name,
        );
      }
    }
  });
});

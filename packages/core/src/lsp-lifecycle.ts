import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LSPManager, type Diagnostic } from './lsp-manager.js';
import { builtinLSPServers, getServerForFile, findServerByName, type LSPServerDef } from './lsp-servers.js';

interface LanguageServerEntry {
  lsp: LSPManager;
  fileCount: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

const INSTALL_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.local',
  'share',
  'sentinel',
  'lsp',
);

export class LSPLifecycle {
  private readonly instances = new Map<string, LanguageServerEntry>();
  private readonly idleTimeoutMs: number;
  private readonly serverDefs: LSPServerDef[];

  constructor(idleTimeoutMs = 60_000, serverDefs?: LSPServerDef[]) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.serverDefs = serverDefs ?? builtinLSPServers;
  }

  async ensureLanguageServer(filePath: string): Promise<LSPManager | null> {
    const serverDef = getServerForFile(filePath, this.serverDefs);
    if (!serverDef) return null;

    const lang = serverDef.name;

    const existing = this.instances.get(lang);
    if (existing) {
      existing.fileCount++;
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = undefined;
      }
      return existing.lsp;
    }

    await this.ensureServerInstalled(serverDef);

    const lsp = new LSPManager();
    try {
      await lsp.start(filePath, serverDef);
    } catch {
      // LSP server failed to start — return the manager anyway
    }

    this.instances.set(lang, { lsp, fileCount: 1 });
    return lsp;
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const serverDef = getServerForFile(filePath, this.serverDefs);
    if (!serverDef) return [];

    const lsp = await this.ensureLanguageServer(filePath);
    if (!lsp) return [];

    lsp.openDocument(serverDef.name, filePath);
    return lsp.requestDiagnostics(serverDef.name, filePath);
  }

  private async withServer<T>(filePath: string, fn: (lsp: LSPManager, lang: string) => Promise<T>, fallback: T): Promise<T> {
    const serverDef = getServerForFile(filePath, this.serverDefs);
    if (!serverDef) return fallback;
    const lsp = await this.ensureLanguageServer(filePath);
    if (!lsp) return fallback;
    await lsp.openDocument(serverDef.name, filePath);
    return fn(lsp, serverDef.name);
  }

  async goToDefinition(filePath: string, line: number, column: number): Promise<Awaited<ReturnType<LSPManager['goToDefinition']>>> {
    return this.withServer(filePath, (lsp, lang) => lsp.goToDefinition(lang, filePath, line, column), null);
  }

  async findReferences(filePath: string, line: number, column: number): Promise<Awaited<ReturnType<LSPManager['findReferences']>>> {
    return this.withServer(filePath, (lsp, lang) => lsp.findReferences(lang, filePath, line, column), []);
  }

  async hover(filePath: string, line: number, column: number): Promise<Awaited<ReturnType<LSPManager['hover']>>> {
    return this.withServer(filePath, (lsp, lang) => lsp.hover(lang, filePath, line, column), null);
  }

  async documentSymbol(filePath: string): Promise<Awaited<ReturnType<LSPManager['documentSymbol']>>> {
    return this.withServer(filePath, (lsp, lang) => lsp.documentSymbol(lang, filePath), []);
  }

  async workspaceSymbol(query: string): Promise<Awaited<ReturnType<LSPManager['workspaceSymbol']>>> {
    for (const [, entry] of this.instances) {
      for (const lang of entry.lsp.languages) {
        try {
          const symbols = await entry.lsp.workspaceSymbol(lang, query);
          if (symbols.length > 0) return symbols;
        } catch {
          continue;
        }
      }
    }
    return [];
  }

  async onFileOpen(filePath: string): Promise<void> {
    try {
      await this.ensureLanguageServer(filePath);
    } catch {
      // don't crash if LSP can't start
    }
  }

  async onFileSave(filePath: string): Promise<void> {
    try {
      const serverDef = getServerForFile(filePath, this.serverDefs);
      if (!serverDef) return;

      const entry = this.instances.get(serverDef.name);
      if (!entry) return;

      entry.lsp.openDocument(serverDef.name, filePath);
      await entry.lsp.requestDiagnostics(serverDef.name, filePath);
    } catch {
      // don't crash on save
    }
  }

  onFileClose(filePath: string): void {
    const serverDef = getServerForFile(filePath, this.serverDefs);
    if (!serverDef) return;

    const entry = this.instances.get(serverDef.name);
    if (!entry) return;

    entry.fileCount = Math.max(0, entry.fileCount - 1);

    if (entry.fileCount === 0) {
      this.scheduleIdleShutdown(serverDef.name);
    }
  }

  private scheduleIdleShutdown(lang: string): void {
    const entry = this.instances.get(lang);
    if (!entry) return;

    if (entry.idleTimer) clearTimeout(entry.idleTimer);

    entry.idleTimer = setTimeout(() => {
      this.shutdownLanguage(lang);
    }, this.idleTimeoutMs);
  }

  private shutdownLanguage(lang: string): void {
    const entry = this.instances.get(lang);
    if (!entry) return;

    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    try {
      entry.lsp.stop();
    } catch {
      // ignore shutdown errors
    }

    this.instances.delete(lang);
  }

  shutdownAll(): void {
    for (const lang of this.instances.keys()) {
      this.shutdownLanguage(lang);
    }
  }

  get runningLanguages(): string[] {
    return Array.from(this.instances.keys());
  }

  get fileCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [lang, entry] of this.instances) {
      counts[lang] = entry.fileCount;
    }
    return counts;
  }

  getServerDefs(): readonly LSPServerDef[] {
    return this.serverDefs;
  }

  disableServer(name: string): void {
    const def = findServerByName(name, this.serverDefs);
    if (def) def.disabled = true;
  }

  enableServer(name: string): void {
    const def = findServerByName(name, this.serverDefs);
    if (def) def.disabled = false;
  }

  isServerDisabled(name: string): boolean {
    const def = findServerByName(name, this.serverDefs);
    return def?.disabled ?? false;
  }

  private async ensureServerInstalled(serverDef: LSPServerDef): Promise<void> {
    if (!serverDef.autoInstall) return;
    if (process.env.OPENCODE_DISABLE_LSP_DOWNLOAD) return;

    const cmd = serverDef.command[0];
    if (!cmd) return;

    if (this.isExecutable(cmd)) return;

    if (await this.tryInstallNpm(serverDef)) return;
    if (await this.tryInstallGitHub(serverDef)) return;

    throw new Error(
      `Could not auto-install LSP server "${serverDef.name}". ` +
      `Please install manually and ensure "${cmd}" is in your PATH.\n` +
      `  Command: ${serverDef.command.join(' ')}` +
      (serverDef.requirements?.length
        ? `\n  Requires: ${serverDef.requirements.join(', ')}`
        : ''),
    );
  }

  private isExecutable(cmd: string): boolean {
    try {
      const result = spawnSync('which', [cmd], { stdio: 'ignore' });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private installNpm(pkg: string): boolean {
    try {
      const result = spawnSync('npm', ['install', '-g', pkg], { stdio: 'inherit', timeout: 120_000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private extractArchive(archivePath: string, destDir: string, ext: string): boolean {
    try {
      if (ext === '.zip') {
        const result = spawnSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'ignore' });
        return result.status === 0;
      }
      const result = spawnSync('tar', ['xzf', archivePath, '-C', destDir], { stdio: 'ignore' });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private makeExecutable(binaryPath: string): boolean {
    try {
      const result = spawnSync('chmod', ['+x', binaryPath], { stdio: 'ignore' });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private getNpmPackageName(serverDef: LSPServerDef): string {
    const overrides: Record<string, string> = {
      'astro': '@astrojs/language-server',
      'vue': '@vue/language-server',
      'prisma': '@prisma/language-server',
      'eslint': 'vscode-langservers-extracted',
      'php-intelephense': 'intelephense',
      'csharp': 'csharp-ls',
    };
    return overrides[serverDef.name] ?? serverDef.name;
  }

  private async tryInstallNpm(serverDef: LSPServerDef): Promise<boolean> {
    const pkg = this.getNpmPackageName(serverDef);
    if (this.installNpm(pkg)) {
      return this.isExecutable(serverDef.command[0]!);
    }
    return false;
  }

  private async tryInstallGitHub(serverDef: LSPServerDef): Promise<boolean> {
    const githubRepos: Record<string, { repo: string; assetSuffix: string }> = {
      'terraform': { repo: 'hashicorp/terraform-ls', assetSuffix: 'terraform-ls' },
      'tinymist': { repo: 'Myriad-Dreamin/tinymist', assetSuffix: 'tinymist' },
    };

    const config = githubRepos[serverDef.name];
    if (!config) return false;

    try {
      const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
      const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';

      const response = await fetch(`https://api.github.com/repos/${config.repo}/releases/latest`);
      if (!response.ok) return false;

      const release = await response.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
      const assetName = `${config.assetSuffix}_${platform}_${arch}`;
      const asset = release.assets.find(a => a.name.includes(assetName) && !a.name.endsWith('.sha256'));
      if (!asset) return false;

      fs.mkdirSync(INSTALL_DIR, { recursive: true });

      const ext = asset.name.endsWith('.zip') ? '.zip' : '.tar.gz';
      const archivePath = path.join(INSTALL_DIR, `${serverDef.name}${ext}`);

      const dl = await fetch(asset.browser_download_url);
      if (!dl.ok) return false;
      const buffer = Buffer.from(await dl.arrayBuffer());
      fs.writeFileSync(archivePath, buffer);

      if (ext === '.zip') {
        this.extractArchive(archivePath, path.join(INSTALL_DIR, serverDef.name), ext);
      } else {
        this.extractArchive(archivePath, INSTALL_DIR, ext);
      }

      fs.unlinkSync(archivePath);

      const binaryPath = this.findBinaryInDir(path.join(INSTALL_DIR, serverDef.name), config.assetSuffix);
      if (binaryPath) {
        this.makeExecutable(binaryPath);
        const linkDir = path.join(INSTALL_DIR, 'bin');
        fs.mkdirSync(linkDir, { recursive: true });
        const linkPath = path.join(linkDir, config.assetSuffix);
        try { fs.unlinkSync(linkPath); } catch { /* ok */ }
        fs.symlinkSync(binaryPath, linkPath);
        if (!process.env.PATH?.includes(linkDir)) {
          process.env.PATH = `${linkDir}:${process.env.PATH || ''}`;
        }
      }

      return this.isExecutable(serverDef.command[0]!);
    } catch {
      return false;
    }
  }

  private findBinaryInDir(dir: string, name: string): string | null {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name === name || entry.name === `${name}_` || entry.name.startsWith(name)) {
          return fullPath;
        }
        if (entry.isDirectory()) {
          const found = this.findBinaryInDir(fullPath, name);
          if (found) return found;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}

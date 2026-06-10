import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

interface LSPRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface LSPNotification {
  method: string;
  params?: unknown;
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const LSP_COMMANDS: Record<string, string> = {
  typescript: 'typescript-language-server --stdio',
  javascript: 'typescript-language-server --stdio',
  python: 'pyright-langserver --stdio',
  go: 'gopls',
  rust: 'rust-analyzer',
};

export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
  };
  return map[ext] ?? null;
}

export class LSPManager {
  private processes = new Map<string, ChildProcess>();
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = new Map<string, string>();
  private diagnostics: Diagnostic[] = [];
  private listeners: Array<(d: Diagnostic[]) => void> = [];

  onDiagnostics(cb: (d: Diagnostic[]) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  async start(filePath: string): Promise<string | null> {
    const lang = detectLanguage(filePath);
    if (!lang) return null;

    if (this.processes.has(lang)) return lang;

    const cmd = LSP_COMMANDS[lang];
    if (!cmd) return null;

    const [program, ...args] = cmd.split(' ');
    const proc = spawn(program!, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(lang, proc);
    this.buffer.set(lang, '');

    proc.stdout!.on('data', (chunk: Buffer) => {
      this.handleData(lang, chunk);
    });

    proc.stderr!.on('data', (_chunk: Buffer) => {
      // LSP stderr is typically logging
    });

    proc.on('exit', () => {
      this.processes.delete(lang);
      this.buffer.delete(lang);
    });

    await this.sendRequest(lang, 'initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          diagnostic: { dynamicRegistration: true },
        },
      },
    });

    this.sendNotification(lang, 'initialized', {});

    return lang;
  }

  async openDocument(lang: string, filePath: string, text?: string): Promise<void> {
    const uri = filePathToUri(filePath);
    if (!text) {
      try { text = await fs.readFile(filePath, 'utf-8'); } catch { text = ''; }
    }
    this.sendNotification(lang, 'textDocument/didOpen', {
      textDocument: { uri, languageId: lang, version: 1, text },
    });
  }

  async notifyChange(lang: string, filePath: string, text: string): Promise<void> {
    const uri = filePathToUri(filePath);
    this.sendNotification(lang, 'textDocument/didChange', {
      textDocument: { uri, version: Date.now() },
      contentChanges: [{ text }],
    });
  }

  async requestDiagnostics(_lang: string, filePath: string): Promise<Diagnostic[]> {
    const existing = this.diagnostics.filter((d) => d.file === filePath);
    // LSP pushes diagnostics via notifications; we return what we've collected
    return existing;
  }

  stop(): void {
    for (const [lang, proc] of this.processes) {
      this.sendNotification(lang, 'shutdown', {});
      this.sendNotification(lang, 'exit', {});
      proc.kill();
    }
    this.processes.clear();
    this.buffer.clear();
    this.diagnostics = [];
  }

  private async sendRequest(lang: string, method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const request: LSPRequest = { id, method, params };
    this.write(lang, request);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => reject(new Error(`LSP request ${method} timed out`)), 10_000);
    });
  }

  private sendNotification(lang: string, method: string, params?: unknown): void {
    const notification: LSPNotification = { method, params };
    this.write(lang, notification);
  }

  private write(lang: string, msg: unknown): void {
    const proc = this.processes.get(lang);
    if (!proc || !proc.stdin) return;

    const json = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n`;
    proc.stdin.write(header + json);
  }

  private handleData(lang: string, chunk: Buffer): void {
    const buf = this.buffer.get(lang) ?? '';
    this.buffer.set(lang, buf + chunk.toString());

    const content = this.buffer.get(lang)!;
    const match = content.match(/Content-Length: (\d+)\r\n\r\n/);
    if (!match) return;

    const contentLength = parseInt(match[1]!, 10);
    const headerEnd = content.indexOf('\r\n\r\n') + 4;
    const body = content.slice(headerEnd);

    if (body.length < contentLength) return;

    this.buffer.set(lang, content.slice(headerEnd + contentLength));

    try {
      const msg = JSON.parse(body.slice(0, contentLength));

      if (msg.id !== undefined && msg.result !== undefined) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          pending.resolve(msg.result);
        }
      }

      if (msg.method === 'textDocument/publishDiagnostics') {
        const params = msg.params as { uri: string; diagnostics: Array<{ range: { start: { line: number; character: number } }; message: string; severity?: number }> };
        const filePath = uriToFilePath(params.uri);
        this.diagnostics = this.diagnostics.filter((d) => d.file !== filePath);

        for (const d of params.diagnostics) {
          this.diagnostics.push({
            file: filePath,
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
            message: d.message,
            severity: d.severity && d.severity <= 2 ? 'error' : d.severity === 3 ? 'warning' : 'info',
          });
        }

        for (const cb of this.listeners) {
          cb(this.getDiagnosticsForFile(filePath));
        }
      }
    } catch {
      // ignore parse errors for partial messages
    }
  }

  getDiagnosticsForFile(filePath: string): Diagnostic[] {
    return this.diagnostics.filter((d) => d.file === filePath);
  }

  get allDiagnostics(): Diagnostic[] {
    return [...this.diagnostics];
  }
}

function filePathToUri(filePath: string): string {
  return `file://${path.resolve(filePath)}`;
}

function uriToFilePath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

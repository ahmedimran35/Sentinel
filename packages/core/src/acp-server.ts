import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

export interface ACPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ACPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ACPOptions {
  cwd?: string;
  log?: (msg: string) => void;
}

type ACPHandler = (params: Record<string, unknown>) => Promise<unknown>;

export class ACPServer {
  private rl: ReturnType<typeof createInterface> | null = null;
  private handlers = new Map<string, ACPHandler>();
  private input: Readable;
  private output: Writable;
  private _cwd: string = process.cwd();
  private _log: (msg: string) => void = () => {};

  constructor(input?: Readable, output?: Writable, opts?: ACPOptions) {
    this.input = input ?? process.stdin;
    this.output = output ?? process.stdout;
    if (opts) {
      if (opts.cwd) this._cwd = opts.cwd;
      if (opts.log) this._log = opts.log;
    }
    void this._cwd;
    void this._log;
    this.rl = null;
  }

  setIo(input: Readable, output: Writable, opts?: ACPOptions): void {
    this.input = input;
    this.output = output;
    if (opts) {
      if (opts.cwd) this._cwd = opts.cwd;
      if (opts.log) this._log = opts.log;
    }
  }

  on(method: string, handler: ACPHandler): void {
    this.handlers.set(method, handler);
  }

  async start(): Promise<void> {
    if (!this.handlers.has('initialize')) {
      this.handlers.set('initialize', async () => ({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'sentinel-acp', version: '0.1.0' },
      }));
    }
    if (!this.handlers.has('notifications/initialized')) {
      this.handlers.set('notifications/initialized', async () => undefined);
    }
    if (!this.handlers.has('tools/list')) {
      this.handlers.set('tools/list', async () => ({ tools: [] }));
    }
    if (!this.handlers.has('tools/call')) {
      this.handlers.set('tools/call', async () => ({
        content: [{ type: 'text', text: 'No tools registered' }],
        isError: true,
      }));
    }

    if (!this.rl) {
      this.rl = createInterface({ input: this.input });
    }

    for await (const line of this.rl) {
      if (!line.trim()) continue;

      let msg: { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.jsonrpc !== '2.0') continue;

      if (msg.method === 'exit') {
        this.rl.close();
        process.exit(0);
      }

      if (msg.method === 'shutdown') {
        this.rl.close();
        if (msg.id !== undefined) {
          this.respond(msg.id, null);
        }
        return;
      }

      const handler = this.handlers.get(msg.method);
      if (!handler) {
        if (msg.id !== undefined) {
          this.respondError(msg.id, -32601, `Method not found: ${msg.method}`);
        }
        continue;
      }

      try {
        const result = await handler(msg.params ?? {});
        if (msg.id !== undefined) {
          this.respond(msg.id, result);
        }
      } catch (err) {
        if (msg.id !== undefined) {
          this.respondError(msg.id, -32603, err instanceof Error ? err.message : 'Internal error');
        }
      }
    }
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  notify(method: string, params?: Record<string, unknown>): void {
    const msg = { jsonrpc: '2.0' as const, method, params };
    this.output.write(JSON.stringify(msg) + '\n');
  }

  respond(id: number | string, result: unknown): void {
    const msg: ACPResponse = { jsonrpc: '2.0', id, result };
    this.output.write(JSON.stringify(msg) + '\n');
  }

  respondError(id: number | string, code: number, message: string): void {
    const msg: ACPResponse = { jsonrpc: '2.0', id, error: { code, message } };
    this.output.write(JSON.stringify(msg) + '\n');
  }
}

export function createACPServer(opts?: ACPOptions): ACPServer {
  return new ACPServer(process.stdin, process.stdout, opts);
}

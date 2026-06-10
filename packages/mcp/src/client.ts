import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };
  error?: { code: number; message: string };
}

export class MCPClient extends EventEmitter {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  async connect(command: string, args: string[] = []): Promise<void> {
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString());
    });

    this.proc.on('exit', (code) => {
      this._connected = false;
      this.emit('disconnected', code);
    });

    this._connected = true;

    // Initialize
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sentinel', version: '0.1.0' },
    });

    await this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<MCPTool[]> {
    const serverName = this.proc?.spawnfile ?? 'unknown';
    const response = await this.request('tools/list', {});
    const result = response as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };

    return (result.tools ?? []).map((t) => ({
      name: `mcp__${serverName}__${t.name}`,
      description: t.description,
      inputSchema: t.inputSchema,
      serverName,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  disconnect(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this._connected = false;
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const request: MCPRequest = { jsonrpc: '2.0', id, method, params };
    this.write(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => reject(new Error(`MCP request ${method} timed out`)), 30_000);
    });
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification = { jsonrpc: '2.0', method, params };
    this.write(JSON.stringify(notification));
  }

  private write(data: string): void {
    if (this.proc?.stdin) {
      const message = `Content-Length: ${Buffer.byteLength(data, 'utf-8')}\r\n\r\n${data}`;
      this.proc.stdin.write(message);
    }
  }

  private processBuffer(): void {
    const match = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
    if (!match) return;

    const contentLength = parseInt(match[1]!, 10);
    const headerEnd = this.buffer.indexOf('\r\n\r\n') + 4;
    const body = this.buffer.slice(headerEnd);

    if (body.length < contentLength) return;

    this.buffer = this.buffer.slice(headerEnd + contentLength);

    try {
      const msg = JSON.parse(body.slice(0, contentLength)) as MCPResponse;

      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } catch {
      // ignore parse errors
    }
  }
}

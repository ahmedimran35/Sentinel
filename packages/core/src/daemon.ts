import { createServer, Socket, type Server } from 'node:net';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export interface DaemonConfig {
  port: number;
  host: string;
  logFile?: string;
  pidFile?: string;
}

const DEFAULT_PORT = 5178;
const DEFAULT_HOST = 'localhost';
const PID_DIR = resolve(homedir(), '.local', 'share', 'sentinel');
const DEFAULT_PID_FILE = resolve(PID_DIR, 'daemon.pid');

function defaultConfig(): DaemonConfig {
  return {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    pidFile: DEFAULT_PID_FILE,
  };
}

export function getDefaultDaemonConfig(): DaemonConfig {
  return defaultConfig();
}

export function isDaemonRunning(): boolean {
  const pidFile = defaultConfig().pidFile ?? DEFAULT_PID_FILE;
  if (!existsSync(pidFile)) return false;
  try {
    const pidStr = readFileSync(pidFile, 'utf-8').trim();
    const pid = Number(pidStr);
    if (Number.isNaN(pid) || pid <= 0) return false;
    try {
      return process.kill(pid, 0);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function sendToDaemon(message: string): Promise<string> {
  const cfg = defaultConfig();
  return new Promise((resolvePromise, reject) => {
    const socket = new Socket();
    let data = '';
    socket.connect(cfg.port, cfg.host, () => {
      socket.write(JSON.stringify({ message }) + '\n');
    });
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8');
    });
    socket.on('end', () => {
      resolvePromise(data.trim());
    });
    socket.on('error', (err: Error) => {
      reject(err);
    });
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error('Daemon response timeout'));
    });
  });
}

export class SentinelDaemon {
  private server: Server | null = null;
  private config: DaemonConfig;
  private sessions: Map<string, { engine: unknown }> = new Map();
  private connections: Set<Socket> = new Set();

  constructor(config?: Partial<DaemonConfig>) {
    this.config = { ...defaultConfig(), ...config };
  }

  /** Start TCP server and write PID file */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Daemon is already running');
    }

    const pidFile = this.config.pidFile ?? DEFAULT_PID_FILE;
    const pidDir = pidFile.substring(0, pidFile.lastIndexOf('/'));
    mkdirSync(pidDir, { recursive: true });

    return new Promise((resolvePromise, reject) => {
      const server = createServer((socket: Socket) => {
        this.connections.add(socket);
        let buffer = '';

        socket.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as Record<string, unknown>;
              const response = this.handleMessage(parsed);
              socket.write(JSON.stringify(response) + '\n');
            } catch {
              socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
            }
          }
        });

        socket.on('close', () => {
          this.connections.delete(socket);
        });

        socket.on('error', () => {
          this.connections.delete(socket);
        });
      });

      server.on('error', (err: Error) => {
        reject(err);
      });

      server.listen(this.config.port, this.config.host, () => {
        this.server = server;
        try {
          writeFileSync(pidFile, String(process.pid), 'utf-8');
        } catch {
          // non-fatal: PID file write failure
        }
        resolvePromise();
      });
    });
  }

  /** Graceful shutdown */
  async stop(): Promise<void> {
    if (!this.server) return;

    for (const socket of this.connections) {
      socket.end();
    }
    this.connections.clear();

    return new Promise((resolvePromise) => {
      this.server?.close(() => {
        this.server = null;
        const pidFile = this.config.pidFile ?? DEFAULT_PID_FILE;
        try {
          if (existsSync(pidFile)) {
            unlinkSync(pidFile);
          }
        } catch {
          // non-fatal
        }
        resolvePromise();
      });
    });
  }

  /** Connect a client to a daemon session */
  async attach(sessionId?: string): Promise<void> {
    const id = sessionId ?? `session_${Date.now().toString(36)}`;
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { engine: null });
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number {
    return this.config.port;
  }

  private handleMessage(msg: Record<string, unknown>): Record<string, unknown> {
    if (msg.message === 'ping') {
      return { status: 'ok', pid: process.pid };
    }
    return { status: 'received' };
  }
}

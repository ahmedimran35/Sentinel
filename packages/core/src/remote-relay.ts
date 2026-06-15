import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export interface RelayConfig {
  enabled: boolean;
  port: number;
  host: string;
  secret?: string;
  allowedOrigins?: string[];
}

interface RelayClient {
  id: string;
  res: ServerResponse;
}

const DEFAULT_PORT = 5180;
const DEFAULT_HOST = 'localhost';
const CLIENT_ID_LENGTH = 8;

function generateClientId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < CLIENT_ID_LENGTH; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export class SessionRelay {
  private server: Server | null = null;
  private config: RelayConfig;
  private clients: Map<string, RelayClient> = new Map();

  constructor(config?: Partial<RelayConfig>) {
    this.config = {
      enabled: true,
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      ...config,
    };
  }

  /** Start HTTP server for SSE connections */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Relay server is already running');
    }

    return new Promise((resolvePromise, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        const url = new URL(req.url, `http://${this.config.host}:${this.config.port}`);

        // Auth check
        if (this.config.secret) {
          const token = url.searchParams.get('secret');
          if (token !== this.config.secret) {
            res.writeHead(401);
            res.end('Unauthorized');
            return;
          }
        }

        // CORS
        const origin = req.headers.origin;
        if (origin && this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
          if (!this.config.allowedOrigins.includes(origin)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
          res.setHeader('Access-Control-Allow-Origin', origin);
        }

        if (url.pathname === '/events' || url.pathname === '/') {
          // SSE endpoint
          const clientId = generateClientId();
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });

          // Send initial connected event
          res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

          const client: RelayClient = { id: clientId, res };
          this.clients.set(clientId, client);

          req.on('close', () => {
            this.clients.delete(clientId);
          });

          return;
        }

        // Health check
        if (url.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', clients: this.clients.size }));
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      server.on('error', (err: Error) => {
        reject(err);
      });

      server.listen(this.config.port, this.config.host, () => {
        this.server = server;
        resolvePromise();
      });
    });
  }

  /** Stop the HTTP server */
  async stop(): Promise<void> {
    if (!this.server) return;

    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();

    return new Promise((resolvePromise) => {
      this.server?.close(() => {
        this.server = null;
        resolvePromise();
      });
    });
  }

  /** Broadcast an event to all connected SSE clients */
  broadcast(event: unknown): void {
    const data = JSON.stringify(event);
    const message = `data: ${data}\n\n`;

    for (const [id, client] of this.clients) {
      try {
        client.res.write(message);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

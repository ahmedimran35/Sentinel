import { MCPClient } from './client.js';
import {
  RemoteMCPClient,
  type RemoteMCPConfig,
} from './remote-client.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Tool } from '@sentinel/shared';

interface MCPServerConfig {
  name: string;
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  oauth?: Record<string, unknown> | false;
  timeout?: number;
}

interface MCPConfig {
  servers: MCPServerConfig[];
}

export interface ServerStatus {
  connected: boolean;
  type: string;
  toolsCount: number;
  error?: string;
}

export class MCPRegistry {
  private localClients = new Map<string, MCPClient>();
  private remoteClients = new Map<string, RemoteMCPClient>();
  private configPath: string;
  private toolCounts = new Map<string, number>();

  constructor(configDir?: string) {
    const base = configDir ?? join(homedir(), '.config', 'sentinel');
    if (!existsSync(base)) mkdirSync(base, { recursive: true });
    this.configPath = join(base, 'mcp.json');
  }

  private loadConfig(): MCPConfig {
    try {
      if (existsSync(this.configPath)) {
        return JSON.parse(readFileSync(this.configPath, 'utf-8')) as MCPConfig;
      }
    } catch {
      /* ignore */
    }
    return { servers: [] };
  }

  private saveConfig(config: MCPConfig): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async addServer(
    name: string,
    config: {
      type: 'local' | 'remote';
      command?: string[];
      url?: string;
      headers?: Record<string, string>;
      oauth?: Record<string, unknown>;
      timeout?: number;
    },
  ): Promise<void> {
    const cfg = this.loadConfig();
    cfg.servers = cfg.servers.filter((s) => s.name !== name);

    if (config.type === 'local') {
      const [command, ...args] = config.command ?? [];
      cfg.servers.push({ name, type: 'local', command, args });
    } else {
      cfg.servers.push({
        name,
        type: 'remote',
        url: config.url,
        headers: config.headers,
        oauth: config.oauth,
        timeout: config.timeout,
      });
    }

    this.saveConfig(cfg);
  }

  async removeServer(name: string): Promise<void> {
    const config = this.loadConfig();
    config.servers = config.servers.filter((s) => s.name !== name);
    this.saveConfig(config);

    this.localClients.get(name)?.disconnect();
    this.localClients.delete(name);
    this.remoteClients.get(name)?.disconnect();
    this.remoteClients.delete(name);
    this.toolCounts.delete(name);
  }

  listServers(): Array<{ name: string; type: string }> {
    return this.loadConfig().servers.map((s) => ({ name: s.name, type: s.type }));
  }

  async connectAll(): Promise<void> {
    const config = this.loadConfig();
    for (const server of config.servers) {
      try {
        if (server.type === 'local') {
          const client = new MCPClient();
          await client.connect(server.command ?? '', server.args ?? []);
          this.localClients.set(server.name, client);
        } else {
          const client = new RemoteMCPClient({
            url: server.url ?? '',
            headers: server.headers,
            oauth: server.oauth as RemoteMCPConfig['oauth'],
            timeout: server.timeout,
          });
          await client.connect();
          this.remoteClients.set(server.name, client);
        }
      } catch (err) {
        process.stderr.write(`[mcp] Connect failed for ${server.name}: ${err}\n`);
      }
    }
  }

  async getTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

    for (const [name, client] of this.localClients) {
      try {
        const mcpTools = await client.listTools();
        this.toolCounts.set(name, mcpTools.length);
        for (const mt of mcpTools) {
          tools.push(
            this.makeLocalTool(name, client, mt.name, mt.description, mt.inputSchema),
          );
        }
      } catch {
        this.toolCounts.set(name, 0);
      }
    }

    for (const [name, client] of this.remoteClients) {
      try {
        const mcpTools = await client.listTools();
        this.toolCounts.set(name, mcpTools.length);
        for (const mt of mcpTools) {
          tools.push(
            this.makeRemoteTool(name, client, mt.name, mt.description, mt.inputSchema),
          );
        }
      } catch {
        this.toolCounts.set(name, 0);
      }
    }

    return tools;
  }

  private makeLocalTool(
    serverName: string,
    client: MCPClient,
    toolName: string,
    description: string,
    inputSchema: Record<string, unknown>,
  ): Tool {
    const fullName = toolName.startsWith(`mcp__${serverName}__`)
      ? toolName
      : `mcp__${serverName}__${toolName}`;
    const actualToolName = toolName.startsWith(`mcp__${serverName}__`)
      ? toolName.replace(`mcp__${serverName}__`, '')
      : toolName;
    return {
      name: fullName,
      description,
      risk: 'execute' as const,
      inputSchema: inputSchema as Record<string, unknown>,
      execute: async function* (input: any, ctx: { sessionId: string; signal: AbortSignal }) {
        if (ctx.signal.aborted) return;
        try {
          const result = await client.callTool(actualToolName, input);
          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: fullName,
              output: typeof result === 'string' ? result : JSON.stringify(result),
              isError: false,
            },
          };
        } catch (err) {
          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: fullName,
              output: `MCP error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            },
          };
        }
      },
    };
  }

  private makeRemoteTool(
    serverName: string,
    client: RemoteMCPClient,
    toolName: string,
    description: string,
    inputSchema: Record<string, unknown>,
  ): Tool {
    const fullName = `mcp__${serverName}__${toolName}`;
    return {
      name: fullName,
      description,
      risk: 'execute' as const,
      inputSchema: inputSchema as Record<string, unknown>,
      execute: async function* (input: any, ctx: { sessionId: string; signal: AbortSignal }) {
        if (ctx.signal.aborted) return;
        try {
          const result = await client.callTool(toolName, input);
          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: fullName,
              output: typeof result === 'string' ? result : JSON.stringify(result),
              isError: false,
            },
          };
        } catch (err) {
          yield {
            type: 'tool_result',
            turnId: ctx.sessionId,
            result: {
              callId: fullName,
              output: `MCP error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            },
          };
        }
      },
    };
  }

  disconnectAll(): void {
    for (const [, client] of this.localClients) {
      client.disconnect();
    }
    this.localClients.clear();
    for (const [, client] of this.remoteClients) {
      client.disconnect();
    }
    this.remoteClients.clear();
    this.toolCounts.clear();
  }

  getServerStatus(name: string): ServerStatus {
    const config = this.loadConfig();
    const serverConfig = config.servers.find((s) => s.name === name);
    if (!serverConfig) {
      return { connected: false, type: 'unknown', toolsCount: 0, error: 'Server not found' };
    }

    if (serverConfig.type === 'local') {
      const client = this.localClients.get(name);
      return {
        connected: client?.connected ?? false,
        type: 'local',
        toolsCount: this.toolCounts.get(name) ?? 0,
        error: client ? undefined : 'Not connected',
      };
    }

    const client = this.remoteClients.get(name);
    return {
      connected: client?.connected ?? false,
      type: 'remote',
      toolsCount: this.toolCounts.get(name) ?? 0,
      error: client ? undefined : 'Not connected',
    };
  }
}

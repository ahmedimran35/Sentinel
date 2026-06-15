import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const testConfigDir = path.join(os.tmpdir(), `sentinel-mcp-registry-${Date.now()}`);

vi.mock('./client.js', () => {
  const mockClient: any = vi.fn();
  mockClient.prototype.connect = vi.fn().mockResolvedValue(undefined);
  mockClient.prototype.listTools = vi.fn().mockResolvedValue([]);
  mockClient.prototype.callTool = vi.fn().mockResolvedValue({});
  mockClient.prototype.disconnect = vi.fn();
  Object.defineProperty(mockClient.prototype, 'connected', { get: () => true });
  return { MCPClient: mockClient };
});

vi.mock('./remote-client.js', () => {
  const mockClient: any = vi.fn();
  mockClient.prototype.connect = vi.fn().mockResolvedValue(undefined);
  mockClient.prototype.listTools = vi.fn().mockResolvedValue([]);
  mockClient.prototype.callTool = vi.fn().mockResolvedValue({});
  mockClient.prototype.disconnect = vi.fn();
  Object.defineProperty(mockClient.prototype, 'connected', { get: () => true });
  return { RemoteMCPClient: mockClient };
});

const { MCPRegistry } = await import('./registry.js');

describe('MCPRegistry', () => {
  let registry: MCPRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new MCPRegistry(testConfigDir);
  });

  afterEach(() => {
    registry.disconnectAll();
    try { fs.rmSync(testConfigDir, { recursive: true, force: true }); } catch {}
  });

  it('creates config directory', () => {
    expect(fs.existsSync(testConfigDir)).toBe(true);
  });

  it('adds a local server', async () => {
    await registry.addServer('test-server', {
      type: 'local',
      command: ['node', 'server.js'],
    });

    const servers = registry.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]!.name).toBe('test-server');
    expect(servers[0]!.type).toBe('local');
  });

  it('adds a remote server', async () => {
    await registry.addServer('remote-server', {
      type: 'remote',
      url: 'https://mcp.example.com',
    });

    const servers = registry.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]!.name).toBe('remote-server');
    expect(servers[0]!.type).toBe('remote');
  });

  it('replaces existing server with same name', async () => {
    await registry.addServer('s1', { type: 'local', command: ['node', 'v1.js'] });
    await registry.addServer('s1', { type: 'local', command: ['node', 'v2.js'] });

    const servers = registry.listServers();
    expect(servers).toHaveLength(1);
  });

  it('removes a server', async () => {
    await registry.addServer('to-remove', { type: 'local', command: ['node', 's.js'] });
    await registry.removeServer('to-remove');

    const servers = registry.listServers();
    expect(servers).toHaveLength(0);
  });

  it('lists multiple servers', async () => {
    await registry.addServer('s1', { type: 'local', command: ['node', 's1.js'] });
    await registry.addServer('s2', { type: 'remote', url: 'https://example.com' });

    const servers = registry.listServers();
    expect(servers).toHaveLength(2);
  });

  it('persists config to disk', async () => {
    await registry.addServer('persist-test', { type: 'local', command: ['python', 'mcp.py'] });

    const configPath = path.join(testConfigDir, 'mcp.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0]!.name).toBe('persist-test');
  });

  it('getServerStatus returns not found for unknown server', () => {
    const status = registry.getServerStatus('nonexistent');
    expect(status.connected).toBe(false);
    expect(status.error).toContain('not found');
  });

  it('getServerStatus returns status for local server', async () => {
    await registry.addServer('s1', { type: 'local', command: ['node', 's.js'] });
    const status = registry.getServerStatus('s1');
    expect(status.type).toBe('local');
    expect(status.toolsCount).toBe(0);
  });

  it('connects all servers', async () => {
    await registry.addServer('local1', { type: 'local', command: ['node', 's.js'] });
    await registry.addServer('remote1', { type: 'remote', url: 'https://example.com' });

    await registry.connectAll();

    const { MCPClient } = await import('./client.js');
    const { RemoteMCPClient } = await import('./remote-client.js');
    expect(MCPClient.prototype.connect).toHaveBeenCalled();
    expect(RemoteMCPClient.prototype.connect).toHaveBeenCalled();
  });

  it('disconnects all', async () => {
    await registry.addServer('s1', { type: 'local', command: ['node', 's.js'] });
    await registry.connectAll();
    registry.disconnectAll();

    const { MCPClient } = await import('./client.js');
    expect(MCPClient.prototype.disconnect).toHaveBeenCalled();
  });

  it('removing a server disconnects it', async () => {
    await registry.addServer('s1', { type: 'local', command: ['node', 's.js'] });
    await registry.connectAll();
    await registry.removeServer('s1');

    const { MCPClient } = await import('./client.js');
    expect(MCPClient.prototype.disconnect).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

function makeMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = new EventEmitter() as any;
  proc.stdin.write = vi.fn();
  proc.kill = vi.fn();
  proc.spawnfile = 'test-server';
  proc.pid = 12345;
  return proc;
}

const mockSpawn = vi.fn(() => makeMockProcess());
vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

const { MCPClient } = await import('./client.js');

describe('MCPClient', () => {
  let client: MCPClient;

  function getMockProc(): any {
    return mockSpawn.mock.results[mockSpawn.mock.results.length - 1]!.value;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MCPClient();
  });

  afterEach(() => {
    client.disconnect();
  });

  function sendMessage(msg: any) {
    const proc = getMockProc();
    const data = `Content-Length: ${Buffer.byteLength(JSON.stringify(msg), 'utf-8')}\r\n\r\n${JSON.stringify(msg)}`;
    proc.stdout.emit('data', Buffer.from(data));
  }

  it('connects and initializes', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });

    await connectPromise;
    expect(client.connected).toBe(true);
  });

  it('lists tools', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const toolsPromise = client.listTools();
    sendMessage({
      jsonrpc: '2.0', id: 2, result: {
        tools: [
          { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
        ],
      },
    });

    const tools = await toolsPromise;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toContain('read_file');
    expect(tools[0]!.serverName).toBe('test-server');
  });

  it('calls a tool', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const callPromise = client.callTool('read_file', { path: '/test' });
    sendMessage({ jsonrpc: '2.0', id: 2, result: { content: 'file content' } });

    const result = await callPromise;
    expect(result).toEqual({ content: 'file content' });
  });

  it('handles JSON-RPC error response', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const callPromise = client.callTool('bad_tool', {});
    sendMessage({ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' } });

    await expect(callPromise).rejects.toThrow('MCP error -32601');
  });

  it('disconnects cleanly', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const proc = getMockProc();
    client.disconnect();
    expect(client.connected).toBe(false);
    expect(proc.kill).toHaveBeenCalled();
  });

  it('emits disconnected on process exit', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const proc = getMockProc();
    const disconnectedSpy = vi.fn();
    client.on('disconnected', disconnectedSpy);

    proc.emit('exit', 0);
    expect(disconnectedSpy).toHaveBeenCalledWith(0);
    expect(client.connected).toBe(false);
  });

  it('emits stderr data', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const proc = getMockProc();
    const stderrSpy = vi.fn();
    client.on('stderr', stderrSpy);

    proc.stderr.emit('data', Buffer.from('error log'));
    expect(stderrSpy).toHaveBeenCalledWith('error log');
  });

  it('rejects request on spawn failure', async () => {
    const badMock = {
      stdout: null, stderr: null, stdin: null,
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValueOnce(badMock as any);

    await expect(client.connect('bad-server', [])).rejects.toThrow('stdio pipes not available');
  });

  it('handles missing tools in list response', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const toolsPromise = client.listTools();
    sendMessage({ jsonrpc: '2.0', id: 2, result: {} });

    const tools = await toolsPromise;
    expect(tools).toEqual([]);
  });

  it('gives each tool a unique mcp__ prefixed name', async () => {
    const connectPromise = client.connect('test-server', []);
    sendMessage({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });
    await connectPromise;

    const toolsPromise = client.listTools();
    sendMessage({
      jsonrpc: '2.0', id: 2, result: {
        tools: [
          { name: 'tool_a', description: 'desc a', inputSchema: {} },
          { name: 'tool_b', description: 'desc b', inputSchema: {} },
        ],
      },
    });

    const tools = await toolsPromise;
    expect(tools[0]!.name).toBe('mcp__test-server__tool_a');
    expect(tools[1]!.name).toBe('mcp__test-server__tool_b');
  });
});

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { ACPServer, createACPServer } from './acp-server.js';

function createTestHarness() {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  const server = new ACPServer(input, output);
  const collect = () =>
    chunks
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  return { server, input, output, chunks, collect };
}

describe('ACPServer', () => {
  it('handles initialize with default handler', async () => {
    const { server, input, collect } = createTestHarness();
    const startPromise = server.start();

    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.1.0' },
        },
      }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    const init = responses.find((r: any) => r.id === 1);
    expect(init.jsonrpc).toBe('2.0');
    expect(init.result.protocolVersion).toBe('2024-11-05');
    expect(init.result.serverInfo.name).toBe('sentinel-acp');
  });

  it('handles notifications/initialized as no-op', async () => {
    const { server, input, collect } = createTestHarness();
    const startPromise = server.start();

    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    expect(responses.length).toBe(1); // only shutdown response
    expect(responses[0].id).toBe(1);
  });

  it('handles tools/list with registered tools', async () => {
    const { server, input, collect } = createTestHarness();

    server.on('tools/list', async () => ({
      tools: [
        { name: 'read-file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
        { name: 'write-file', description: 'Write a file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } },
      ],
    }));

    const startPromise = server.start();

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    const list = responses.find((r: any) => r.id === 1);
    expect(list.result.tools).toHaveLength(2);
    expect(list.result.tools[0].name).toBe('read-file');
    expect(list.result.tools[1].name).toBe('write-file');
  });

  it('handles tools/call with registered handler', async () => {
    const { server, input, collect } = createTestHarness();

    server.on('tools/call', async (params) => ({
      content: [{ type: 'text', text: `Executed ${params.name} with args ${JSON.stringify(params.arguments)}` }],
    }));

    const startPromise = server.start();

    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read-file', arguments: { path: '/tmp/test.txt' } },
      }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    const call = responses.find((r: any) => r.id === 1);
    expect(call.result.content[0].text).toContain('read-file');
    expect(call.result.content[0].text).toContain('/tmp/test.txt');
  });

  it('returns error for unknown method', async () => {
    const { server, input, collect } = createTestHarness();
    const startPromise = server.start();

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'bogus/method' }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    const err = responses.find((r: any) => r.id === 1);
    expect(err.error.code).toBe(-32601);
    expect(err.error.message).toBe('Method not found: bogus/method');
  });

  it('returns error for handler that throws', async () => {
    const { server, input, collect } = createTestHarness();

    server.on('tools/call', async () => {
      throw new Error('handler exploded');
    });

    const startPromise = server.start();

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bad', arguments: {} } }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    const err = responses.find((r: any) => r.id === 1);
    expect(err.error.code).toBe(-32603);
    expect(err.error.message).toBe('handler exploded');
  });

  it('skips malformed JSON lines', async () => {
    const { server, input, collect } = createTestHarness();
    const startPromise = server.start();

    input.write('not json\n');
    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    expect(responses).toHaveLength(1);
    expect(responses[0].id).toBe(1);
  });

  it('responds to notifications without id (no response)', async () => {
    const { server, input, collect } = createTestHarness();
    const startPromise = server.start();

    input.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }) + '\n',
    );

    input.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' }) + '\n',
    );

    await startPromise;

    const responses = collect();
    expect(responses).toHaveLength(1); // only shutdown response (no response sent for notification-style tools/list)
    expect(responses[0].id).toBe(1);
  });
});

describe('createACPServer', () => {
  it('returns an ACPServer instance', () => {
    const server = createACPServer();
    expect(server).toBeInstanceOf(ACPServer);
    expect(server).toHaveProperty('start');
    expect(server).toHaveProperty('stop');
    expect(server).toHaveProperty('on');
    expect(server).toHaveProperty('notify');
    expect(server).toHaveProperty('respond');
    expect(server).toHaveProperty('respondError');
  });
});

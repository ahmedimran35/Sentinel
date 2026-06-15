import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bashTool, destroySession } from './bash.js';

function collect(gen: AsyncIterable<unknown>): Promise<any[]> {
  const items: any[] = [];
  return (async () => { for await (const i of gen) items.push(i); return items; })();
}

const sessionId = 'bash-test-session';

describe('bashTool', () => {
  beforeEach(() => {
    destroySession(sessionId);
  });

  afterEach(() => {
    destroySession(sessionId);
  });

  it('runs a simple command', async () => {
    const events = await collect(bashTool.execute({ command: 'echo hello', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(false);
    expect(result.result.output).toBe('hello');
  });

  it('persists shell variables across commands', async () => {
    const ac = new AbortController();
    await collect(bashTool.execute({ command: 'export TEST_VAR=hello', timeout_ms: 5000 }, { sessionId, signal: ac.signal }));
    const events = await collect(bashTool.execute({ command: 'echo $TEST_VAR', timeout_ms: 5000 }, { sessionId, signal: ac.signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output, `output was: ${result.result.output}`).toBe('hello');
  });

  it('captures stderr output', async () => {
    const events = await collect(bashTool.execute({ command: 'echo err >&2', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output, `output was: ${result.result.output}`).toContain('err');
  });

  it('returns non-zero exit as error', async () => {
    const events = await collect(bashTool.execute({ command: 'false', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(true);
  });

  it('returns empty output for no-output command', async () => {
    const events = await collect(bashTool.execute({ command: 'true', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(false);
  });

  it('handles multi-line output', async () => {
    const events = await collect(bashTool.execute({ command: "printf 'line1\\nline2\\nline3'", timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output, `output was: ${result.result.output}`).toContain('line1');
  });

  it('respects timeout', async () => {
    const start = Date.now();
    const events = await collect(bashTool.execute({ command: 'sleep 10', timeout_ms: 500 }, { sessionId, signal: new AbortController().signal }));
    const elapsed = Date.now() - start;
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(elapsed).toBeLessThan(3000);
    expect(result.result.output).toContain('exited with code');
  });

  it('handles abort signal', async () => {
    const ac = new AbortController();
    const promise = collect(bashTool.execute({ command: 'sleep 30', timeout_ms: 10_000 }, { sessionId, signal: ac.signal }));
    ac.abort();
    const events = await promise;
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(true);
  });

  it('returns command not found error', async () => {
    const events = await collect(bashTool.execute({ command: 'nonexistent_command_xyz', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(true);
  });

  it('outputs exit code on error command', async () => {
    const events = await collect(bashTool.execute({ command: 'exit 42', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(true);
  });

  it('destroySession cleans up', async () => {
    const ac = new AbortController();
    await collect(bashTool.execute({ command: 'echo first', timeout_ms: 5000 }, { sessionId, signal: ac.signal }));
    destroySession(sessionId);

    const events = await collect(bashTool.execute({ command: 'echo second', timeout_ms: 5000 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError, `output was: ${result.result.output}`).toBe(false);
    expect(result.result.output).toBe('second');
  });
});

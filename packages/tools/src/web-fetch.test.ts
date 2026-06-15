import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webFetchTool } from './web-fetch.js';

function collect(gen: AsyncIterable<unknown>): Promise<any[]> {
  const items: any[] = [];
  return (async () => { for await (const i of gen) items.push(i); return items; })();
}

const sessionId = 'fetch-test';

describe('webFetchTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-http/https protocols', async () => {
    const events = await collect(webFetchTool.execute({ url: 'ftp://example.com/file' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
    expect(result.result.output).toContain('Only http and https');
  });

  it('rejects disallowed domain', async () => {
    const events = await collect(webFetchTool.execute({ url: 'https://evil.com/malware' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
    expect(result.result.output).toContain('not in the allowlist');
  });

  it('rejects invalid URL', async () => {
    const events = await collect(webFetchTool.execute({ url: 'not-a-url' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });

  it('fetches content from allowed domain', async () => {
    const mockText = 'Hello from the internet!';
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(mockText),
      ok: true,
    });

    const events = await collect(webFetchTool.execute({ url: 'https://github.com/sentinel' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('Hello from the internet!');
  });

  it('truncates content over 50K chars', async () => {
    const longText = 'x'.repeat(60_000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(longText),
      ok: true,
    });

    const events = await collect(webFetchTool.execute({ url: 'https://github.com/sentinel' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).toContain('truncated at 50000');
    expect(result.result.output!.length).toBeLessThan(60_000);
  });

  it('returns error when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const events = await collect(webFetchTool.execute({ url: 'https://github.com/sentinel' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
    expect(result.result.output).toContain('Network failure');
  });

  it('respects abort signal', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });
    });

    const ac = new AbortController();
    const eventsPromise = collect(webFetchTool.execute({ url: 'https://github.com/sentinel' }, { sessionId, signal: ac.signal }));
    setTimeout(() => ac.abort(), 50);
    const events = await eventsPromise;
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });

  it('allows subdomain of allowed domain', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('docs content'),
      ok: true,
    });

    const events = await collect(webFetchTool.execute({ url: 'https://docs.github.com/some-page' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);

    const events2 = await collect(webFetchTool.execute({ url: 'https://sub.raw.githubusercontent.com/file' }, { sessionId, signal: new AbortController().signal }));
    const result2 = events2.find((e: any) => e.type === 'tool_result');
    expect(result2.result.isError).toBe(false);
  });

  it('blocks sub.subdomain of allowed domain', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('content'),
      ok: true,
    });

    const events = await collect(webFetchTool.execute({ url: 'https://a.b.github.com/page' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });

  it('handles empty response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(''),
      ok: true,
    });

    const events = await collect(webFetchTool.execute({ url: 'https://github.com/empty' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toBe('');
  });
});

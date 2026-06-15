import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webSearchTool } from './web-search.js';

function collect(gen: AsyncIterable<unknown>): Promise<any[]> {
  const items: any[] = [];
  return (async () => { for await (const i of gen) items.push(i); return items; })();
}

const sessionId = 'search-test';

describe('webSearchTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns formatted results from DuckDuckGo', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        Abstract: 'Sentinel is an AI coding agent.',
        AbstractText: 'Sentinel AI',
        AbstractURL: 'https://example.com/sentinel',
        Results: [
          { Text: 'Sentinel GitHub repo', FirstURL: 'https://github.com/sentinel' },
          { Text: 'Sentinel docs', FirstURL: 'https://docs.sentinel.dev' },
        ],
      }),
    });

    const events = await collect(webSearchTool.execute({ query: 'sentinel ai', count: 3 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('Sentinel is an AI coding agent');
    expect(result.result.output).toContain('Sentinel GitHub repo');
  });

  it('formats related topics', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        RelatedTopics: [
          { Text: 'Related topic 1', FirstURL: 'https://example.com/1' },
          { Text: 'Related topic 2', FirstURL: 'https://example.com/2' },
        ],
      }),
    });

    const events = await collect(webSearchTool.execute({ query: 'test', count: 5 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('Related topic 1');
    expect(result.result.output).toContain('Related topic 2');
  });

  it('returns no results message when empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const events = await collect(webSearchTool.execute({ query: 'xyznonexistent12345' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('No results found');
  });

  it('handles API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const events = await collect(webSearchTool.execute({ query: 'test' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
    expect(result.result.output).toContain('429');
  });

  it('handles network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const events = await collect(webSearchTool.execute({ query: 'test' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });

  it('honors count parameter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        Results: Array.from({ length: 20 }, (_, i) => ({
          Text: `Result ${i + 1}`,
          FirstURL: `https://example.com/${i + 1}`,
        })),
      }),
    });

    const events = await collect(webSearchTool.execute({ query: 'test', count: 3 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    const lines = result.result.output.split('\n').filter((l: string) => l.startsWith(/^\d+\./.test(l) ? '' : ''));
    const numberedLines = result.result.output.match(/^\d+\./gm);
    expect(numberedLines ? numberedLines.length : 0).toBeLessThanOrEqual(3);
  });

  it('strips HTML from results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        Results: [{ Text: '<b>bold</b> and <i>italic</i>', FirstURL: 'https://example.com' }],
      }),
    });

    const events = await collect(webSearchTool.execute({ query: 'test' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).not.toContain('<b>');
    expect(result.result.output).not.toContain('<i>');
    expect(result.result.output).toContain('bold');
    expect(result.result.output).toContain('italic');
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
    const eventsPromise = collect(webSearchTool.execute({ query: 'test' }, { sessionId, signal: ac.signal }));
    setTimeout(() => ac.abort(), 50);
    const events = await eventsPromise;
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });
});

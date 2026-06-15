import { z } from 'zod';
import type { Tool } from '@sentinel/shared';

const WebSearchSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  count: z.number().int().min(1).max(20).default(5).describe('Number of results to return'),
});

interface DuckDuckGoResult {
  title: string;
  body: string;
  url: string;
}

interface DuckDuckGoResponse {
  Abstract?: string;
  AbstractText?: string;
  AbstractURL?: string;
  Results?: Array<{ Text?: string; FirstURL?: string; Result?: string }>;
  RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Result?: string; Topics?: Array<{ Text?: string; FirstURL?: string; Result?: string }> }>;
}

async function searchDuckDuckGo(query: string, count: number, signal: AbortSignal): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`DuckDuckGo API error: ${res.status}`);
  const data = (await res.json()) as DuckDuckGoResponse;

  const results: DuckDuckGoResult[] = [];

  if (data.Abstract) {
    results.push({
      title: data.AbstractText || data.Abstract?.slice(0, 80),
      body: data.Abstract.slice(0, 2000),
      url: data.AbstractURL || '',
    });
  }

  if (data.Results) {
    for (const r of data.Results) {
      if (results.length >= count) break;
      const text = r.Text ?? r.Result ?? '';
      const cleanText = text.replace(/<[^>]+>/g, '');
      const urlMatch = text.match(/href="([^"]+)"/) ?? text.match(/\(([^)]+)\)$/);
      results.push({
        title: cleanText.slice(0, 80),
        body: cleanText.slice(0, 500),
        url: r.FirstURL ?? urlMatch?.[1] ?? '',
      });
    }
  }

  if (data.RelatedTopics && results.length < count) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= count) break;
      if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= count) break;
          const text = sub.Text ?? '';
          results.push({
            title: text.slice(0, 80),
            body: text.slice(0, 500),
            url: sub.FirstURL ?? '',
          });
        }
      } else if (topic.Text) {
        results.push({
          title: topic.Text.slice(0, 80),
          body: topic.Text.slice(0, 500),
          url: topic.FirstURL ?? '',
        });
      }
    }
  }

  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.body}`).join('\n\n');
}

export const webSearchTool: Tool<typeof WebSearchSchema> = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns up to 20 results with titles, URLs, and snippets.',
  risk: 'network',
  inputSchema: WebSearchSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;
    try {
      const output = await searchDuckDuckGo(input.query, input.count, ctx.signal);
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'search', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'search',
          output: `Error searching: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};

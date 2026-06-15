import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GoogleSearchProvider,
  BraveSearchProvider,
  BingSearchProvider,
  DuckDuckGoSearchProvider,
  TavilySearchProvider,
  Search1APIProvider,
  SearXNGProvider,
  WebSearchProvider,
  detectSearchProvider,
} from './web-search-provider.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function mockResponse(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

describe('GoogleSearchProvider', () => {
  it('returns empty array when no API key', async () => {
    const provider = new GoogleSearchProvider({ provider: 'google' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('fetches from Custom Search API', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_CX', 'test-cx');
    mockFetch.mockResolvedValueOnce(mockResponse({
      items: [
        { title: 'Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
      ],
    }));

    const provider = new GoogleSearchProvider({ provider: 'google' });
    const results = await provider.search({ query: 'hello', numResults: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Result 1');
    expect(results[0]?.url).toBe('https://example.com/1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('googleapis.com/customsearch/v1'),
    );
  });

  it('returns empty array on non-ok response', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_CX', 'test-cx');
    mockFetch.mockResolvedValueOnce(new Response('', { status: 403 }));

    const provider = new GoogleSearchProvider({ provider: 'google' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });
});

describe('BraveSearchProvider', () => {
  it('returns empty array when no API key', async () => {
    const provider = new BraveSearchProvider({ provider: 'brave' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('fetches from Brave Search API', async () => {
    vi.stubEnv('BRAVE_API_KEY', 'test-key');
    mockFetch.mockResolvedValueOnce(mockResponse({
      web: { results: [{ title: 'Brave Result', url: 'https://brave.com', description: 'Desc' }] },
    }));

    const provider = new BraveSearchProvider({ provider: 'brave' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Brave Result');
    expect(results[0]?.url).toBe('https://brave.com');
    expect(results[0]?.snippet).toBe('Desc');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.search.brave.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Subscription-Token': 'test-key' }),
      }),
    );
  });
});

describe('BingSearchProvider', () => {
  it('returns empty array when no key', async () => {
    const provider = new BingSearchProvider({ provider: 'bing' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('fetches from Bing API', async () => {
    vi.stubEnv('BING_API_KEY', 'test-key');
    mockFetch.mockResolvedValueOnce(mockResponse({
      webPages: { value: [{ name: 'Bing Result', url: 'https://bing.com', snippet: 'Bing snippet' }] },
    }));

    const provider = new BingSearchProvider({ provider: 'bing' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Bing Result');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.bing.microsoft.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Ocp-Apim-Subscription-Key': 'test-key' }),
      }),
    );
  });
});

describe('DuckDuckGoSearchProvider', () => {
  it('returns empty array on error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    const provider = new DuckDuckGoSearchProvider({ provider: 'duckduckgo' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('parses DDG instant answer response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      AbstractText: 'Abstract text',
      AbstractURL: 'https://example.com/abstract',
      AbstractSource: 'Wikipedia',
      Results: [{ Text: 'Result text', FirstURL: 'https://example.com/r1' }],
      RelatedTopics: [
        { Text: 'Related 1', FirstURL: 'https://example.com/rel1' },
        {
          Text: 'Category',
          FirstURL: '',
          Topics: [
            { Text: 'Sub topic', FirstURL: 'https://example.com/sub' },
          ],
        },
      ],
    }));

    const provider = new DuckDuckGoSearchProvider({ provider: 'duckduckgo' });
    const results = await provider.search({ query: 'test' });

    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results[0]?.title).toBe('Wikipedia');
    expect(results[0]?.url).toBe('https://example.com/abstract');
  });
});

describe('TavilySearchProvider', () => {
  it('returns empty array when no key', async () => {
    const provider = new TavilySearchProvider({ provider: 'tavily' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('fetches from Tavily API', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key');
    mockFetch.mockResolvedValueOnce(mockResponse({
      results: [{ title: 'Tavily R', url: 'https://tavily.com', content: 'some content' }],
    }));

    const provider = new TavilySearchProvider({ provider: 'tavily' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Tavily R');
    expect(results[0]?.content).toBe('some content');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"query":"test"'),
      }),
    );
  });
});

describe('Search1APIProvider', () => {
  it('returns empty array when no key', async () => {
    const provider = new Search1APIProvider({ provider: 'search1api' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('fetches from search1api', async () => {
    vi.stubEnv('SEARCH1API_KEY', 'test-key');
    mockFetch.mockResolvedValueOnce(mockResponse({
      result: [{ title: 'S1', url: 'https://s1.com', snippet: 'snip', content: 'full' }],
    }));

    const provider = new Search1APIProvider({ provider: 'search1api' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('S1');
    expect(results[0]?.content).toBe('full');
  });
});

describe('SearXNGProvider', () => {
  it('uses default endpoint when none configured', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ results: [] }));
    const provider = new SearXNGProvider({ provider: 'searxng' });
    await provider.search({ query: 'test' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8888'),
      expect.anything(),
    );
  });

  it('uses custom endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      results: [{ title: 'SearXNG', url: 'https://sxng.com', content: 'content' }],
    }));

    const provider = new SearXNGProvider({ provider: 'searxng', endpoint: 'https://search.example.com' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('SearXNG');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://search.example.com'),
      expect.anything(),
    );
  });
});

describe('WebSearchProvider', () => {
  it('delegates to correct provider impl', async () => {
    const provider = new WebSearchProvider({ provider: 'google', apiKey: 'k', endpoint: '', maxResults: 5 });
    expect(provider.name).toBe('google');
  });

  it('throws for unknown provider type', () => {
    expect(() => new WebSearchProvider({ provider: 'unknown' as never })).toThrow();
  });
});

describe('detectSearchProvider', () => {
  it('returns null when no env vars set', () => {
    expect(detectSearchProvider()).toBeNull();
  });

  it('detects Tavily from env', () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('tavily');
    expect(config?.apiKey).toBe('tvly-key');
  });

  it('detects Brave from env', () => {
    vi.stubEnv('BRAVE_API_KEY', 'brave-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('brave');
  });

  it('detects Google from env', () => {
    vi.stubEnv('GOOGLE_API_KEY', 'google-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('google');
  });

  it('detects Bing from env', () => {
    vi.stubEnv('BING_API_KEY', 'bing-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('bing');
  });

  it('detects search1api from env', () => {
    vi.stubEnv('SEARCH1API_KEY', 's1-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('search1api');
  });

  it('detects SearXNG from endpoint env', () => {
    vi.stubEnv('SEARXNG_ENDPOINT', 'https://sxng.local');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('searxng');
    expect(config?.endpoint).toBe('https://sxng.local');
  });

  it('first matching env wins', () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-key');
    vi.stubEnv('BRAVE_API_KEY', 'brave-key');
    const config = detectSearchProvider();
    expect(config?.provider).toBe('tavily');
  });
});

export type SearchProviderType = 'google' | 'brave' | 'bing' | 'duckduckgo' | 'tavily' | 'search1api' | 'searxng';

export interface SearchProviderConfig {
  provider: SearchProviderType;
  apiKey?: string;
  endpoint?: string;
  maxResults?: number;
  contextMaxCharacters?: number;
  livecrawl?: 'fallback' | 'preferred';
}

export interface SearchOptions {
  query: string;
  numResults?: number;
  livecrawl?: 'fallback' | 'preferred';
  type?: 'auto' | 'fast' | 'deep';
  contextMaxCharacters?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface ISearchProvider {
  search(options: SearchOptions): Promise<SearchResult[]>;
  readonly name: string;
}

const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_CONTEXT_MAX_CHARS = 10000;

abstract class BaseProvider implements ISearchProvider {
  abstract readonly name: string;
  protected apiKey?: string;
  protected endpoint?: string;
  protected maxResults: number;
  protected contextMaxCharacters: number;
  protected livecrawl?: 'fallback' | 'preferred';

  constructor(config: SearchProviderConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;
    this.contextMaxCharacters = config.contextMaxCharacters ?? DEFAULT_CONTEXT_MAX_CHARS;
    this.livecrawl = config.livecrawl;
  }

  abstract search(options: SearchOptions): Promise<SearchResult[]>;
}

export class GoogleSearchProvider extends BaseProvider {
  readonly name = 'google';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const cx = process.env['GOOGLE_CX'] ?? '';
    const key = this.apiKey ?? process.env['GOOGLE_API_KEY'] ?? '';
    if (!cx || !key) return [];

    const num = Math.min(options.numResults ?? this.maxResults, 10);
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(options.query)}&cx=${cx}&key=${key}&num=${num}`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const data = (await res.json()) as { items?: Array<{ title: string; link: string; snippet: string }> };
    return (data.items ?? []).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));
  }
}

export class BraveSearchProvider extends BaseProvider {
  readonly name = 'brave';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const key = this.apiKey ?? process.env['BRAVE_API_KEY'] ?? '';
    if (!key) return [];

    const num = Math.min(options.numResults ?? this.maxResults, 20);
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(options.query)}&count=${num}`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    return (data.web?.results ?? []).map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.description,
    }));
  }
}

export class BingSearchProvider extends BaseProvider {
  readonly name = 'bing';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const key = this.apiKey ?? process.env['BING_API_KEY'] ?? '';
    if (!key) return [];

    const num = Math.min(options.numResults ?? this.maxResults, 50);
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(options.query)}&count=${num}`;

    const res = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
      },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      webPages?: { value?: Array<{ name: string; url: string; snippet: string }> };
    };
    return (data.webPages?.value ?? []).map(item => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet,
    }));
  }
}

export class DuckDuckGoSearchProvider extends BaseProvider {
  readonly name = 'duckduckgo';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const num = options.numResults ?? this.maxResults;
    const query = encodeURIComponent(options.query);

    const res = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      Results?: Array<{ Text: string; FirstURL: string }>;
      RelatedTopics?: Array<{ Text: string; FirstURL: string; Topics?: Array<{ Text: string; FirstURL: string }> }>;
    };

    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.AbstractSource ?? 'DuckDuckGo',
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    for (const item of data.Results ?? []) {
      results.push({ title: item.Text, url: item.FirstURL, snippet: item.Text });
    }

    for (const topic of data.RelatedTopics ?? []) {
      if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= num) break;
          results.push({ title: sub.Text, url: sub.FirstURL, snippet: sub.Text });
        }
      } else if (topic.Text) {
        results.push({ title: topic.Text, url: topic.FirstURL, snippet: topic.Text });
      }
      if (results.length >= num) break;
    }

    return results.slice(0, num);
  }
}

export class TavilySearchProvider extends BaseProvider {
  readonly name = 'tavily';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const key = this.apiKey ?? process.env['TAVILY_API_KEY'] ?? '';
    if (!key) return [];

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: options.query,
        max_results: options.numResults ?? this.maxResults,
        search_depth: options.type === 'deep' ? 'advanced' : 'basic',
        include_answer: false,
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
    };
    return (data.results ?? []).map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.content.slice(0, this.contextMaxCharacters),
      content: item.content,
    }));
  }
}

export class Search1APIProvider extends BaseProvider {
  readonly name = 'search1api';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const key = this.apiKey ?? process.env['SEARCH1API_KEY'] ?? '';
    if (!key) return [];

    const res = await fetch('https://api.search1api.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: options.query,
        max_results: options.numResults ?? this.maxResults,
        search_service: options.type === 'deep' ? 'search' : 'search',
        crawl: options.livecrawl === 'preferred' ? 1 : (options.livecrawl === 'fallback' ? 0 : 0),
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      result?: Array<{ title: string; url: string; snippet: string; content?: string }>;
    };
    return (data.result ?? []).map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet ?? '',
      content: item.content,
    }));
  }
}

export class SearXNGProvider extends BaseProvider {
  readonly name = 'searxng';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const endpoint = this.endpoint ?? process.env['SEARXNG_ENDPOINT'] ?? 'http://localhost:8888';
    const num = Math.min(options.numResults ?? this.maxResults, 50);

    const url = `${endpoint}/search?q=${encodeURIComponent(options.query)}&format=json&number_of_results=${num}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
    };
    return (data.results ?? []).map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.content?.slice(0, this.contextMaxCharacters) ?? '',
      content: item.content,
    }));
  }
}

export class WebSearchProvider {
  private impl: ISearchProvider;

  constructor(private config: SearchProviderConfig) {
    void this.config;

    this.impl = createProviderInstance(config);
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    return this.impl.search(options);
  }

  get name(): string {
    return this.impl.name;
  }
}

function createProviderInstance(config: SearchProviderConfig): ISearchProvider {
  switch (config.provider) {
    case 'google': return new GoogleSearchProvider(config);
    case 'brave': return new BraveSearchProvider(config);
    case 'bing': return new BingSearchProvider(config);
    case 'duckduckgo': return new DuckDuckGoSearchProvider(config);
    case 'tavily': return new TavilySearchProvider(config);
    case 'search1api': return new Search1APIProvider(config);
    case 'searxng': return new SearXNGProvider(config);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown search provider: ${_exhaustive}`);
    }
  }
}

export function detectSearchProvider(): SearchProviderConfig | null {
  const envKeyMap: Array<{ envVar: string; provider: SearchProviderType; endpointEnv?: string }> = [
    { envVar: 'TAVILY_API_KEY', provider: 'tavily' },
    { envVar: 'BRAVE_API_KEY', provider: 'brave' },
    { envVar: 'GOOGLE_API_KEY', provider: 'google' },
    { envVar: 'BING_API_KEY', provider: 'bing' },
    { envVar: 'SEARCH1API_KEY', provider: 'search1api' },
    { envVar: 'SEARXNG_ENDPOINT', provider: 'searxng', endpointEnv: 'SEARXNG_ENDPOINT' },
  ];

  for (const entry of envKeyMap) {
    const val = process.env[entry.envVar];
    if (val) {
      const config: SearchProviderConfig = {
        provider: entry.provider,
        apiKey: val,
      };
      if (entry.endpointEnv) {
        config.endpoint = process.env[entry.endpointEnv];
      }
      return config;
    }
  }

  return null;
}

import { readFileSync, existsSync } from 'node:fs';
import { request as httpRequest, type RequestOptions, type IncomingMessage, type Agent } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

export interface ProxyConfig {
  http?: string;
  https?: string;
  noProxy?: string[];
  socks?: string;
  auth?: {
    username: string;
    password: string;
  };
}

export interface SSLConfig {
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  strictSSL?: boolean;
}

function parseProxyUrl(raw: string): { url: string; auth?: { username: string; password: string } } {
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      return {
        url: `${url.protocol}//${url.host}`,
        auth: { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) },
      };
    }
    return { url: raw };
  } catch {
    return { url: raw };
  }
}

export function loadProxyConfig(): ProxyConfig {
  const config: ProxyConfig = {};

  const opencodeProxy = process.env['OPENCODE_PROXY'];
  if (opencodeProxy) {
    const parsed = parseProxyUrl(opencodeProxy);
    config.http = parsed.url;
    config.https = parsed.url;
    if (parsed.auth) config.auth = parsed.auth;
  }

  const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy'];
  if (httpProxy) config.http ??= httpProxy;

  const httpsProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy'];
  if (httpsProxy) config.https ??= httpsProxy;

  const allProxy = process.env['ALL_PROXY'] || process.env['all_proxy'];
  if (allProxy) {
    config.http ??= allProxy;
    config.https ??= allProxy;
  }

  const noProxyRaw = process.env['NO_PROXY'] || process.env['no_proxy'];
  if (noProxyRaw) {
    config.noProxy = noProxyRaw.split(',').map(s => s.trim()).filter(Boolean);
  }

  return config;
}

export function loadSSLConfig(): SSLConfig {
  return {
    caCert: process.env['OPENCODE_CA_CERT'],
    clientCert: process.env['OPENCODE_CLIENT_CERT'],
    clientKey: process.env['OPENCODE_CLIENT_KEY'],
    strictSSL: process.env['OPENCODE_STRICT_SSL'] !== 'false',
  };
}

function shouldBypassProxy(targetUrl: string, noProxy?: string[]): boolean {
  if (!noProxy || noProxy.length === 0) return false;
  try {
    const target = new URL(targetUrl);
    const hostname = target.hostname.toLowerCase();
    return noProxy.some(pattern => {
      const p = pattern.toLowerCase();
      if (p.startsWith('.') && hostname.endsWith(p)) return true;
      if (p === hostname) return true;
      if (p.includes('*')) {
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const re = new RegExp('^' + escaped + '$');
        if (hostname.match(re)) return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

function resolveProxyUrl(targetUrl: string, config: ProxyConfig): string | undefined {
  try {
    const target = new URL(targetUrl);
    if (target.protocol === 'https:' || target.protocol === 'wss:') {
      return config.https ?? config.http;
    }
    return config.http ?? config.https;
  } catch {
    return config.http ?? config.https;
  }
}

function buildAgentUrl(baseUrl: string, auth?: { username: string; password: string }): string {
  if (!auth) return baseUrl;
  try {
    const u = new URL(baseUrl);
    u.username = encodeURIComponent(auth.username);
    u.password = encodeURIComponent(auth.password);
    return u.toString();
  } catch {
    return baseUrl;
  }
}

export async function createProxyAgent(targetUrl: string, config: ProxyConfig): Promise<Agent | undefined> {
  if (shouldBypassProxy(targetUrl, config.noProxy)) return undefined;

  const proxyUrl = resolveProxyUrl(targetUrl, config);
  if (!proxyUrl && !config.socks) return undefined;

  if (config.socks) {
    try {
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      const url = buildAgentUrl(config.socks, config.auth);
      return new SocksProxyAgent(url) as unknown as Agent;
    } catch {
      return undefined;
    }
  }

  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const url = buildAgentUrl(proxyUrl, config.auth);
      return new HttpsProxyAgent(url) as unknown as Agent;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function createSSLOptions(config: SSLConfig): { ca?: Buffer; cert?: Buffer; key?: Buffer; rejectUnauthorized: boolean } {
  const options: { ca?: Buffer; cert?: Buffer; key?: Buffer; rejectUnauthorized: boolean } = {
    rejectUnauthorized: config.strictSSL !== false,
  };

  if (config.caCert && existsSync(config.caCert)) {
    options.ca = readFileSync(config.caCert);
  }

  if (config.clientCert && existsSync(config.clientCert)) {
    options.cert = readFileSync(config.clientCert);
  }

  if (config.clientKey && existsSync(config.clientKey)) {
    options.key = readFileSync(config.clientKey);
  }

  return options;
}

function requestAsync(urlStr: string, agent: Agent, sslConfig?: SSLConfig): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:' || url.protocol === 'wss:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const ssl = sslConfig ? createSSLOptions(sslConfig) : undefined;

    const opts: RequestOptions & { rejectUnauthorized?: boolean } = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      agent,
      rejectUnauthorized: ssl?.rejectUnauthorized ?? true,
      ...(ssl?.ca ? { ca: ssl.ca } : {}),
      ...(ssl?.cert ? { cert: ssl.cert } : {}),
      ...(ssl?.key ? { key: ssl.key } : {}),
    };

    const req = requestFn(opts, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) {
            headers[key!] = Array.isArray(val) ? val.join(', ') : String(val);
          }
        }
        resolve(new Response(body, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers,
        }));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export async function proxiedFetch(
  url: string,
  options?: RequestInit & { proxy?: ProxyConfig; ssl?: SSLConfig },
): Promise<Response> {
  const { proxy: proxyOverride, ssl: sslOverride, ...fetchOptions } = options ?? {};
  const proxyConfig = proxyOverride ?? loadProxyConfig();
  const sslConfig = sslOverride ?? undefined;

  if (shouldBypassProxy(url, proxyConfig.noProxy)) {
    return fetch(url, fetchOptions);
  }

  const agent = await createProxyAgent(url, proxyConfig);

  if (agent) {
    return requestAsync(url, agent, sslConfig);
  }

  return fetch(url, fetchOptions);
}

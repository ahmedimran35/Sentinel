import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadProxyConfig,
  loadSSLConfig,
  createSSLOptions,
} from './proxy.js';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('no_proxy', '');
  vi.stubEnv('NO_PROXY', '');
});

describe('loadProxyConfig', () => {
  it('returns empty config when no env vars set', () => {
    const config = loadProxyConfig();
    expect(config.http).toBeUndefined();
    expect(config.https).toBeUndefined();
    expect(config.noProxy).toBeUndefined();
    expect(config.auth).toBeUndefined();
  });

  it('reads OPENCODE_PROXY and parses auth from URL', () => {
    vi.stubEnv('OPENCODE_PROXY', 'http://user:pass@proxy.example:8080');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://proxy.example:8080');
    expect(config.https).toBe('http://proxy.example:8080');
    expect(config.auth).toEqual({ username: 'user', password: 'pass' });
  });

  it('reads HTTP_PROXY and HTTPS_PROXY', () => {
    vi.stubEnv('HTTP_PROXY', 'http://http-proxy:3128');
    vi.stubEnv('HTTPS_PROXY', 'http://https-proxy:3128');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://http-proxy:3128');
    expect(config.https).toBe('http://https-proxy:3128');
  });

  it('reads lowercase http_proxy and https_proxy', () => {
    vi.stubEnv('http_proxy', 'http://lower-proxy:8080');
    vi.stubEnv('https_proxy', 'http://lower-proxy:8080');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://lower-proxy:8080');
    expect(config.https).toBe('http://lower-proxy:8080');
  });

  it('reads ALL_PROXY as fallback', () => {
    vi.stubEnv('ALL_PROXY', 'http://all-proxy:8888');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://all-proxy:8888');
    expect(config.https).toBe('http://all-proxy:8888');
  });

  it('OPENCODE_PROXY takes precedence over HTTP_PROXY', () => {
    vi.stubEnv('OPENCODE_PROXY', 'http://primary:8080');
    vi.stubEnv('HTTP_PROXY', 'http://secondary:8080');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://primary:8080');
  });

  it('reads NO_PROXY and splits into array', () => {
    vi.stubEnv('NO_PROXY', 'localhost,127.0.0.1,.example.com');
    const config = loadProxyConfig();
    expect(config.noProxy).toEqual(['localhost', '127.0.0.1', '.example.com']);
  });

  it('reads lowercase no_proxy', () => {
    vi.stubEnv('no_proxy', 'localhost,.test.com');
    const config = loadProxyConfig();
    expect(config.noProxy).toEqual(['localhost', '.test.com']);
  });

  it('handles empty OPENCODE_PROXY with no auth', () => {
    vi.stubEnv('OPENCODE_PROXY', 'http://proxy:8080');
    const config = loadProxyConfig();
    expect(config.http).toBe('http://proxy:8080');
    expect(config.auth).toBeUndefined();
  });

  it('handles OPENCODE_PROXY with special chars in auth', () => {
    vi.stubEnv('OPENCODE_PROXY', 'http://user%40domain:pa%24s@proxy:8080');
    const config = loadProxyConfig();
    expect(config.auth?.username).toBe('user@domain');
    expect(config.auth?.password).toBe('pa$s');
  });
});

describe('loadSSLConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = loadSSLConfig();
    expect(config.caCert).toBeUndefined();
    expect(config.clientCert).toBeUndefined();
    expect(config.clientKey).toBeUndefined();
    expect(config.strictSSL).toBe(true);
  });

  it('reads SSL env vars', () => {
    vi.stubEnv('OPENCODE_CA_CERT', '/etc/ssl/ca.pem');
    vi.stubEnv('OPENCODE_CLIENT_CERT', '/etc/ssl/cert.pem');
    vi.stubEnv('OPENCODE_CLIENT_KEY', '/etc/ssl/key.pem');
    vi.stubEnv('OPENCODE_STRICT_SSL', 'false');
    const config = loadSSLConfig();
    expect(config.caCert).toBe('/etc/ssl/ca.pem');
    expect(config.clientCert).toBe('/etc/ssl/cert.pem');
    expect(config.clientKey).toBe('/etc/ssl/key.pem');
    expect(config.strictSSL).toBe(false);
  });

  it('strictSSL defaults to true', () => {
    vi.stubEnv('OPENCODE_STRICT_SSL', 'true');
    expect(loadSSLConfig().strictSSL).toBe(true);
  });
});

describe('createSSLOptions', () => {
  it('returns rejectUnauthorized true when strictSSL is true', () => {
    const opts = createSSLOptions({ strictSSL: true });
    expect(opts.rejectUnauthorized).toBe(true);
  });

  it('returns rejectUnauthorized false when strictSSL is false', () => {
    const opts = createSSLOptions({ strictSSL: false });
    expect(opts.rejectUnauthorized).toBe(false);
  });

  it('defaults to rejectUnauthorized true', () => {
    const opts = createSSLOptions({});
    expect(opts.rejectUnauthorized).toBe(true);
  });

  it('returns empty options when no paths provided', () => {
    const opts = createSSLOptions({});
    expect(opts.ca).toBeUndefined();
    expect(opts.cert).toBeUndefined();
    expect(opts.key).toBeUndefined();
  });
});

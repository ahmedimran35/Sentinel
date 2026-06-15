import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchWellKnownConfig, parseWellKnownUrl } from './well-known.js';

describe('parseWellKnownUrl', () => {
  it('extracts host and path from a valid URL', () => {
    expect(parseWellKnownUrl('https://example.com/.well-known/opencode'))
      .toEqual({ host: 'example.com', path: '/.well-known/opencode' });
  });

  it('handles URLs with ports', () => {
    expect(parseWellKnownUrl('https://example.com:8080/.well-known/opencode'))
      .toEqual({ host: 'example.com', path: '/.well-known/opencode' });
  });

  it('handles subdomains', () => {
    expect(parseWellKnownUrl('https://enterprise.acme.com/.well-known/opencode'))
      .toEqual({ host: 'enterprise.acme.com', path: '/.well-known/opencode' });
  });

  it('handles http scheme', () => {
    expect(parseWellKnownUrl('http://internal.corp/.well-known/opencode'))
      .toEqual({ host: 'internal.corp', path: '/.well-known/opencode' });
  });

  it('returns null for invalid URLs', () => {
    expect(parseWellKnownUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseWellKnownUrl('')).toBeNull();
  });
});

describe('fetchWellKnownConfig', () => {
  afterEach(() => {
    delete process.env['SENTINEL_WELL_KNOWN_URL'];
    vi.restoreAllMocks();
  });

  it('returns null when no URL is available', async () => {
    expect(await fetchWellKnownConfig()).toBeNull();
  });

  it('fetches from SENTINEL_WELL_KNOWN_URL env var', async () => {
    const mockConfig = { version: '1.0', organization: 'Acme' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockConfig), { status: 200 }),
    );
    process.env['SENTINEL_WELL_KNOWN_URL'] = 'https://example.com/.well-known/opencode';
    expect(await fetchWellKnownConfig()).toEqual(mockConfig);
  });

  it('passes the correct URL from env var', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ version: '1.0' }), { status: 200 }),
    );
    process.env['SENTINEL_WELL_KNOWN_URL'] = 'https://acme.com/custom/path';
    await fetchWellKnownConfig();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://acme.com/custom/path',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns null on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    process.env['SENTINEL_WELL_KNOWN_URL'] = 'https://example.com/.well-known/opencode';
    expect(await fetchWellKnownConfig()).toBeNull();
  });

  it('returns null when config has no version field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ organization: 'Acme' }), { status: 200 }),
    );
    process.env['SENTINEL_WELL_KNOWN_URL'] = 'https://example.com/.well-known/opencode';
    expect(await fetchWellKnownConfig()).toBeNull();
  });

  it('returns null on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    process.env['SENTINEL_WELL_KNOWN_URL'] = 'https://example.com/.well-known/opencode';
    expect(await fetchWellKnownConfig()).toBeNull();
  });

  it('returns null when env var URL is set but empty string', async () => {
    process.env['SENTINEL_WELL_KNOWN_URL'] = '';
    expect(await fetchWellKnownConfig()).toBeNull();
  });
});

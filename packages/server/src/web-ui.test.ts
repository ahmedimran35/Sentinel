import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { serveWebUi } from './web-ui.js';

describe('serveWebUi', () => {
  it('returns HTML content with correct content type', () => {
    const req = { url: '/web', method: 'GET' } as IncomingMessage;
    let statusCode = 0;
    let headers: Record<string, string | string[]> = {};
    let body = '';

    const res = {
      writeHead: (code: number, h: Record<string, string | string[]>) => {
        statusCode = code;
        headers = h;
      },
      end: (chunk: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse;

    serveWebUi(req, res);

    expect(statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(body.length).toBeGreaterThan(100);
  });

  it('includes required elements in the HTML', () => {
    const req = { url: '/web', method: 'GET' } as IncomingMessage;
    let body = '';

    const res = {
      writeHead: () => {},
      end: (chunk: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse;

    serveWebUi(req, res);

    expect(body).toContain('id="message-input"');
    expect(body).toContain('id="message-list"');
    expect(body).toContain('id="sessions-container"');
    expect(body).toContain('id="send-btn"');
    expect(body).toContain('id="new-session-btn"');
    expect(body).toContain('id="auth-modal"');
    expect(body).toContain('id="status-indicator"');
    expect(body).toContain('id="config-model"');
    expect(body).toContain('id="config-provider"');
    expect(body).toContain('id="config-mode"');
    expect(body).toContain('/events');
    expect(body).toContain('id="sidebar"');
    expect(body).toContain('id="input-area"');
  });

  it('contains dark theme CSS variables', () => {
    const req = { url: '/web', method: 'GET' } as IncomingMessage;
    let body = '';

    const res = {
      writeHead: () => {},
      end: (chunk: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse;

    serveWebUi(req, res);

    expect(body).toContain('--bg:');
    expect(body).toContain('--surface:');
    expect(body).toContain('--accent:');
    expect(body).toContain('--text:');
    expect(body).toContain('--border:');
    expect(body).toContain('--error:');
  });

  it('contains SSE connection code', () => {
    const req = { url: '/web', method: 'GET' } as IncomingMessage;
    let body = '';

    const res = {
      writeHead: () => {},
      end: (chunk: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse;

    serveWebUi(req, res);

    expect(body).toContain('connectSSE');
    expect(body).toContain('fetch(\'/events');
  });
});

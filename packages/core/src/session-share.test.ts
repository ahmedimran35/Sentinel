import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSession, importSession, SessionNotFoundError, InvalidShareJsonError } from './session-share.js';
import * as sessionStore from './session-store.js';
import type { SavedSession } from './session-store.js';
import type { Session, Config } from './commands/types.js';

const mockSession: SavedSession = {
  id: 'test-123',
  startTime: '2024-01-15T10:30:00.000Z',
  endTime: '2024-01-15T11:45:00.000Z',
  tokenCounts: { input: 1500, output: 800, cached: 200 },
  cost: 0.0425,
  model: 'gpt-4',
  mode: 'code',
  history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
        },
      ],
    },
    { role: 'tool', content: 'file content', tool_call_id: 'call_1', name: 'read_file' },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('exportSession', () => {
  it('exports session in JSON format', () => {
    vi.spyOn(sessionStore, 'loadSession').mockReturnValue(mockSession);

    const result = exportSession('test-123', '/fake/project');

    const parsed = JSON.parse(result);
    expect(parsed.version).toBe(1);
    expect(parsed.session.id).toBe('test-123');
    expect(parsed.session.tokenCounts.input).toBe(1500);
    expect(parsed.session.cost).toBe(0.0425);
    expect(parsed.session.history).toHaveLength(4);
  });

  it('exports session in markdown format', () => {
    vi.spyOn(sessionStore, 'loadSession').mockReturnValue(mockSession);

    const result = exportSession('test-123', '/fake/project', 'md');

    expect(result).toContain('# Session: test-123');
    expect(result).toContain('**Model:** gpt-4');
    expect(result).toContain('**Mode:** code');
    expect(result).toContain('**Cost:** $0.0425');
    expect(result).toContain('**Tokens:** 1500 in / 800 out / 200 cached');
    expect(result).toContain('👤 User');
    expect(result).toContain('🤖 Assistant');
    expect(result).toContain('Hi there!');
    expect(result).toContain('🔧 Tool');
    expect(result).toContain('file content');
    expect(result).toContain('read_file');
  });

  it('throws SessionNotFoundError for missing session', () => {
    vi.spyOn(sessionStore, 'loadSession').mockReturnValue(null);

    expect(() => exportSession('missing', '/fake/project')).toThrow(SessionNotFoundError);
  });
});

describe('importSession', () => {
  it('imports valid JSON and saves session', () => {
    const saveSpy = vi.spyOn(sessionStore, 'saveSession').mockImplementation(() => {});

    const json = JSON.stringify({
      version: 1,
      createdAt: '2024-01-15T12:00:00.000Z',
      session: {
        id: 'imported-1',
        startTime: '2024-01-15T10:00:00.000Z',
        endTime: '2024-01-15T11:00:00.000Z',
        tokenCounts: { input: 100, output: 50, cached: 10 },
        cost: 0.005,
        model: 'claude-3',
        mode: 'ask',
        history: [{ role: 'user', content: 'test' }],
      },
    });

    const result = importSession(json, '/fake/project');

    expect(result.id).toBe('imported-1');

    expect(saveSpy).toHaveBeenCalledOnce();
    const [, session, config] = saveSpy.mock.calls[0] as [string, Session, Config];
    expect(session.id).toBe('imported-1');
    expect(session.tokenCounts.input).toBe(100);
    expect(session.cost).toBe(0.005);
    expect(config.model).toBe('claude-3');
    expect(config.mode).toBe('ask');
  });

  it('throws InvalidShareJsonError for invalid JSON string', () => {
    expect(() => importSession('not json', '/fake/project')).toThrow(InvalidShareJsonError);
  });

  it('throws InvalidShareJsonError for missing session id', () => {
    const json = JSON.stringify({ version: 1, session: { noId: true } });
    expect(() => importSession(json, '/fake/project')).toThrow(InvalidShareJsonError);
  });

  it('throws InvalidShareJsonError for unsupported version', () => {
    const json = JSON.stringify({ version: 2, session: { id: 'x' } });
    expect(() => importSession(json, '/fake/project')).toThrow(InvalidShareJsonError);
  });
});

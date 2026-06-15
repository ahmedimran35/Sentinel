import { describe, it, expect } from 'vitest';
import { sanitizeJson } from './sanitize-json.js';

describe('sanitizeJson', () => {
  it('parses normal JSON', () => {
    const result = sanitizeJson('{"a": 1, "b": "hello"}');
    expect(result).toEqual({ a: 1, b: 'hello' });
  });

  it('parses arrays', () => {
    const result = sanitizeJson('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('strips __proto__ keys', () => {
    const result = sanitizeJson('{"__proto__": {"polluted": true}, "a": 1}') as Record<string, unknown>;
    expect(result).not.toHaveProperty('__proto__');
    expect(result).toHaveProperty('a', 1);
  });

  it('strips constructor keys', () => {
    const result = sanitizeJson('{"constructor": {"prototype": {"polluted": true}}, "a": 1}') as Record<string, unknown>;
    expect(result).not.toHaveProperty('constructor');
    expect(result).toHaveProperty('a', 1);
  });

  it('strips __proto__ in nested objects', () => {
    const json = '{"nested": {"__proto__": {"polluted": true}, "keep": "value"}}';
    const result = sanitizeJson(json) as Record<string, any>;
    expect(result.nested).not.toHaveProperty('__proto__');
    expect(result.nested).toHaveProperty('keep', 'value');
  });

  it('preserves other underscored keys', () => {
    const result = sanitizeJson('{"_private": "secret", "normal": "value"}');
    expect(result).toEqual({ _private: 'secret', normal: 'value' });
  });

  it('handles null', () => {
    const result = sanitizeJson('null');
    expect(result).toBeNull();
  });

  it('handles primitive values', () => {
    expect(sanitizeJson('"string"')).toBe('string');
    expect(sanitizeJson('42')).toBe(42);
    expect(sanitizeJson('true')).toBe(true);
  });

  it('handles empty object', () => {
    expect(sanitizeJson('{}')).toEqual({});
  });

  it('handles empty array', () => {
    expect(sanitizeJson('[]')).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => sanitizeJson('not json')).toThrow();
  });
});

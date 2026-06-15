import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL, BUILTIN_MODELS } from './models.js';

describe('models', () => {
  it('has a default model', () => {
    expect(DEFAULT_MODEL).toBe('claude-sonnet-4-20250514');
  });

  it('has builtin models array', () => {
    expect(Array.isArray(BUILTIN_MODELS)).toBe(true);
    expect(BUILTIN_MODELS.length).toBeGreaterThanOrEqual(5);
  });

  it('includes default model in builtins', () => {
    expect(BUILTIN_MODELS).toContain(DEFAULT_MODEL);
  });

  it('all builtin models are non-empty strings', () => {
    for (const model of BUILTIN_MODELS) {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { detectLanguage } from './lsp-manager.js';

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('component.tsx')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(detectLanguage('src/app.js')).toBe('javascript');
    expect(detectLanguage('component.jsx')).toBe('javascript');
  });

  it('detects Python', () => {
    expect(detectLanguage('main.py')).toBe('python');
  });

  it('detects Go', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('detects Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rust');
  });

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('file.md')).toBeNull();
    expect(detectLanguage('Makefile')).toBeNull();
  });
});

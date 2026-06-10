import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from './agents-init.js';

describe('generateAgentsMd', () => {
  it('generates AGENTS.md for a TypeScript project', () => {
    const analysis = {
      languages: ['TypeScript/JavaScript'],
      frameworks: [],
      buildTools: ['tsc'],
      testFramework: 'vitest',
      packageManager: 'pnpm',
      conventions: [],
    };

    const content = generateAgentsMd(analysis, '/test-project');
    expect(content).toContain('# test-project');
    expect(content).toContain('TypeScript/JavaScript');
    expect(content).toContain('pnpm');
    expect(content).toContain('vitest');
    expect(content).toContain('tsc build');
  });

  it('includes conventions', () => {
    const analysis = {
      languages: ['Rust'],
      frameworks: ['Axum'],
      buildTools: ['cargo'],
      testFramework: 'unknown',
      packageManager: 'cargo',
      conventions: ['Docker containerized'],
    };

    const content = generateAgentsMd(analysis, '/rust-app');
    expect(content).toContain('Rust');
    expect(content).toContain('Axum');
    expect(content).toContain('Docker containerized');
    expect(content).toContain('cargo build');
  });
});

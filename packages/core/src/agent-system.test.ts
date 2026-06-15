import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from './agent-registry.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry('/tmp');
    registry.loadBuiltinAgents();
  });

  describe('builtin agents', () => {
    it('loads all 8 builtin agents', () => {
      const all = registry.listAgents();
      expect(all).toHaveLength(8);
    });

    it('loads build agent as primary', () => {
      const agent = registry.getAgent('build');
      expect(agent).toBeDefined();
      expect(agent!.config.mode).toBe('primary');
      expect(agent!.source).toBe('builtin');
    });

    it('loads plan agent as read-only', () => {
      const agent = registry.getAgent('plan');
      expect(agent).toBeDefined();
      expect(agent!.config.mode).toBe('primary');
      expect(agent!.config.tools?.edit).toBe(false);
      expect(agent!.config.tools?.bash).toBe(false);
    });

    it('loads general subagent', () => {
      const agent = registry.getAgent('general');
      expect(agent).toBeDefined();
      expect(agent!.config.mode).toBe('subagent');
    });

    it('marks compaction as hidden', () => {
      const agent = registry.getAgent('compaction');
      expect(agent).toBeDefined();
      expect(agent!.config.hidden).toBe(true);
    });
  });

  describe('agent filtering', () => {
    it('returns only primary agents', () => {
      const primary = registry.getPrimaryAgents();
      expect(primary.every(a => a.config.mode === 'primary')).toBe(true);
    });

    it('returns only subagents', () => {
      const subs = registry.getSubAgents();
      expect(subs.every(a => a.config.mode === 'subagent')).toBe(true);
    });

    it('returns all agents for mode all', () => {
      const all = registry.listAgents('all');
      expect(all).toHaveLength(8);
    });
  });

  describe('agent resolution', () => {
    it('returns agent by name', () => {
      const agent = registry.resolveAgent('build');
      expect(agent.name).toBe('build');
    });

    it('falls back to build for unknown agent', () => {
      const agent = registry.resolveAgent('nonexistent');
      expect(agent.name).toBe('build');
    });

    it('default agent is build', () => {
      const agent = registry.getDefaultAgent();
      expect(agent.name).toBe('build');
    });
  });

  describe('load from config', () => {
    it('loads agents from config object', () => {
      const custom = new AgentRegistry('/tmp');
      custom.loadFromConfig({
        'custom-agent': {
          description: 'Custom test agent',
          mode: 'subagent',
          temperature: 0.5,
        },
      });
      const agent = custom.getAgent('custom-agent');
      expect(agent).toBeDefined();
      expect(agent!.config.description).toBe('Custom test agent');
      expect(agent!.config.mode).toBe('subagent');
      expect(agent!.config.temperature).toBe(0.5);
      expect(agent!.source).toBe('json');
    });

    it('overrides existing agents when loaded from config', () => {
      registry.loadFromConfig({
        build: { description: 'Overridden build', mode: 'subagent' },
      });
      const agent = registry.getAgent('build');
      expect(agent!.config.description).toBe('Overridden build');
      expect(agent!.source).toBe('json');
    });
  });

  describe('mode validation', () => {
    it('preserves only valid modes', () => {
      const custom = new AgentRegistry('/tmp');
      custom.loadFromConfig({
        valid: { mode: 'primary' },
        invalid: { mode: 'invalid' as 'primary' },
      });
      expect(custom.getAgent('valid')!.config.mode).toBe('primary');
    });
  });

  describe('markdown parsing', () => {
    it('parses YAML frontmatter and body', () => {
      const content = `---
description: Test markdown agent
mode: subagent
temperature: 0.7
hidden: true
---
You are a helpful test agent.`;

      const dir = '/tmp/sentinel-test-agents';
      const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(dir + '/test-agent.md', content);

      const custom = new AgentRegistry('/tmp');
      custom.loadFromDirectory(dir);
      const agent = custom.getAgent('test-agent');
      expect(agent).toBeDefined();
      expect(agent!.config.description).toBe('Test markdown agent');
      expect(agent!.config.mode).toBe('subagent');
      expect(agent!.config.temperature).toBe(0.7);
      expect(agent!.config.hidden).toBe(true);
      expect(agent!.config.prompt).toBe('You are a helpful test agent.');
      expect(agent!.source).toBe('markdown');
    });

    it('skips files without frontmatter', () => {
      const dir = '/tmp/sentinel-test-agents';
      const { writeFileSync } = require('node:fs');
      writeFileSync(dir + '/no-frontmatter.md', 'Just plain text');

      const custom = new AgentRegistry('/tmp');
      custom.loadFromDirectory(dir);
      expect(custom.getAgent('no-frontmatter')).toBeUndefined();
    });
  });
});

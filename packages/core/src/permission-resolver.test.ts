import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionResolver, DEFAULT_PERMISSIONS } from './permission-resolver.js';
import type { PermissionAction } from './permission-resolver.js';

describe('PermissionResolver', () => {
  describe('resolve — direct action', () => {
    it('returns action for explicitly configured tool', () => {
      const r = new PermissionResolver({ bash: 'ask' });
      expect(r.resolve('bash')).toBe('ask');
    });

    it('returns action for multiple tools', () => {
      const r = new PermissionResolver({ bash: 'deny', read: 'allow' });
      expect(r.resolve('bash')).toBe('deny');
      expect(r.resolve('read')).toBe('allow');
    });

    it('falls back to global * when tool not configured', () => {
      const r = new PermissionResolver({ '*': 'allow' });
      expect(r.resolve('grep')).toBe('allow');
    });

    it('returns ask when nothing matches (no global, no tool)', () => {
      const r = new PermissionResolver({});
      expect(r.resolve('webfetch')).toBe('ask');
    });

    it('global * is overridden by tool-specific config', () => {
      const r = new PermissionResolver({ '*': 'deny', read: 'allow' });
      expect(r.resolve('read')).toBe('allow');
      expect(r.resolve('bash')).toBe('deny');
    });
  });

  describe('resolve — pattern-based', () => {
    it('matches input against patterns', () => {
      const r = new PermissionResolver({
        read: {
          '*.md': 'allow',
          '*.secret': 'deny',
        },
      });
      expect(r.resolve('read', 'readme.md')).toBe('allow');
      expect(r.resolve('read', 'keys.secret')).toBe('deny');
    });

    it('falls back to * catch-all in pattern map', () => {
      const r = new PermissionResolver({
        read: {
          '*': 'allow',
          '*.env': 'deny',
        },
      });
      expect(r.resolve('read', 'index.ts')).toBe('allow');
      expect(r.resolve('read', '.env')).toBe('deny');
    });

    it('returns ask when no pattern matches and no * catch-all', () => {
      const r = new PermissionResolver({
        webfetch: {
          'https://safe.com/*': 'allow',
        },
      });
      expect(r.resolve('webfetch', 'https://evil.com/payload')).toBe('ask');
    });

    it('returns ask when pattern map has no * and tool not in global', () => {
      const r = new PermissionResolver({
        webfetch: { '*.txt': 'allow' },
      });
      expect(r.resolve('webfetch')).toBe('ask');
    });

    it('uses * catch-all from pattern map when no input given', () => {
      const r = new PermissionResolver({
        read: {
          '*': 'deny',
          '*.md': 'allow',
        },
      });
      expect(r.resolve('read')).toBe('deny');
    });
  });

  describe('wildcard matching', () => {
    let r: PermissionResolver;

    beforeEach(() => {
      r = new PermissionResolver({
        read: {
          '*.txt': 'allow',
          '???.md': 'allow',
          'data.????.csv': 'allow',
          'src/**/index.ts': 'deny',
        },
      });
    });

    it('* matches zero or more characters', () => {
      expect(r.resolve('read', 'file.txt')).toBe('allow');
      expect(r.resolve('read', '.txt')).toBe('allow');
      expect(r.resolve('read', 'a.b.c.txt')).toBe('allow');
    });

    it('? matches exactly one character', () => {
      expect(r.resolve('read', 'abc.md')).toBe('allow');
      expect(r.resolve('read', 'ab.md')).toBe('ask');
      expect(r.resolve('read', 'abcd.md')).toBe('ask');
    });

    it('? with digits works', () => {
      expect(r.resolve('read', 'data.2025.csv')).toBe('allow');
      expect(r.resolve('read', 'data.25.csv')).toBe('ask');
    });
  });

  describe('home directory expansion', () => {
    const originalHome = process.env.HOME;

    afterEach(() => {
      process.env.HOME = originalHome;
    });

    it('expands ~/ in input to home directory', () => {
      process.env.HOME = '/home/testuser';
      const r = new PermissionResolver({
        read: {
          '/home/testuser/*.ts': 'deny',
        },
      });
      expect(r.resolve('read', '~/config.ts')).toBe('deny');
    });

    it('expands ~/ in pattern to home directory', () => {
      process.env.HOME = '/Users/me';
      const r = new PermissionResolver({
        read: {
          '~/*.ts': 'deny',
        },
      });
      expect(r.resolve('read', '/Users/me/main.ts')).toBe('deny');
    });

    it('does not expand ~ when not followed by /', () => {
      const r = new PermissionResolver({});
      expect(r.matchPattern('~test/file', '~test/file')).toBe(true);
    });
  });

  describe('getEffectiveConfig — per-agent overrides', () => {
    it('returns copy of global config when no agent config', () => {
      const r = new PermissionResolver({ '*': 'allow', bash: 'ask' });
      const effective = r.getEffectiveConfig();
      expect(effective['*']).toBe('allow');
      expect(effective['bash']).toBe('ask');
    });

    it('agent action overrides global action for same key', () => {
      const r = new PermissionResolver({ '*': 'allow', bash: 'deny' });
      const effective = r.getEffectiveConfig({ bash: 'ask' });
      expect(effective['bash']).toBe('ask');
    });

    it('agent pattern map merges with global pattern map', () => {
      const r = new PermissionResolver({
        read: {
          '*': 'allow',
          '*.env': 'deny',
        },
      });
      const effective = r.getEffectiveConfig({
        read: {
          '*.env': 'ask',
          'secrets/*': 'deny',
        },
      });
      const readConfig = effective['read'] as Record<string, PermissionAction>;
      expect(readConfig['*']).toBe('allow');
      expect(readConfig['*.env']).toBe('ask');
      expect(readConfig['secrets/*']).toBe('deny');
    });

    it('agent action replaces global pattern map', () => {
      const r = new PermissionResolver({
        read: { '*': 'allow', '*.env': 'deny' },
      });
      const effective = r.getEffectiveConfig({ read: 'deny' });
      expect(effective['read']).toBe('deny');
    });

    it('agent adds new keys not present in global', () => {
      const r = new PermissionResolver({ '*': 'allow' });
      const effective = r.getEffectiveConfig({ doom_loop: 'deny' });
      expect(effective['doom_loop']).toBe('deny');
    });
  });

  describe('DEFAULT_PERMISSIONS', () => {
    let r: PermissionResolver;

    beforeEach(() => {
      r = new PermissionResolver(DEFAULT_PERMISSIONS);
    });

    it('allows most tools by default', () => {
      expect(r.resolve('bash', 'npm test')).toBe('allow');
      expect(r.resolve('edit', 'src/index.ts')).toBe('allow');
      expect(r.resolve('glob', '**/*.ts')).toBe('allow');
      expect(r.resolve('grep', 'TODO')).toBe('allow');
      expect(r.resolve('task', 'find files')).toBe('allow');
      expect(r.resolve('webfetch', 'https://example.com')).toBe('allow');
    });

    it('asks for doom_loop', () => {
      expect(r.resolve('doom_loop')).toBe('ask');
    });

    it('asks for external_directory', () => {
      expect(r.resolve('external_directory')).toBe('ask');
    });

    it('denies .env files on read', () => {
      expect(r.resolve('read', '.env')).toBe('deny');
      expect(r.resolve('read', '.env.local')).toBe('deny');
      expect(r.resolve('read', '.env.production')).toBe('deny');
    });

    it('allows .env.example on read', () => {
      expect(r.resolve('read', '.env.example')).toBe('allow');
    });

    it('allows other files on read', () => {
      expect(r.resolve('read', 'src/index.ts')).toBe('allow');
      expect(r.resolve('read', 'package.json')).toBe('allow');
    });

    it('denies nested .env files', () => {
      expect(r.resolve('read', 'config/.env')).toBe('deny');
      expect(r.resolve('read', 'config/.env.local')).toBe('deny');
    });
  });

  describe('pattern precedence', () => {
    it('specific patterns are checked before * catch-all', () => {
      const r = new PermissionResolver({
        read: {
          '*': 'deny',
          'safe.txt': 'allow',
        },
      });
      expect(r.resolve('read', 'safe.txt')).toBe('allow');
      expect(r.resolve('read', 'other.txt')).toBe('deny');
    });
  });
});

import { readFile, readdir } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface SkillDef {
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  filePath: string;
}

export const DEFAULT_SKILLS_DIRS: readonly string[] = Object.freeze([
  join('.sentinel', 'skills'),
  join(homedir(), '.config', 'sentinel', 'skills'),
]);

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

export class SkillManager {
  private skillsDirs: string[];

  constructor(skillsDirs?: string[]) {
    this.skillsDirs = skillsDirs ?? [...DEFAULT_SKILLS_DIRS];
  }

  /**
   * Scan all skill directories and load skill definitions.
   */
  async loadAll(): Promise<SkillDef[]> {
    const results: SkillDef[] = [];

    for (const dir of this.skillsDirs) {
      const resolved = resolve(dir);
      if (!existsSync(resolved)) continue;

      let entries: string[];
      try {
        entries = await readdir(resolved);
      } catch {
        continue;
      }

      const skillFiles = entries.filter(
        f => f.endsWith('.md') || f.endsWith('.skill.md'),
      );

      for (const file of skillFiles) {
        const filePath = join(resolved, file);
        try {
          const skill = await this.loadFromFile(filePath);
          results.push(skill);
        } catch {
          continue;
        }
      }
    }

    return results;
  }

  /**
   * Find skills whose triggers match the given input text.
   */
  findMatching(input: string): SkillDef[] {
    const all = this.loadAllSync();
    const lower = input.toLowerCase();
    return all.filter(skill =>
      skill.triggers.some(t => lower.includes(t.toLowerCase())),
    );
  }

  /**
   * Load a single skill definition from a markdown file with optional YAML frontmatter.
   */
  async loadFromFile(filePath: string): Promise<SkillDef> {
    const content = await readFile(filePath, 'utf-8');
    const parsed = this.parseSkillFile(filePath, content);
    return parsed;
  }

  /**
   * Concatenate instructions from multiple skills into a single block.
   */
  getInstructions(skills: SkillDef[]): string {
    return skills.map(s => s.instructions).filter(Boolean).join('\n\n---\n\n');
  }

  private parseSkillFile(filePath: string, content: string): SkillDef {
    const match = content.match(FRONTMATTER_RE);

    const baseName = filePath.replace(/\.skill\.md$/, '').replace(/\.md$/, '').split('/').pop() ?? 'unknown';

    if (!match) {
      return {
        name: baseName,
        description: '',
        triggers: [],
        instructions: content.trim(),
        filePath,
      };
    }

    const rawYaml = match[1]!;
    const instructions = (match[2] ?? '').trim();
    const frontmatter = this.parseMinimalYaml(rawYaml);

    return {
      name: typeof frontmatter.name === 'string' ? frontmatter.name : baseName,
      description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
      triggers: Array.isArray(frontmatter.triggers)
        ? frontmatter.triggers.filter((t): t is string => typeof t === 'string')
        : [],
      instructions,
      filePath,
    };
  }

  private loadAllSync(): SkillDef[] {
    const results: SkillDef[] = [];
    for (const dir of this.skillsDirs) {
      const resolved = resolve(dir);
      if (!existsSync(resolved)) continue;
      let entries: string[];
      try {
        entries = readdirSync(resolved);
      } catch {
        continue;
      }
      const skillFiles = entries.filter(
        f => f.endsWith('.md') || f.endsWith('.skill.md'),
      );
      for (const file of skillFiles) {
        const filePath = join(resolved, file);
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const parsed = this.parseSkillFile(filePath, raw);
          results.push(parsed);
        } catch {
          continue;
        }
      }
    }
    return results;
  }

  private parseMinimalYaml(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      result[key] = this.parseYamlValue(value);
    }
    return result;
  }

  private parseYamlValue(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    }
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    return value;
  }
}

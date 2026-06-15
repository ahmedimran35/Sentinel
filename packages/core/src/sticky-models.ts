import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_STORAGE_PATH = join(homedir(), '.config', 'sentinel', 'sticky-models.json');

export class StickyModelManager {
  private storagePath: string;
  private models: Record<string, string> = {};

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? DEFAULT_STORAGE_PATH;
    this.load();
  }

  /** Pin a model to a specific agent. */
  set(agentName: string, modelName: string): void {
    this.models[agentName] = modelName;
    this.save();
  }

  /** Get the pinned model for an agent, or null if not set. */
  get(agentName: string): string | null {
    return this.models[agentName] ?? null;
  }

  /** Remove the pinned model for an agent. */
  clear(agentName: string): void {
    delete this.models[agentName];
    this.save();
  }

  /** Get all sticky model assignments. */
  getAll(): Record<string, string> {
    return { ...this.models };
  }

  /** Return the sticky model if set, otherwise the default. */
  getEffective(agentName: string, defaultModel: string): string {
    return this.models[agentName] ?? defaultModel;
  }

  private save(): void {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.storagePath, JSON.stringify(this.models, null, 2), 'utf-8');
  }

  private load(): void {
    if (!existsSync(this.storagePath)) {
      this.models = {};
      return;
    }
    try {
      const raw = readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        this.models = parsed as Record<string, string>;
      } else {
        this.models = {};
      }
    } catch {
      this.models = {};
    }
  }
}

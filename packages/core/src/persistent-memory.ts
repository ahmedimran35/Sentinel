import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = '.sentinel/memory';
const INDEX_FILE = 'fts-index.json';
const ENTRIES_FILE = 'entries.json';

export interface StoredEntry {
  id: string;
  type: 'fact' | 'decision' | 'convention' | 'preference' | 'note';
  content: string;
  tags: string[];
  timestamp: number;
  source: string;
}

interface FtsIndex {
  [term: string]: string[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildIndex(entries: StoredEntry[]): FtsIndex {
  const index: FtsIndex = {};
  for (const entry of entries) {
    const terms = new Set([
      ...tokenize(entry.content),
      ...tokenize(entry.type),
      ...entry.tags.flatMap((t) => tokenize(t)),
    ]);
    for (const term of terms) {
      (index[term] ??= []).push(entry.id);
    }
  }
  return index;
}

function rankEntries(ids: string[], query: string, entries: Map<string, StoredEntry>): string[] {
  const queryTerms = new Set(tokenize(query));
  const scored = ids.map((id) => {
    const entry = entries.get(id);
    if (!entry) return { id, score: 0 };
    const entryTerms = tokenize(entry.content);
    const matchCount = [...queryTerms].filter((t) => entryTerms.includes(t)).length;
    const recency = entry.timestamp / Date.now();
    return { id, score: matchCount * 10 + recency * 5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

export class PersistentMemory {
  private rootDir: string;
  private entries: StoredEntry[] = [];
  private index: FtsIndex = {};
  private loaded = false;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private get dir(): string {
    return path.join(this.rootDir, MEMORY_DIR);
  }

  private get indexPath(): string {
    return path.join(this.dir, INDEX_FILE);
  }

  private get entriesPath(): string {
    return path.join(this.dir, ENTRIES_FILE);
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async load(): Promise<void> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.entriesPath, 'utf-8');
      this.entries = JSON.parse(raw) as StoredEntry[];
    } catch {
      this.entries = [];
    }
    try {
      const raw = await fs.readFile(this.indexPath, 'utf-8');
      this.index = JSON.parse(raw) as FtsIndex;
    } catch {
      this.index = {};
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.entriesPath, JSON.stringify(this.entries, null, 2), 'utf-8');
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  async store(
    type: StoredEntry['type'],
    content: string,
    tags: string[] = [],
    source = 'user',
  ): Promise<string> {
    if (!this.loaded) await this.load();

    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: StoredEntry = { id, type, content, tags, timestamp: Date.now(), source };
    this.entries.push(entry);

    const terms = new Set([
      ...tokenize(content),
      ...tokenize(type),
      ...tags.flatMap((t) => tokenize(t)),
    ]);
    for (const term of terms) {
      (this.index[term] ??= []).push(id);
    }

    await this.save();
    return id;
  }

  async search(query: string, limit = 10): Promise<StoredEntry[]> {
    if (!this.loaded) await this.load();

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const idSet = new Set<string>();
    for (const term of queryTerms) {
      const matches = this.index[term];
      if (matches) {
        for (const id of matches) idSet.add(id);
      }
    }

    const entryMap = new Map<string, StoredEntry>();
    for (const e of this.entries) {
      entryMap.set(e.id, e);
    }

    const ranked = rankEntries([...idSet], query, entryMap);
    return ranked.slice(0, limit).map((id) => entryMap.get(id)!);
  }

  async searchByType(type: StoredEntry['type'], limit = 20): Promise<StoredEntry[]> {
    if (!this.loaded) await this.load();
    return this.entries
      .filter((e) => e.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async getAll(limit = 50): Promise<StoredEntry[]> {
    if (!this.loaded) await this.load();
    return this.entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async delete(id: string): Promise<boolean> {
    if (!this.loaded) await this.load();
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.index = buildIndex(this.entries);
    await this.save();
    return true;
  }

  async recall(query: string, limit = 5): Promise<string> {
    const results = await this.search(query, limit);
    if (results.length === 0) return '';
    return results.map((r) => `[${r.type}] ${r.content} (${new Date(r.timestamp).toISOString().slice(0, 10)})`).join('\n');
  }
}

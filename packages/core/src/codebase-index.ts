import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface IndexedFile {
  path: string;
  content: string;
  tokens: string[];
  tfidf: Map<string, number>;
}

const DEFAULT_IGNORE = new Set(['node_modules', '.git', 'dist', '.tsbuildinfo', 'pnpm-lock.yaml']);

/**
 * Simple tokenizer: splits on non-alphanumeric characters, lowercases, filters short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$@]+/gu)
    .filter(t => t.length > 1);
}

/**
 * Computes term frequency for a token list.
 */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const total = tokens.length;
  if (total === 0) return tf;
  for (const [k, v] of tf) {
    tf.set(k, v / total);
  }
  return tf;
}

/**
 * TF-IDF based semantic search over a codebase.
 * Uses local TF-IDF vectors (no external API required).
 */
export class CodebaseIndex {
  private files: IndexedFile[] = [];
  private idf: Map<string, number> = new Map();

  /**
   * Recursively indexes a directory. Skips files matching ignorePatterns.
   * Only indexes text files (skips binary by reading as utf-8 and ignoring decode errors).
   */
  async indexDirectory(rootDir: string, ignorePatterns?: string[]): Promise<void> {
    const ignoreSet = new Set([...DEFAULT_IGNORE, ...(ignorePatterns ?? [])]);
    const entries: string[] = [];

    await this.walkDir(rootDir, rootDir, ignoreSet, entries);

    const fileContents: Array<{ path: string; content: string }> = [];
    for (const fp of entries) {
      try {
        const content = await readFile(fp, { encoding: 'utf-8' });
        fileContents.push({ path: fp, content });
      } catch {
        // skip binary or unreadable files
      }
    }

    for (const fc of fileContents) {
      const tokens = tokenize(fc.content);
      this.files.push({
        path: fc.path,
        content: fc.content,
        tokens,
        tfidf: computeTF(tokens),
      });
    }

    this.rebuild();
  }

  /**
   * Recursive directory walk respecting ignore patterns.
   */
  private async walkDir(
    currentDir: string,
    rootDir: string,
    ignoreSet: Set<string>,
    acc: string[],
  ): Promise<void> {
    let dirEntries: string[];
    try {
      dirEntries = await readdir(currentDir);
    } catch {
      return;
    }

    for (const name of dirEntries) {
      if (ignoreSet.has(name)) continue;
      const fullPath = join(currentDir, name);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await this.walkDir(fullPath, rootDir, ignoreSet, acc);
        } else if (s.isFile() && s.size > 0) {
          acc.push(fullPath);
        }
      } catch {
        // permission denied, etc.
      }
    }
  }

  /**
   * Rebuilds the IDF map from the current set of indexed files.
   */
  rebuild(): void {
    const df = new Map<string, number>();
    const n = this.files.length;
    if (n === 0) {
      this.idf = new Map();
      return;
    }

    for (const f of this.files) {
      const seen = new Set(f.tokens);
      for (const t of seen) {
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    const newIdf = new Map<string, number>();
    for (const [term, docCount] of df) {
      newIdf.set(term, Math.log(n / docCount));
    }
    this.idf = newIdf;

    // Recompute TF-IDF vectors
    for (const f of this.files) {
      const tf = computeTF(f.tokens);
      const tfidf = new Map<string, number>();
      for (const [term, tfVal] of tf) {
        const idfVal = this.idf.get(term);
        if (idfVal !== undefined) {
          tfidf.set(term, tfVal * idfVal);
        }
      }
      f.tfidf = tfidf;
    }
  }

  /**
   * Searches the indexed codebase for the given query.
   * Returns top-K results by cosine similarity with a content snippet.
   */
  search(query: string, topK?: number): Array<{ file: string; score: number; snippet: string }> {
    const k = topK ?? 10;
    if (this.files.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryTF = computeTF(queryTokens);
    const queryVec = new Map<string, number>();
    for (const [term, tf] of queryTF) {
      const idfVal = this.idf.get(term);
      if (idfVal !== undefined && idfVal > 0) {
        queryVec.set(term, tf * idfVal);
      }
    }

    // If no query terms match the corpus, return empty
    if (queryVec.size === 0) return [];

    const scores: Array<{ file: string; score: number; content: string }> = [];

    for (const f of this.files) {
      const dot = dotProduct(queryVec, f.tfidf);
      const magQ = magnitude(queryVec);
      const magD = magnitude(f.tfidf);
      if (magQ === 0 || magD === 0) continue;
      const score = dot / (magQ * magD);
      if (score <= 0) continue;
      scores.push({ file: f.path, score, content: f.content });
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, k);

    return top.map(s => ({
      file: s.file,
      score: s.score,
      snippet: extractSnippet(s.content, query),
    }));
  }

  /**
   * Returns basic stats about the indexed codebase.
   */
  getStats(): { totalFiles: number; totalTokens: number; indexedPaths: string[] } {
    let totalTokens = 0;
    for (const f of this.files) {
      totalTokens += f.tokens.length;
    }
    return {
      totalFiles: this.files.length,
      totalTokens,
      indexedPaths: this.files.map(f => f.path),
    };
  }
}

/**
 * Dot product of two sparse vectors.
 */
function dotProduct(a: Map<string, number>, b: Map<string, number>): number {
  let sum = 0;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined) {
      sum += v * bv;
    }
  }
  return sum;
}

/**
 * Euclidean magnitude of a sparse vector.
 */
function magnitude(v: Map<string, number>): number {
  let sum = 0;
  for (const val of v.values()) {
    sum += val * val;
  }
  return Math.sqrt(sum);
}

/**
 * Extracts ~50 chars of context around the first query term match in content.
 */
function extractSnippet(content: string, query: string): string {
  const terms = tokenize(query);
  if (terms.length === 0) return content.slice(0, 100);

  const firstTerm = terms[0];
  if (!firstTerm) return content.slice(0, 100);

  const lower = content.toLowerCase();
  const idx = lower.indexOf(firstTerm);
  if (idx === -1) return content.slice(0, 100);

  const start = Math.max(0, idx - 50);
  const end = Math.min(content.length, idx + firstTerm.length + 50);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

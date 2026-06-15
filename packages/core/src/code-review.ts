import { spawnSync } from 'node:child_process';

export interface ReviewResult {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface ReviewOptions {
  baseBranch?: string;
  includeUncommitted?: boolean;
}

/**
 * Wraps a git diff in a structured prompt for LLM code review.
 * Each issue should be emitted as a single line of JSON.
 */
export function createReviewPrompt(diff: string): string {
  return [
    'You are a senior code reviewer. Review the following diff and provide feedback.',
    '',
    'For each issue found, output a JSON object on its own line with this shape:',
    '{"file":"<path>","line":<number>,"severity":"error|warning|info","message":"<description>","suggestion":"<optional fix>"}',
    '',
    'Rules:',
    '- Focus on correctness, security, performance, and maintainability.',
    '- Be concise but specific.',
    '- Only flag real issues, not style preferences.',
    '',
    'Diff:',
    '```diff',
    diff,
    '```',
  ].join('\n');
}

/**
 * Parses LLM output into structured ReviewResult[].
 * Each non-empty line is parsed independently as JSON.
 */
export function parseReviewOutput(output: string): ReviewResult[] {
  const results: ReviewResult[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof parsed.file !== 'string' ||
        typeof parsed.line !== 'number' ||
        typeof parsed.severity !== 'string' ||
        typeof parsed.message !== 'string'
      ) {
        continue;
      }
      if (!['error', 'warning', 'info'].includes(parsed.severity)) continue;
      results.push({
        file: parsed.file,
        line: parsed.line,
        severity: parsed.severity as 'error' | 'warning' | 'info',
        message: parsed.message,
        suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : undefined,
      });
    } catch {
      // skip non-JSON lines (explanatory text from the LLM)
    }
  }
  return results;
}

/**
 * Runs git diff to get changes.
 *
 * When `includeUncommitted` is true, includes both staged and unstaged changes.
 * Otherwise diffs against the specified base branch (default: main, fallback: master).
 */
export async function getBranchDiff(options?: ReviewOptions): Promise<string> {
  const base = options?.baseBranch ?? 'main';
  const diffs: string[] = [];

  if (options?.includeUncommitted) {
    try {
      const staged = spawnSync('git', ['diff', '--staged'], {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      if ((staged.stdout ?? '').trim()) diffs.push('--- Staged changes ---\n' + staged.stdout);
    } catch {
      // no staged changes
    }
    try {
      const unstaged = spawnSync('git', ['diff'], {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      if ((unstaged.stdout ?? '').trim()) diffs.push('--- Unstaged changes ---\n' + unstaged.stdout);
    } catch {
      // no unstaged changes
    }
  } else {
    try {
      const verify = spawnSync('git', ['rev-parse', '--verify', base], {
        encoding: 'utf-8',
        stdio: 'ignore',
      });
      if (verify.status === 0) {
        const diff = spawnSync('git', ['diff', `${base}...HEAD`], {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        if (diff.stdout) diffs.push(diff.stdout);
      }
    } catch {
      try {
        const diff = spawnSync('git', ['diff', 'master...HEAD'], {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        if (diff.stdout) diffs.push(diff.stdout);
      } catch {
        // no base branch found
      }
    }
  }

  const joined = diffs.join('\n').trim();
  return joined || 'No changes found.';
}

/**
 * Creates a slash command handler for /local-review and /local-review-uncommitted.
 *
 * The returned `execute` function runs git diff, creates a review prompt,
 * calls the LLM via `ctx.callLLM`, and logs the parsed results.
 */
export function createReviewSlashCommand(): {
  name: string;
  execute: (
    args: string[],
    ctx: { log: (m: unknown) => void; callLLM?: (prompt: string) => Promise<string> },
  ) => Promise<void>;
} {
  return {
    name: 'local-review',
    async execute(
      args: string[],
      ctx: { log: (m: unknown) => void; callLLM?: (prompt: string) => Promise<string> },
    ): Promise<void> {
      const includeUncommitted = args.includes('--uncommitted') || args.includes('-u');
      const baseArg = args.find(a => a.startsWith('--base='));
      const baseBranch = baseArg ? baseArg.split('=')[1] : undefined;
      const diff = await getBranchDiff({ baseBranch, includeUncommitted });
      if (diff === 'No changes found.') {
        ctx.log('No changes to review.');
        return;
      }
      const prompt = createReviewPrompt(diff);
      if (!ctx.callLLM) {
        ctx.log('No LLM available. Review prompt:\n' + prompt);
        return;
      }
      const response = await ctx.callLLM(prompt);
      const results = parseReviewOutput(response);
      if (results.length === 0) {
        ctx.log('No issues found in the diff.');
        return;
      }
      for (const r of results) {
        ctx.log(`[${r.severity}] ${r.file}:${r.line} \u2014 ${r.message}`);
        if (r.suggestion) ctx.log(`  Suggestion: ${r.suggestion}`);
      }
    },
  };
}

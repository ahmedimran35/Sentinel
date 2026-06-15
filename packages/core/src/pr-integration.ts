import { spawnSync } from 'node:child_process';

export interface PROptions {
  repo?: string;
  prNumber?: number;
  baseBranch?: string;
}

export interface PRData {
  branch: string;
  diff: string;
  title: string;
  description: string;
}

const GITHUB_API = 'https://api.github.com';

export function parsePRUrl(url: string): PROptions {
  const trimmed = url.replace(/\/files$/, '').replace(/\/$/, '');
  const pattern = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;
  const match = pattern.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid GitHub PR URL: ${url}. Expected https://github.com/owner/repo/pull/123`);
  }
  const repo = match[1];
  const prNumber = Number(match[2]);
  if (!repo || !prNumber || Number.isNaN(prNumber)) {
    throw new Error(`Could not parse repo or PR number from: ${url}`);
  }
  return { repo, prNumber };
}

async function hasGhCli(): Promise<boolean> {
  try {
    spawnSync('gh', ['--version'], { encoding: 'utf-8', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runGh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`gh failed: ${result.stderr?.trim() || `exit code ${result.status}`}`);
  }
  return result.stdout?.trim() ?? '';
}

function runGit(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git failed: ${result.stderr?.trim() || `exit code ${result.status}`}`);
  }
  return result.stdout?.trim() ?? '';
}

async function fetchPRViaGh(options: PROptions): Promise<PRData> {
  const repoFlag = options.repo ? ['--repo', options.repo] : [];
  const prNum = String(options.prNumber);

  const infoJson = runGh(['pr', 'view', prNum, ...repoFlag, '--json', 'title,body,headRefName,baseRefName']);
  const info = JSON.parse(infoJson) as {
    title: string;
    body: string;
    headRefName: string;
    baseRefName: string;
  };

  const diff = runGh(['pr', 'diff', prNum, ...repoFlag]);

  return {
    branch: info.headRefName,
    diff,
    title: info.title,
    description: info.body ?? '',
  };
}

async function fetchPRViaApi(options: PROptions): Promise<PRData> {
  if (!options.repo) {
    throw new Error('repo is required when using the GitHub API fallback');
  }
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3.diff',
    'User-Agent': '@sentinel/core',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const prUrl = `${GITHUB_API}/repos/${options.repo}/pulls/${String(options.prNumber)}`;

  const diffRes = await fetch(prUrl, { headers });
  if (!diffRes.ok) {
    throw new Error(`GitHub API error fetching PR diff: ${diffRes.status} ${diffRes.statusText}`);
  }
  const diff = await diffRes.text();

  const metaRes = await fetch(prUrl, {
    headers: { ...headers, Accept: 'application/vnd.github.v3+json' },
  });
  if (!metaRes.ok) {
    throw new Error(`GitHub API error fetching PR metadata: ${metaRes.status} ${metaRes.statusText}`);
  }
  const meta = (await metaRes.json()) as {
    title: string;
    body: string | null;
    head: { ref: string };
    base: { ref: string };
  };

  return {
    branch: meta.head.ref,
    diff,
    title: meta.title,
    description: meta.body ?? '',
  };
}

export async function fetchPR(options: PROptions): Promise<PRData> {
  if (!options.prNumber) {
    throw new Error('prNumber is required');
  }
  if (await hasGhCli()) {
    return fetchPRViaGh(options);
  }
  return fetchPRViaApi(options);
}

export async function checkoutPR(options: PROptions): Promise<string> {
  const repoFlag = options.repo ? ['--repo', options.repo] : [];
  const prNum = String(options.prNumber);

  if (await hasGhCli()) {
    runGh(['pr', 'checkout', prNum, ...repoFlag]);
    const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    return branch;
  }

  if (!options.repo) {
    throw new Error('repo is required when using the fallback checkout path');
  }
  const refSpec = `refs/pull/${String(options.prNumber)}/head:pr-${String(options.prNumber)}`;
  runGit(['fetch', 'origin', refSpec]);
  const branchName = `pr-${String(options.prNumber)}`;
  runGit(['checkout', branchName]);
  return branchName;
}

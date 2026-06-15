import { spawn } from 'node:child_process';

export interface MRInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  author: string;
  createdAt: string;
  url: string;
  mergeStatus: string;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  author: string;
  createdAt: string;
  url: string;
}

export interface CodeSearchResult {
  path: string;
  repo: string;
  matches: string[];
}

export interface RepoInfo {
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
}

export class GitLabAgent {
  private glabPath: string;

  constructor(glabPath?: string) {
    this.glabPath = glabPath || 'glab';
  }

  private async run(args: string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.glabPath, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || `exit code ${code}`));
      });
      child.on('error', reject);
      if (input) { child.stdin.write(input); }
      child.stdin.end();
    });
  }

  private repoFlag(repo?: string): string[] {
    return repo ? ['--repo', repo] : [];
  }

  async checkAuth(): Promise<boolean> {
    try {
      await this.run(['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  async getMRInfo(mrNumber: number, repo?: string): Promise<MRInfo> {
    await this.run([
      'mr', 'view', String(mrNumber),
      ...this.repoFlag(repo),
    ]);
    const raw = await this.run([
      'mr', 'view', String(mrNumber),
      '--json', 'iid,title,description,state,sourceBranch,targetBranch,author,createdAt,webUrl,mergeStatus',
      ...this.repoFlag(repo),
    ]);
    return parseMRInfo(raw);
  }

  async listMRs(state: 'opened' | 'closed' | 'merged' | 'all', repo?: string, limit?: number): Promise<MRInfo[]> {
    const args = [
      'mr', 'list',
      '--json', 'iid,title,description,state,sourceBranch,targetBranch,author,createdAt,webUrl,mergeStatus',
      ...this.repoFlag(repo),
    ];
    if (state !== 'all') args.push('--state', state);
    if (limit) args.push('--limit', String(limit));
    const out = await this.run(args);
    return parseMRList(out);
  }

  async reviewMR(mrNumber: number, repo?: string): Promise<string> {
    const out = await this.run([
      'mr', 'diff', String(mrNumber),
      ...this.repoFlag(repo),
    ]);
    return out;
  }

  async createMR(title: string, body: string, repo?: string, sourceBranch?: string, targetBranch?: string): Promise<MRInfo> {
    const args = [
      'mr', 'create',
      '--title', title,
      '--description', body,
      '--json', 'iid,title,description,state,sourceBranch,targetBranch,author,createdAt,webUrl,mergeStatus',
      ...this.repoFlag(repo),
    ];
    if (sourceBranch) args.push('--source-branch', sourceBranch);
    if (targetBranch) args.push('--target-branch', targetBranch);
    const out = await this.run(args);
    return parseMRInfo(out);
  }

  async getIssue(issueNumber: number, repo?: string): Promise<IssueInfo> {
    const out = await this.run([
      'issue', 'view', String(issueNumber),
      '--json', 'iid,title,description,state,labels,author,createdAt,webUrl',
      ...this.repoFlag(repo),
    ]);
    return parseIssueInfo(out);
  }

  async listIssues(state: 'opened' | 'closed' | 'all', repo?: string, limit?: number): Promise<IssueInfo[]> {
    const args = [
      'issue', 'list',
      '--json', 'iid,title,description,state,labels,author,createdAt,webUrl',
      ...this.repoFlag(repo),
    ];
    if (state !== 'all') args.push('--state', state);
    if (limit) args.push('--limit', String(limit));
    const out = await this.run(args);
    return parseIssueList(out);
  }

  async createIssue(title: string, body: string, repo?: string, labels?: string[]): Promise<IssueInfo> {
    const args = [
      'issue', 'create',
      '--title', title,
      '--description', body,
      '--json', 'iid,title,description,state,labels,author,createdAt,webUrl',
      ...this.repoFlag(repo),
    ];
    if (labels && labels.length > 0) {
      args.push('--label', labels.join(','));
    }
    const out = await this.run(args);
    return parseIssueInfo(out);
  }

  async getFileContents(path: string, repo?: string, ref?: string): Promise<string> {
    const args = [
      'repo', 'view', path,
      ...this.repoFlag(repo),
    ];
    if (ref) args.push('--ref', ref);
    return this.run(args);
  }

  async searchCode(query: string, repo?: string): Promise<CodeSearchResult[]> {
    const args = [
      'search', 'code', query,
      ...this.repoFlag(repo),
    ];
    const out = await this.run(args);
    return parseCodeSearch(out);
  }

  async getRepoInfo(repo?: string): Promise<RepoInfo> {
    const out = await this.run([
      'repo', 'view',
      '--json', 'owner,name,description,defaultBranch,starCount,forkCount,openIssueCount,primaryLanguage',
      ...this.repoFlag(repo),
    ]);
    return parseRepoInfo(out);
  }
}

function mrFromObject(d: Record<string, unknown>): MRInfo {
  return {
    number: d.iid as number,
    title: d.title as string,
    body: (d.description as string) ?? '',
    state: d.state as string,
    sourceBranch: d.sourceBranch as string,
    targetBranch: d.targetBranch as string,
    author: ((d.author as Record<string, string>)?.username ?? (d.author as Record<string, string>)?.name ?? 'unknown') as string,
    createdAt: d.createdAt as string,
    url: d.webUrl as string,
    mergeStatus: (d.mergeStatus as string) ?? 'unknown',
  };
}

export function parseMRInfo(json: string): MRInfo {
  return mrFromObject(JSON.parse(json));
}

export function parseMRList(json: string): MRInfo[] {
  return JSON.parse(json).map(mrFromObject);
}

function issueFromObject(d: Record<string, unknown>): IssueInfo {
  return {
    number: d.iid as number,
    title: d.title as string,
    body: (d.description as string) ?? '',
    state: d.state as string,
    labels: ((d.labels ?? []) as Array<{ name?: string; title?: string }>).map(l => l.title ?? l.name ?? ''),
    author: ((d.author as Record<string, string>)?.username ?? (d.author as Record<string, string>)?.name ?? 'unknown') as string,
    createdAt: d.createdAt as string,
    url: d.webUrl as string,
  };
}

export function parseIssueInfo(json: string): IssueInfo {
  return issueFromObject(JSON.parse(json));
}

export function parseIssueList(json: string): IssueInfo[] {
  return JSON.parse(json).map(issueFromObject);
}

export function parseCodeSearch(json: string): CodeSearchResult[] {
  const arr = JSON.parse(json);
  return Array.isArray(arr) ? arr.map((d: Record<string, unknown>) => ({
    path: d.path as string ?? (d.filename as string) ?? '',
    repo: d.repo as string,
    matches: (d.matches as Array<{ content: string }> ?? []).map(m => m.content),
  })) : [];
}

export function parseRepoInfo(json: string): RepoInfo {
  const d = JSON.parse(json);
  return {
    owner: d.owner?.username ?? d.owner?.name ?? (typeof d.owner === 'string' ? d.owner : ''),
    name: d.name,
    description: d.description ?? '',
    defaultBranch: d.defaultBranch,
    stars: d.starCount ?? 0,
    forks: d.forkCount ?? 0,
    openIssues: d.openIssueCount ?? 0,
    language: d.primaryLanguage ?? d.language ?? '',
  };
}

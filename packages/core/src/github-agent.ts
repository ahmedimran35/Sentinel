import { spawn } from 'node:child_process';

export interface PRInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  head: string;
  base: string;
  author: string;
  createdAt: string;
  url: string;
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

export interface WorkflowInfo {
  id: number;
  name: string;
  state: string;
  path: string;
}

export interface BranchInfo {
  name: string;
  commitSha: string;
}

export interface CodeSearchResult {
  path: string;
  repo: string;
  matches: string[];
}

export interface CommentInfo {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
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

export class GitHubAgent {
  private ghPath: string;

  constructor(ghPath?: string) {
    this.ghPath = ghPath || 'gh';
  }

  private async run(args: string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ghPath, args);
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

  async getPRInfo(prNumber: number, repo?: string): Promise<PRInfo> {
    const out = await this.run([
      'pr', 'view', String(prNumber),
      '--json', 'number,title,body,state,headRefName,baseRefName,author,createdAt,url',
      ...this.repoFlag(repo),
    ]);
    return parsePRInfo(out);
  }

  async listPRs(state: 'open' | 'closed' | 'merged' | 'all', repo?: string, limit?: number): Promise<PRInfo[]> {
    const args = [
      'pr', 'list',
      '--json', 'number,title,body,state,headRefName,baseRefName,author,createdAt,url',
      ...this.repoFlag(repo),
    ];
    if (state !== 'all') args.push('--state', state);
    if (limit) args.push('--limit', String(limit));
    const out = await this.run(args);
    return parsePRList(out);
  }

  async reviewPR(prNumber: number, repo?: string): Promise<string> {
    const out = await this.run([
      'pr', 'diff', String(prNumber),
      ...this.repoFlag(repo),
    ]);
    return out;
  }

  async createPR(title: string, body: string, repo?: string, head?: string, base?: string): Promise<PRInfo> {
    const args = [
      'pr', 'create',
      '--title', title,
      '--body', body,
      '--json', 'number,title,body,state,headRefName,baseRefName,author,createdAt,url',
      ...this.repoFlag(repo),
    ];
    if (head) args.push('--head', head);
    if (base) args.push('--base', base);
    const out = await this.run(args, body);
    return parsePRInfo(out);
  }

  async getIssue(issueNumber: number, repo?: string): Promise<IssueInfo> {
    const out = await this.run([
      'issue', 'view', String(issueNumber),
      '--json', 'number,title,body,state,labels,author,createdAt,url',
      ...this.repoFlag(repo),
    ]);
    return parseIssueInfo(out);
  }

  async listIssues(state: 'open' | 'closed' | 'all', repo?: string, limit?: number): Promise<IssueInfo[]> {
    const args = [
      'issue', 'list',
      '--json', 'number,title,body,state,labels,author,createdAt,url',
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
      '--body', body,
      '--json', 'number,title,body,state,labels,author,createdAt,url',
      ...this.repoFlag(repo),
    ];
    if (labels && labels.length > 0) {
      args.push('--label', labels.join(','));
    }
    const out = await this.run(args);
    return parseIssueInfo(out);
  }

  async closeIssue(issueNumber: number, repo?: string): Promise<void> {
    await this.run([
      'issue', 'close', String(issueNumber),
      ...this.repoFlag(repo),
    ]);
  }

  async getWorkflow(workflowName: string, repo?: string): Promise<WorkflowInfo> {
    const out = await this.run([
      'run', 'view', workflowName,
      '--json', 'databaseId,name,status,path',
      ...this.repoFlag(repo),
    ]);
    return parseWorkflowInfo(out);
  }

  async listWorkflows(repo?: string): Promise<WorkflowInfo[]> {
    const out = await this.run([
      'workflow', 'list',
      '--json', 'id,name,state,path',
      ...this.repoFlag(repo),
    ]);
    return parseWorkflowList(out);
  }

  async triggerWorkflow(workflowName: string, ref?: string, inputs?: Record<string, string>, repo?: string): Promise<void> {
    const args = [
      'workflow', 'run', workflowName,
      ...this.repoFlag(repo),
    ];
    if (ref) args.push('--ref', ref);
    if (inputs) {
      args.push('--inputs', JSON.stringify(inputs));
    }
    await this.run(args);
  }

  async listBranches(repo?: string, limit?: number): Promise<BranchInfo[]> {
    const args = [
      'repo', 'list', 'branches',
      '--json', 'name,commitSha',
      ...this.repoFlag(repo),
    ];
    if (limit) args.push('--limit', String(limit));
    const out = await this.run(args);
    return parseBranchList(out);
  }

  async createBranch(name: string, baseRef?: string, repo?: string): Promise<void> {
    const args = [
      'repo', 'create', 'branch', name,
      ...this.repoFlag(repo),
    ];
    if (baseRef) args.push('--base', baseRef);
    await this.run(args);
  }

  async getDiff(prNumber: number, repo?: string): Promise<string> {
    return this.reviewPR(prNumber, repo);
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
      '--json', 'path,repo,matches',
      ...this.repoFlag(repo),
    ];
    const out = await this.run(args);
    return parseCodeSearch(out);
  }

  async createComment(prNumber: number, body: string, repo?: string): Promise<CommentInfo> {
    const out = await this.run([
      'pr', 'comment', String(prNumber),
      '--body', body,
      '--json', 'id,author,body,createdAt',
      ...this.repoFlag(repo),
    ]);
    return parseCommentInfo(out);
  }

  async listComments(prNumber: number, repo?: string): Promise<CommentInfo[]> {
    const out = await this.run([
      'pr', 'view', String(prNumber),
      '--comments',
      '--json', 'comments',
      ...this.repoFlag(repo),
    ]);
    return parseCommentList(out);
  }

  async listCommits(prNumber: number, repo?: string): Promise<CommitInfo[]> {
    const out = await this.run([
      'pr', 'view', String(prNumber),
      '--json', 'commits',
      ...this.repoFlag(repo),
    ]);
    return parseCommitList(out);
  }

  async getRepoInfo(repo?: string): Promise<RepoInfo> {
    const out = await this.run([
      'repo', 'view',
      '--json', 'owner,name,description,defaultBranch,stargazerCount,forkCount,openIssueCount,primaryLanguage',
      ...this.repoFlag(repo),
    ]);
    return parseRepoInfo(out);
  }
}

function prFromObject(d: Record<string, unknown>): PRInfo {
  return {
    number: d.number as number,
    title: d.title as string,
    body: (d.body as string) ?? '',
    state: d.state as string,
    head: d.headRefName as string,
    base: d.baseRefName as string,
    author: ((d.author as Record<string, string>)?.login ?? (d.author as Record<string, string>)?.name ?? 'unknown') as string,
    createdAt: d.createdAt as string,
    url: d.url as string,
  };
}

export function parsePRInfo(json: string): PRInfo {
  return prFromObject(JSON.parse(json));
}

export function parsePRList(json: string): PRInfo[] {
  return JSON.parse(json).map(prFromObject);
}

function issueFromObject(d: Record<string, unknown>): IssueInfo {
  return {
    number: d.number as number,
    title: d.title as string,
    body: (d.body as string) ?? '',
    state: d.state as string,
    labels: ((d.labels ?? []) as Array<{ name: string }>).map(l => l.name),
    author: ((d.author as Record<string, string>)?.login ?? (d.author as Record<string, string>)?.name ?? 'unknown') as string,
    createdAt: d.createdAt as string,
    url: d.url as string,
  };
}

export function parseIssueInfo(json: string): IssueInfo {
  return issueFromObject(JSON.parse(json));
}

export function parseIssueList(json: string): IssueInfo[] {
  return JSON.parse(json).map(issueFromObject);
}

export function parseWorkflowInfo(json: string): WorkflowInfo {
  const d = JSON.parse(json);
  return {
    id: d.databaseId ?? d.id,
    name: d.name,
    state: d.status ?? d.state,
    path: d.path,
  };
}

export function parseWorkflowList(json: string): WorkflowInfo[] {
  const arr = JSON.parse(json);
  return arr.map((d: Record<string, unknown>) => ({
    id: (d.id ?? d.databaseId) as number,
    name: d.name as string,
    state: (d.state ?? d.status) as string,
    path: d.path as string,
  }));
}

export function parseBranchList(json: string): BranchInfo[] {
  const arr = JSON.parse(json);
  return arr.map((d: Record<string, unknown>) => ({
    name: d.name as string,
    commitSha: d.commitSha as string,
  }));
}

export function parseCodeSearch(json: string): CodeSearchResult[] {
  const arr = JSON.parse(json);
  return arr.map((d: Record<string, unknown>) => ({
    path: d.path as string,
    repo: d.repo as string,
    matches: (d.matches as Array<{ content: string }>).map(m => m.content),
  }));
}

export function parseCommentInfo(json: string): CommentInfo {
  const d = JSON.parse(json);
  return {
    id: d.id,
    author: d.author?.login ?? d.author?.name ?? 'unknown',
    body: d.body,
    createdAt: d.createdAt,
  };
}

export function parseCommentList(json: string): CommentInfo[] {
  const d = JSON.parse(json);
  return (d.comments ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as number,
    author: ((c.author as Record<string, string>)?.login ?? (c.author as Record<string, string>)?.name ?? 'unknown') as string,
    body: c.body as string,
    createdAt: c.createdAt as string,
  }));
}

export function parseCommitList(json: string): CommitInfo[] {
  const d = JSON.parse(json);
  return (d.commits ?? []).map((c: Record<string, unknown>) => ({
    sha: c.oid as string ?? c.sha as string,
    message: (c.messageHeadline ?? c.message) as string,
    author: ((c.author as Record<string, unknown>)?.name as string) ?? 'unknown',
    date: (c.committedDate ?? c.date) as string,
  }));
}

export function parseRepoInfo(json: string): RepoInfo {
  const d = JSON.parse(json);
  return {
    owner: d.owner?.login ?? d.owner?.name ?? (typeof d.owner === 'string' ? d.owner : ''),
    name: d.name,
    description: d.description ?? '',
    defaultBranch: d.defaultBranch,
    stars: d.stargazerCount ?? 0,
    forks: d.forkCount ?? 0,
    openIssues: d.openIssueCount ?? 0,
    language: d.primaryLanguage?.name ?? d.language ?? '',
  };
}

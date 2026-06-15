import { describe, it, expect } from 'vitest';
import {
  parsePRInfo,
  parsePRList,
  parseIssueInfo,
  parseIssueList,
  parseWorkflowInfo,
  parseWorkflowList,
  parseBranchList,
  parseCodeSearch,
  parseCommentInfo,
  parseCommentList,
  parseCommitList,
  parseRepoInfo,
} from './github-agent.js';

describe('GitHubAgent parsers', () => {
  describe('parsePRInfo', () => {
    it('parses a single PR', () => {
      const json = JSON.stringify({
        number: 42,
        title: 'Add feature',
        body: 'Fixes everything',
        state: 'OPEN',
        headRefName: 'feature-branch',
        baseRefName: 'main',
        author: { login: 'user1' },
        createdAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/owner/repo/pull/42',
      });
      const pr = parsePRInfo(json);
      expect(pr.number).toBe(42);
      expect(pr.title).toBe('Add feature');
      expect(pr.body).toBe('Fixes everything');
      expect(pr.state).toBe('OPEN');
      expect(pr.head).toBe('feature-branch');
      expect(pr.base).toBe('main');
      expect(pr.author).toBe('user1');
      expect(pr.url).toContain('pull/42');
    });

    it('handles missing body', () => {
      const json = JSON.stringify({
        number: 1, title: 'x', state: 'OPEN', headRefName: 'a', baseRefName: 'b',
        author: { login: 'u' }, createdAt: '', url: '',
      });
      expect(parsePRInfo(json).body).toBe('');
    });

    it('handles null author', () => {
      const json = JSON.stringify({
        number: 1, title: 'x', body: '', state: 'OPEN', headRefName: 'a', baseRefName: 'b',
        author: null, createdAt: '', url: '',
      });
      expect(parsePRInfo(json).author).toBe('unknown');
    });
  });

  describe('parsePRList', () => {
    it('parses a list of PRs', () => {
      const json = JSON.stringify([
        { number: 1, title: 'PR1', body: 'b1', state: 'OPEN', headRefName: 'h1', baseRefName: 'b1', author: { login: 'u1' }, createdAt: '', url: '' },
        { number: 2, title: 'PR2', body: 'b2', state: 'CLOSED', headRefName: 'h2', baseRefName: 'b2', author: { login: 'u2' }, createdAt: '', url: '' },
      ]);
      const list = parsePRList(json);
      expect(list).toHaveLength(2);
      expect(list[0]!.number).toBe(1);
      expect(list[1]!.number).toBe(2);
      expect(list[1]!.state).toBe('CLOSED');
    });
  });

  describe('parseIssueInfo', () => {
    it('parses a single issue', () => {
      const json = JSON.stringify({
        number: 10,
        title: 'Bug report',
        body: 'Something broke',
        state: 'OPEN',
        labels: [{ name: 'bug' }, { name: 'critical' }],
        author: { login: 'dev1' },
        createdAt: '2025-03-01T00:00:00Z',
        url: 'https://github.com/owner/repo/issues/10',
      });
      const issue = parseIssueInfo(json);
      expect(issue.number).toBe(10);
      expect(issue.title).toBe('Bug report');
      expect(issue.state).toBe('OPEN');
      expect(issue.labels).toEqual(['bug', 'critical']);
      expect(issue.author).toBe('dev1');
    });

    it('handles missing labels', () => {
      const json = JSON.stringify({
        number: 1, title: 'x', body: '', state: 'OPEN', labels: null,
        author: { login: 'u' }, createdAt: '', url: '',
      });
      expect(parseIssueInfo(json).labels).toEqual([]);
    });
  });

  describe('parseIssueList', () => {
    it('parses a list of issues', () => {
      const json = JSON.stringify([
        { number: 1, title: 'Issue 1', body: '', state: 'OPEN', labels: [], author: { login: 'u1' }, createdAt: '', url: '' },
        { number: 2, title: 'Issue 2', body: '', state: 'CLOSED', labels: [{ name: 'wontfix' }], author: { login: 'u2' }, createdAt: '', url: '' },
      ]);
      const list = parseIssueList(json);
      expect(list).toHaveLength(2);
      expect(list[1]!.labels).toEqual(['wontfix']);
    });
  });

  describe('parseWorkflowInfo', () => {
    it('parses a workflow', () => {
      const json = JSON.stringify({
        databaseId: 100,
        name: 'CI',
        status: 'active',
        path: '.github/workflows/ci.yml',
      });
      const wf = parseWorkflowInfo(json);
      expect(wf.id).toBe(100);
      expect(wf.name).toBe('CI');
      expect(wf.state).toBe('active');
      expect(wf.path).toContain('ci.yml');
    });

    it('falls back to id field when databaseId missing', () => {
      const json = JSON.stringify({ id: 99, name: 'Test', status: 'active', path: 'p' });
      expect(parseWorkflowInfo(json).id).toBe(99);
    });
  });

  describe('parseWorkflowList', () => {
    it('parses workflow list', () => {
      const json = JSON.stringify([
        { id: 1, name: 'CI', state: 'active', path: '.github/workflows/ci.yml' },
        { id: 2, name: 'Deploy', state: 'inactive', path: '.github/workflows/deploy.yml' },
      ]);
      const list = parseWorkflowList(json);
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe('CI');
      expect(list[1]!.state).toBe('inactive');
    });
  });

  describe('parseBranchList', () => {
    it('parses branch list', () => {
      const json = JSON.stringify([
        { name: 'main', commitSha: 'abc123' },
        { name: 'feature', commitSha: 'def456' },
      ]);
      const list = parseBranchList(json);
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe('main');
      expect(list[0]!.commitSha).toBe('abc123');
    });
  });

  describe('parseCodeSearch', () => {
    it('parses code search results', () => {
      const json = JSON.stringify([
        { path: 'src/index.ts', repo: 'owner/repo', matches: [{ content: 'function foo()' }, { content: 'const bar' }] },
      ]);
      const results = parseCodeSearch(json);
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/index.ts');
      expect(results[0]!.repo).toBe('owner/repo');
      expect(results[0]!.matches).toHaveLength(2);
    });
  });

  describe('parseCommentInfo', () => {
    it('parses a comment', () => {
      const json = JSON.stringify({
        id: 555,
        author: { login: 'commenter' },
        body: 'Looks good!',
        createdAt: '2025-06-01T00:00:00Z',
      });
      const comment = parseCommentInfo(json);
      expect(comment.id).toBe(555);
      expect(comment.author).toBe('commenter');
      expect(comment.body).toBe('Looks good!');
    });
  });

  describe('parseCommentList', () => {
    it('parses comment list from pr view', () => {
      const json = JSON.stringify({
        comments: [
          { id: 1, author: { login: 'u1' }, body: 'First', createdAt: '' },
          { id: 2, author: { login: 'u2' }, body: 'Second', createdAt: '' },
        ],
      });
      const list = parseCommentList(json);
      expect(list).toHaveLength(2);
      expect(list[0]!.author).toBe('u1');
    });

    it('handles empty comments', () => {
      expect(parseCommentList(JSON.stringify({}))).toEqual([]);
    });
  });

  describe('parseCommitList', () => {
    it('parses commit list from pr view', () => {
      const json = JSON.stringify({
        commits: [
          { oid: 'abc', messageHeadline: 'Initial commit', author: { name: 'dev' }, committedDate: '2025-01-01' },
        ],
      });
      const list = parseCommitList(json);
      expect(list).toHaveLength(1);
      expect(list[0]!.sha).toBe('abc');
      expect(list[0]!.message).toBe('Initial commit');
      expect(list[0]!.author).toBe('dev');
    });

    it('handles empty commits', () => {
      expect(parseCommitList(JSON.stringify({}))).toEqual([]);
    });
  });

  describe('parseRepoInfo', () => {
    it('parses repository info', () => {
      const json = JSON.stringify({
        owner: { login: 'myorg' },
        name: 'myrepo',
        description: 'A great repo',
        defaultBranch: 'main',
        stargazerCount: 100,
        forkCount: 20,
        openIssueCount: 5,
        primaryLanguage: { name: 'TypeScript' },
      });
      const info = parseRepoInfo(json);
      expect(info.owner).toBe('myorg');
      expect(info.name).toBe('myrepo');
      expect(info.description).toBe('A great repo');
      expect(info.defaultBranch).toBe('main');
      expect(info.stars).toBe(100);
      expect(info.forks).toBe(20);
      expect(info.openIssues).toBe(5);
      expect(info.language).toBe('TypeScript');
    });

    it('handles string owner', () => {
      const json = JSON.stringify({
        owner: 'myorg', name: 'r', description: '', defaultBranch: 'main',
        stargazerCount: 0, forkCount: 0, openIssueCount: 0, primaryLanguage: null,
      });
      expect(parseRepoInfo(json).owner).toBe('myorg');
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON', () => {
      expect(() => parsePRInfo('not json')).toThrow();
    });
  });
});

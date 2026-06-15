import { describe, it, expect } from 'vitest';
import {
  parseMRInfo,
  parseMRList,
  parseIssueInfo,
  parseIssueList,
  parseCodeSearch,
  parseRepoInfo,
} from './gitlab-agent.js';

describe('GitLabAgent parsers', () => {
  describe('parseMRInfo', () => {
    it('parses a single MR', () => {
      const json = JSON.stringify({
        iid: 7,
        title: 'Add GitLab support',
        description: 'Implements GitLab agent',
        state: 'opened',
        sourceBranch: 'feature-gitlab',
        targetBranch: 'main',
        author: { username: 'gitlabber' },
        createdAt: '2025-02-01T00:00:00Z',
        webUrl: 'https://gitlab.com/owner/repo/-/merge_requests/7',
        mergeStatus: 'can_be_merged',
      });
      const mr = parseMRInfo(json);
      expect(mr.number).toBe(7);
      expect(mr.title).toBe('Add GitLab support');
      expect(mr.body).toBe('Implements GitLab agent');
      expect(mr.state).toBe('opened');
      expect(mr.sourceBranch).toBe('feature-gitlab');
      expect(mr.targetBranch).toBe('main');
      expect(mr.author).toBe('gitlabber');
      expect(mr.url).toContain('merge_requests/7');
      expect(mr.mergeStatus).toBe('can_be_merged');
    });

    it('handles missing description', () => {
      const json = JSON.stringify({
        iid: 1, title: 'x', state: 'opened', sourceBranch: 'a', targetBranch: 'b',
        author: { username: 'u' }, createdAt: '', webUrl: '', mergeStatus: '',
      });
      expect(parseMRInfo(json).body).toBe('');
    });

    it('handles null author', () => {
      const json = JSON.stringify({
        iid: 1, title: 'x', description: '', state: 'opened', sourceBranch: 'a', targetBranch: 'b',
        author: null, createdAt: '', webUrl: '', mergeStatus: '',
      });
      expect(parseMRInfo(json).author).toBe('unknown');
    });
  });

  describe('parseMRList', () => {
    it('parses a list of MRs', () => {
      const json = JSON.stringify([
        { iid: 1, title: 'MR1', description: '', state: 'opened', sourceBranch: 's1', targetBranch: 't1', author: { username: 'u1' }, createdAt: '', webUrl: '', mergeStatus: 'checked' },
        { iid: 2, title: 'MR2', description: '', state: 'merged', sourceBranch: 's2', targetBranch: 't2', author: { username: 'u2' }, createdAt: '', webUrl: '', mergeStatus: 'merged' },
      ]);
      const list = parseMRList(json);
      expect(list).toHaveLength(2);
      expect(list[0]!.number).toBe(1);
      expect(list[1]!.number).toBe(2);
      expect(list[1]!.state).toBe('merged');
    });
  });

  describe('parseIssueInfo', () => {
    it('parses a single issue', () => {
      const json = JSON.stringify({
        iid: 20,
        title: 'GitLab bug',
        description: 'Something broke in GitLab',
        state: 'opened',
        labels: [{ title: 'bug' }, { title: 'priority' }],
        author: { username: 'reporter' },
        createdAt: '2025-04-01T00:00:00Z',
        webUrl: 'https://gitlab.com/owner/repo/-/issues/20',
      });
      const issue = parseIssueInfo(json);
      expect(issue.number).toBe(20);
      expect(issue.title).toBe('GitLab bug');
      expect(issue.state).toBe('opened');
      expect(issue.labels).toEqual(['bug', 'priority']);
      expect(issue.author).toBe('reporter');
    });

    it('handles labels with name field', () => {
      const json = JSON.stringify({
        iid: 1, title: 'x', description: '', state: 'opened',
        labels: [{ name: 'bug' }], author: { username: 'u' }, createdAt: '', webUrl: '',
      });
      expect(parseIssueInfo(json).labels).toEqual(['bug']);
    });

    it('handles missing labels', () => {
      const json = JSON.stringify({
        iid: 1, title: 'x', description: '', state: 'opened', labels: null,
        author: { username: 'u' }, createdAt: '', webUrl: '',
      });
      expect(parseIssueInfo(json).labels).toEqual([]);
    });
  });

  describe('parseIssueList', () => {
    it('parses a list of issues', () => {
      const json = JSON.stringify([
        { iid: 1, title: 'Issue 1', description: '', state: 'opened', labels: [], author: { username: 'u1' }, createdAt: '', webUrl: '' },
        { iid: 2, title: 'Issue 2', description: '', state: 'closed', labels: [{ title: 'wontfix' }], author: { username: 'u2' }, createdAt: '', webUrl: '' },
      ]);
      const list = parseIssueList(json);
      expect(list).toHaveLength(2);
      expect(list[1]!.labels).toEqual(['wontfix']);
    });
  });

  describe('parseCodeSearch', () => {
    it('parses code search results', () => {
      const json = JSON.stringify([
        { path: 'src/lib.ts', repo: 'owner/repo', matches: [{ content: 'export class' }] },
      ]);
      const results = parseCodeSearch(json);
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/lib.ts');
      expect(results[0]!.repo).toBe('owner/repo');
      expect(results[0]!.matches).toHaveLength(1);
    });

    it('handles empty results', () => {
      expect(parseCodeSearch(JSON.stringify([]))).toEqual([]);
    });

    it('handles non-array input', () => {
      expect(parseCodeSearch(JSON.stringify({}))).toEqual([]);
    });
  });

  describe('parseRepoInfo', () => {
    it('parses repository info', () => {
      const json = JSON.stringify({
        owner: { username: 'gitlab-org' },
        name: 'myproject',
        description: 'A GitLab project',
        defaultBranch: 'master',
        starCount: 50,
        forkCount: 10,
        openIssueCount: 3,
        primaryLanguage: 'Go',
      });
      const info = parseRepoInfo(json);
      expect(info.owner).toBe('gitlab-org');
      expect(info.name).toBe('myproject');
      expect(info.description).toBe('A GitLab project');
      expect(info.defaultBranch).toBe('master');
      expect(info.stars).toBe(50);
      expect(info.forks).toBe(10);
      expect(info.openIssues).toBe(3);
      expect(info.language).toBe('Go');
    });

    it('handles string owner', () => {
      const json = JSON.stringify({
        owner: 'gitlab-org', name: 'r', description: '', defaultBranch: 'main',
        starCount: 0, forkCount: 0, openIssueCount: 0, primaryLanguage: null,
      });
      expect(parseRepoInfo(json).owner).toBe('gitlab-org');
    });

    it('handles null primaryLanguage', () => {
      const json = JSON.stringify({
        owner: { username: 'o' }, name: 'r', description: '', defaultBranch: 'main',
        starCount: 0, forkCount: 0, openIssueCount: 0, primaryLanguage: null,
      });
      expect(parseRepoInfo(json).language).toBe('');
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON', () => {
      expect(() => parseMRInfo('not json')).toThrow();
    });
  });
});

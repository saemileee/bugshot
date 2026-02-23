import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
vi.mock('../auth', () => ({
  getCredentials: vi.fn(() => Promise.resolve({
    siteUrl: 'test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token',
  })),
  buildBasicAuth: vi.fn(() => 'dGVzdDp0b2tlbg=='),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Jira API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchIssues', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          issues: [
            {
              key: 'TEST-123',
              fields: {
                summary: 'Test issue',
                issuetype: { name: 'Bug' },
                status: { name: 'Open' },
              },
            },
          ],
        }),
      });
    });

    it('should search by text in summary', async () => {
      const { searchIssues } = await import('../api');
      await searchIssues('TEST', 'button');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;

      // Should use text search with wildcard
      expect(url).toContain('summary');
      expect(url).toContain('button');
    });

    it('should search by exact key when query looks like issue key', async () => {
      const { searchIssues } = await import('../api');
      await searchIssues('TEST', 'TEST-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;

      // Should use key = search
      expect(url).toContain('key');
      expect(url).toContain('TEST-123');
    });

    it('should search by project-prefixed key when query is just a number', async () => {
      const { searchIssues } = await import('../api');
      await searchIssues('PROJ', '456');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;

      // Should prepend project key
      expect(url).toContain('PROJ-456');
    });

    it('should escape JQL special characters in text search', async () => {
      const { searchIssues } = await import('../api');
      await searchIssues('TEST', 'test[bracket]');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;

      // Special chars should be escaped
      expect(url).toContain('%5C%5B'); // \[ encoded
      expect(url).toContain('%5C%5D'); // \] encoded
    });

    it('should return mapped search results', async () => {
      const { searchIssues } = await import('../api');
      const results = await searchIssues('TEST', 'test');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        key: 'TEST-123',
        summary: 'Test issue',
        issueType: 'Bug',
        status: 'Open',
      });
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ issues: [] }),
      });

      const { searchIssues } = await import('../api');
      const results = await searchIssues('TEST', 'nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('createIssue', () => {
    it('should create issue with correct payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '10001', key: 'TEST-1', self: 'url' }),
      });

      const { createIssue } = await import('../api');
      const result = await createIssue({
        projectKey: 'TEST',
        summary: 'Test summary',
        description: { type: 'doc', content: [] },
        issueType: 'Bug',
      });

      expect(result.key).toBe('TEST-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/3/issue'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"summary":"Test summary"'),
        })
      );
    });

    it('should include parent key when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '10002', key: 'TEST-2', self: 'url' }),
      });

      const { createIssue } = await import('../api');
      await createIssue({
        projectKey: 'TEST',
        summary: 'Sub-task',
        description: { type: 'doc', content: [] },
        issueType: 'Sub-task',
        parentKey: 'TEST-1',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"parent":{"key":"TEST-1"}'),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const { searchIssues } = await import('../api');

      await expect(searchIssues('TEST', 'query')).rejects.toThrow('Jira API 401');
    });
  });
});

import { getCredentials, buildBasicAuth } from './auth';
import { withRetry } from '@/shared/utils/retry';
import type { JiraIssuePayload, JiraIssueResponse, JiraAttachment } from '@/shared/types/jira-ticket';

async function getBaseUrl(): Promise<string> {
  const creds = await getCredentials();
  return `https://${creds.siteUrl}`;
}

async function getAuthHeader(): Promise<string> {
  const creds = await getCredentials();
  return `Basic ${buildBasicAuth(creds.email, creds.apiToken)}`;
}

async function jiraFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const baseUrl = await getBaseUrl();
  const auth = await getAuthHeader();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API ${response.status}: ${body}`);
  }

  return response;
}

export async function createIssue(
  payload: JiraIssuePayload,
): Promise<JiraIssueResponse> {
  return withRetry(async () => {
    const response = await jiraFetch('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: payload.projectKey },
          issuetype: { name: payload.issueType || 'Task' },
          summary: payload.summary,
          description: payload.description,
          ...(payload.parentKey ? { parent: { key: payload.parentKey } } : {}),
        },
      }),
    });

    return response.json() as Promise<JiraIssueResponse>;
  });
}

export async function addAttachment(
  issueIdOrKey: string,
  file: Blob,
  filename: string,
): Promise<JiraAttachment[]> {
  return withRetry(async () => {
    const baseUrl = await getBaseUrl();
    const auth = await getAuthHeader();

    const formData = new FormData();
    formData.append('file', file, filename);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueIdOrKey}/attachments`,
      {
        method: 'POST',
        headers: {
          Authorization: auth,
          'X-Atlassian-Token': 'no-check',
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Attachment upload ${response.status}: ${body}`);
    }

    return response.json() as Promise<JiraAttachment[]>;
  }, { maxRetries: 2 });
}

/**
 * Update issue description using REST API v2 with wiki markup.
 * Wiki markup `!filename.png|thumbnail!` renders attached images inline — no media UUID needed.
 */
export async function updateIssueDescriptionWiki(
  issueIdOrKey: string,
  wikiMarkup: string,
): Promise<void> {
  await jiraFetch(`/rest/api/2/issue/${issueIdOrKey}`, {
    method: 'PUT',
    body: JSON.stringify({ fields: { description: wikiMarkup } }),
  });
}

// ── Fetch helpers for dynamic settings ──

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  iconUrl?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: { key: string; name: string };
}

export interface JiraEpic {
  key: string;
  summary: string;
  status: string;
}

export async function fetchProjects(): Promise<JiraProject[]> {
  const response = await jiraFetch('/rest/api/3/project/search?maxResults=100&orderBy=name');
  const data = await response.json();
  return (data.values || []).map((p: Record<string, unknown>) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    avatarUrls: p.avatarUrls,
  }));
}

export async function fetchIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
  const response = await jiraFetch(`/rest/api/3/project/${projectKey}`);
  const data = await response.json();
  return (data.issueTypes || []).map((t: Record<string, unknown>) => ({
    id: t.id,
    name: t.name,
    subtask: t.subtask,
    iconUrl: t.iconUrl,
  }));
}

export async function fetchStatuses(projectKey: string): Promise<JiraStatus[]> {
  const response = await jiraFetch(`/rest/api/3/project/${projectKey}/statuses`);
  const data = await response.json();
  // data is an array of { issueType, statuses[] } — flatten and dedupe
  const seen = new Set<string>();
  const statuses: JiraStatus[] = [];
  for (const group of data) {
    for (const s of group.statuses || []) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        statuses.push({
          id: s.id,
          name: s.name,
          statusCategory: s.statusCategory,
        });
      }
    }
  }
  return statuses;
}

export async function fetchEpics(projectKey: string): Promise<JiraEpic[]> {
  const jql = encodeURIComponent(
    `project = "${projectKey}" AND issuetype = Epic AND statusCategory != Done ORDER BY updated DESC`,
  );
  const response = await jiraFetch(
    `/rest/api/3/search?jql=${jql}&maxResults=50&fields=summary,status`,
  );
  const data = await response.json();
  return (data.issues || []).map((i: Record<string, unknown>) => {
    const fields = i.fields as Record<string, unknown>;
    const status = fields.status as Record<string, unknown> | undefined;
    return {
      key: i.key,
      summary: (fields.summary as string) || '',
      status: (status?.name as string) || '',
    };
  });
}

export interface JiraSearchResult {
  key: string;
  summary: string;
  issueType: string;
  status: string;
}

export async function searchIssues(
  projectKey: string,
  query: string,
): Promise<JiraSearchResult[]> {
  const escaped = query.replace(/"/g, '\\"');
  const jql = encodeURIComponent(
    `project = "${projectKey}" AND (summary ~ "${escaped}" OR key = "${escaped}") ORDER BY updated DESC`,
  );
  const response = await jiraFetch(
    `/rest/api/3/search?jql=${jql}&maxResults=20&fields=summary,status,issuetype`,
  );
  const data = await response.json();
  return (data.issues || []).map((i: Record<string, unknown>) => {
    const fields = i.fields as Record<string, unknown>;
    const status = fields.status as Record<string, unknown> | undefined;
    const type = fields.issuetype as Record<string, unknown> | undefined;
    return {
      key: i.key as string,
      summary: (fields.summary as string) || '',
      issueType: (type?.name as string) || '',
      status: (status?.name as string) || '',
    };
  });
}

export async function linkIssueToEpic(
  issueKey: string,
  epicKey: string,
): Promise<void> {
  try {
    await jiraFetch('/rest/api/3/issueLink', {
      method: 'POST',
      body: JSON.stringify({
        type: { name: 'Epic-Story Link' },
        inwardIssue: { key: epicKey },
        outwardIssue: { key: issueKey },
      }),
    });
  } catch {
    console.warn('Issue link failed, epic may already be set via parent field');
  }
}

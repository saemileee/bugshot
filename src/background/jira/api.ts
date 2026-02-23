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
    // Build the fields object
    const fields: Record<string, unknown> = {
      project: { key: payload.projectKey },
      issuetype: { name: payload.issueType || 'Task' },
      summary: payload.summary,
      description: payload.description,
    };

    // Handle assignee
    if (payload.assigneeId) {
      fields.assignee = { accountId: payload.assigneeId };
    }

    // Handle priority
    if (payload.priorityId) {
      fields.priority = { id: payload.priorityId };
    }

    // Handle parent for subtasks (non-epic parents)
    if (payload.parentKey) {
      fields.parent = { key: payload.parentKey };
    }

    const response = await jiraFetch('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
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

/**
 * Link an issue to an epic after creation.
 * This is more reliable than setting epic during creation.
 */
export async function linkIssueToEpic(
  issueKey: string,
  epicKey: string,
  projectKey: string,
): Promise<void> {
  // Try Epic Link custom field first (company-managed projects)
  const epicLinkFieldId = await getEpicLinkFieldId(projectKey);

  if (epicLinkFieldId) {
    await jiraFetch(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: { [epicLinkFieldId]: epicKey } }),
    });
  } else {
    // Fallback to parent field (team-managed projects)
    await jiraFetch(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: { parent: { key: epicKey } } }),
    });
  }
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
  try {
    const jql = encodeURIComponent(
      `project = "${projectKey}" AND issuetype = Epic AND statusCategory != Done ORDER BY updated DESC`,
    );
    console.log('[Jira] Fetching epics for project:', projectKey);
    const response = await jiraFetch(
      `/rest/api/3/search?jql=${jql}&maxResults=50&fields=summary,status`,
    );
    const data = await response.json();
    console.log('[Jira] Epics response:', data.issues?.length || 0, 'epics found');
    return (data.issues || []).map((i: Record<string, unknown>) => {
      const fields = i.fields as Record<string, unknown>;
      const status = fields.status as Record<string, unknown> | undefined;
      return {
        key: i.key,
        summary: (fields.summary as string) || '',
        status: (status?.name as string) || '',
      };
    });
  } catch (err) {
    console.error('[Jira] Failed to fetch epics:', err);
    return [];
  }
}

export interface JiraSearchResult {
  key: string;
  summary: string;
  issueType: string;
  status: string;
}

/**
 * Get the Epic Link custom field ID for a project.
 * In company-managed projects, Epic linking uses a custom field (usually customfield_10014).
 * Returns null if not found or in team-managed projects.
 */
export async function getEpicLinkFieldId(projectKey: string): Promise<string | null> {
  try {
    const response = await jiraFetch(
      `/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`,
    );
    const data = await response.json();

    // Search through all issue types for Epic Link field
    for (const project of data.projects || []) {
      for (const issueType of project.issuetypes || []) {
        const fields = issueType.fields || {};
        for (const [fieldId, fieldDef] of Object.entries(fields)) {
          const def = fieldDef as Record<string, unknown>;
          // Epic Link field has specific schema
          if (
            def.name === 'Epic Link' ||
            def.name === '에픽 링크' ||
            (def.schema as Record<string, unknown>)?.custom === 'com.pyxis.greenhopper.jira:gh-epic-link'
          ) {
            return fieldId;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Jira] Failed to get Epic Link field:', err);
  }
  return null;
}

/**
 * Get the issue type of a specific issue.
 */
export async function getIssueType(issueKey: string): Promise<string | null> {
  try {
    const response = await jiraFetch(
      `/rest/api/3/issue/${issueKey}?fields=issuetype`,
    );
    const data = await response.json();
    return (data.fields?.issuetype?.name as string) || null;
  } catch (err) {
    console.warn('[Jira] Failed to get issue type:', err);
    return null;
  }
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

/**
 * Fetch assignable users for a project.
 */
export async function fetchAssignableUsers(projectKey: string): Promise<JiraUser[]> {
  try {
    const response = await jiraFetch(
      `/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=50`,
    );
    const data = await response.json();
    return (data || []).map((u: Record<string, unknown>) => ({
      accountId: u.accountId as string,
      displayName: u.displayName as string,
      avatarUrl: (u.avatarUrls as Record<string, string>)?.['24x24'],
    }));
  } catch (err) {
    console.warn('[Jira] Failed to fetch assignable users:', err);
    return [];
  }
}

/**
 * Fetch available priorities.
 */
export async function fetchPriorities(): Promise<JiraPriority[]> {
  try {
    const response = await jiraFetch('/rest/api/3/priority');
    const data = await response.json();
    return (data || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      iconUrl: p.iconUrl as string | undefined,
    }));
  } catch (err) {
    console.warn('[Jira] Failed to fetch priorities:', err);
    return [];
  }
}

export async function searchIssues(
  projectKey: string,
  query: string,
): Promise<JiraSearchResult[]> {
  // Escape JQL reserved characters for text search
  const escapedForText = query
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[[\](){}+\-&|!^~*?:]/g, '\\$&');

  // Check if query looks like a Jira key (e.g., "PROJ-123" or "123")
  const keyPattern = /^([A-Z]+-)?(\d+)$/i;
  const keyMatch = query.trim().match(keyPattern);

  let jqlCondition: string;
  if (keyMatch) {
    // If it's a key pattern, search by key contains
    const keySearch = keyMatch[1] ? query.trim().toUpperCase() : `${projectKey}-${keyMatch[2]}`;
    jqlCondition = `project = "${projectKey}" AND key = "${keySearch}"`;
  } else {
    // Text search in summary with wildcard
    jqlCondition = `project = "${projectKey}" AND summary ~ "${escapedForText}*"`;
  }

  const jql = encodeURIComponent(`${jqlCondition} ORDER BY updated DESC`);
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


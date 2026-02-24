import { getCredentials, buildBasicAuth } from './auth';
import { withRetry, HttpError } from '@/shared/utils/retry';
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
    throw new HttpError(`Jira API ${response.status}: ${body}`, response.status, body);
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
      throw new HttpError(`Attachment upload ${response.status}: ${body}`, response.status, body);
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
 * Tries multiple methods: Epic Link field, parent field, then issue link.
 */
export async function linkIssueToEpic(
  issueKey: string,
  epicKey: string,
  projectKey: string,
): Promise<void> {
  // Method 1: Try Epic Link custom field (company-managed projects)
  const epicLinkFieldId = await getEpicLinkFieldId(projectKey);

  if (epicLinkFieldId) {
    try {
      await jiraFetch(`/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        body: JSON.stringify({ fields: { [epicLinkFieldId]: epicKey } }),
      });
      console.log('[Jira] Linked via Epic Link field');
      return;
    } catch (err) {
      console.warn('[Jira] Epic Link field failed, trying parent field:', err);
    }
  }

  // Method 2: Try parent field (team-managed projects)
  try {
    await jiraFetch(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: { parent: { key: epicKey } } }),
    });
    console.log('[Jira] Linked via parent field');
    return;
  } catch (err) {
    console.warn('[Jira] Parent field failed, trying issue link:', err);
  }

  // Method 3: Try issue link (relates to)
  try {
    await jiraFetch('/rest/api/3/issueLink', {
      method: 'POST',
      body: JSON.stringify({
        type: { name: 'Relates' },
        inwardIssue: { key: issueKey },
        outwardIssue: { key: epicKey },
      }),
    });
    console.log('[Jira] Linked via issue link (Relates)');
    return;
  } catch (err) {
    // Try alternative link type names
    const linkTypes = ['relates to', 'Epic-Story Link', 'is child of'];
    for (const linkType of linkTypes) {
      try {
        await jiraFetch('/rest/api/3/issueLink', {
          method: 'POST',
          body: JSON.stringify({
            type: { name: linkType },
            inwardIssue: { key: issueKey },
            outwardIssue: { key: epicKey },
          }),
        });
        console.log(`[Jira] Linked via issue link (${linkType})`);
        return;
      } catch {
        // Try next type
      }
    }
    console.error('[Jira] All epic linking methods failed');
    throw new Error('Failed to link issue to epic');
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
  if (!projectKey) {
    console.warn('[Jira] fetchEpics called without projectKey');
    return [];
  }

  try {
    // First, find the Epic issue type for this project
    const issueTypes = await fetchIssueTypes(projectKey);
    const epicType = issueTypes.find(
      (t) => t.name.toLowerCase() === 'epic' ||
             t.name === '에픽' ||
             t.name.toLowerCase().includes('epic')
    );

    console.log('[Jira] Project issue types:', issueTypes.map(t => t.name));
    console.log('[Jira] Found epic type:', epicType);

    let jql: string;
    if (epicType) {
      // Use issue type ID for more reliable matching
      jql = `project = "${projectKey}" AND issuetype = ${epicType.id} AND statusCategory != Done ORDER BY updated DESC`;
    } else {
      // Fallback: try to find issues that can be parents (hierarchyLevel = 1 for epics in next-gen)
      console.warn('[Jira] No Epic type found, trying parent-capable issues');
      jql = `project = "${projectKey}" AND hierarchyLevel = 1 AND statusCategory != Done ORDER BY updated DESC`;
    }

    console.log('[Jira] Fetching epics with JQL:', jql);
    const response = await jiraFetch(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,issuetype`,
    );
    const data = await response.json();
    console.log('[Jira] Epics raw response:', JSON.stringify(data).slice(0, 500));

    if (data.issues?.length > 0) {
      console.log('[Jira] Found', data.issues.length, 'epics');
      return data.issues.map((i: Record<string, unknown>) => {
        const fields = i.fields as Record<string, unknown>;
        const status = fields.status as Record<string, unknown> | undefined;
        return {
          key: i.key as string,
          summary: (fields.summary as string) || '',
          status: (status?.name as string) || '',
        };
      });
    }

    // If hierarchyLevel didn't work, try without it
    if (!epicType) {
      console.log('[Jira] Trying fallback: all non-subtask issues');
      const fallbackJql = `project = "${projectKey}" AND issuetype != subtask AND statusCategory != Done ORDER BY updated DESC`;
      const fallbackResponse = await jiraFetch(
        `/rest/api/3/search?jql=${encodeURIComponent(fallbackJql)}&maxResults=30&fields=summary,status,issuetype`,
      );
      const fallbackData = await fallbackResponse.json();

      // Filter to only show issues that look like epics (have "epic" in type name or are hierarchy level 1)
      const potentialEpics = (fallbackData.issues || []).filter((i: Record<string, unknown>) => {
        const fields = i.fields as Record<string, unknown>;
        const issueType = fields.issuetype as Record<string, unknown> | undefined;
        const typeName = (issueType?.name as string) || '';
        const hierarchyLevel = issueType?.hierarchyLevel as number | undefined;
        return typeName.toLowerCase().includes('epic') || hierarchyLevel === 1;
      });

      console.log('[Jira] Fallback found', potentialEpics.length, 'potential epics');
      return potentialEpics.map((i: Record<string, unknown>) => {
        const fields = i.fields as Record<string, unknown>;
        const status = fields.status as Record<string, unknown> | undefined;
        return {
          key: i.key as string,
          summary: (fields.summary as string) || '',
          status: (status?.name as string) || '',
        };
      });
    }

    return [];
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

const MAX_SEARCH_QUERY_LENGTH = 200;

export async function searchIssues(
  projectKey: string,
  query: string,
): Promise<JiraSearchResult[]> {
  // Input validation
  if (!projectKey || projectKey.trim().length === 0) {
    console.warn('[Jira] searchIssues called without projectKey');
    return [];
  }

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Truncate extremely long queries to prevent performance issues
  let sanitizedQuery = query.trim();
  if (sanitizedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    sanitizedQuery = sanitizedQuery.substring(0, MAX_SEARCH_QUERY_LENGTH);
  }

  // Escape JQL reserved characters for text search
  const escapedForText = sanitizedQuery
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[[\](){}+\-&|!^~*?:]/g, '\\$&');

  // Check if query looks like a Jira key (e.g., "PROJ-123" or "123")
  const keyPattern = /^([A-Z]+-)?(\d+)$/i;
  const keyMatch = sanitizedQuery.match(keyPattern);

  let jqlCondition: string;
  if (keyMatch) {
    // If it's a key pattern, search by key contains
    const keySearch = keyMatch[1] ? sanitizedQuery.toUpperCase() : `${projectKey}-${keyMatch[2]}`;
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


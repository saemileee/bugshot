import { getValidAccessToken } from './auth';
import { JIRA_API_BASE, STORAGE_KEYS } from '@/shared/constants';
import { withRetry } from '@/shared/utils/retry';
import type { JiraIssuePayload, JiraIssueResponse, JiraAttachment } from '@/shared/types/jira-ticket';

async function getCloudId(): Promise<string> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.JIRA_CLOUD_ID);
  const cloudId = result[STORAGE_KEYS.JIRA_CLOUD_ID];
  if (!cloudId) throw new Error('Jira cloud ID not found. Please reconnect.');
  return cloudId;
}

async function jiraFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getValidAccessToken();
  const cloudId = await getCloudId();

  const response = await fetch(`${JIRA_API_BASE}/${cloudId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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
          labels: payload.labels || ['design-qa'],
          ...(payload.epicKey ? { parent: { key: payload.epicKey } } : {}),
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
    const token = await getValidAccessToken();
    const cloudId = await getCloudId();

    const formData = new FormData();
    formData.append('file', file, filename);

    const response = await fetch(
      `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueIdOrKey}/attachments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
    // Epic-Story Link may not exist in this project config
    console.warn('Issue link failed, epic may already be set via parent field');
  }
}

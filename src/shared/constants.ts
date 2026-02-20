// Atlassian OAuth
export const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const JIRA_ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
export const JIRA_API_BASE = 'https://api.atlassian.com/ex/jira';

// Client ID from environment (build-time injection)
export const JIRA_CLIENT_ID = import.meta.env.VITE_JIRA_CLIENT_ID as string;

// Storage keys
export const STORAGE_KEYS = {
  JIRA_TOKENS: 'jiraTokens',
  JIRA_CLOUD_ID: 'jiraCloudId',
  JIRA_CLOUD_NAME: 'jiraCloudName',
  JIRA_CLOUD_URL: 'jiraCloudUrl',
  EPIC_CONFIG: 'epicConfig',
  TRACKED_PROPERTIES: 'trackedProperties',
  RECENT_SUBMISSIONS: 'recentSubmissions',
  BATCH_CHANGES: 'batchChanges',
} as const;

// Default CSS properties to track (design-relevant)
export const DEFAULT_TRACKED_PROPERTIES = [
  'font-size', 'font-weight', 'font-family', 'line-height',
  'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
  'color', 'background-color', 'background',
  'border', 'border-radius', 'border-color', 'border-width',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'gap', 'row-gap', 'column-gap',
  'opacity', 'box-shadow', 'display', 'flex-direction', 'align-items', 'justify-content',
];

// Jira defaults
export const DEFAULT_ISSUE_TYPE = 'Task';
export const DEFAULT_LABELS = ['design-qa'];
export const TICKET_PREFIX = '[Design QA]';

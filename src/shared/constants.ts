// Storage keys
export const STORAGE_KEYS = {
  // API Token auth
  JIRA_CREDENTIALS: 'jiraCredentials', // { email, apiToken, siteUrl }
  // Project config
  EPIC_CONFIG: 'epicConfig',
  TRACKED_PROPERTIES: 'trackedProperties',
  RECENT_SUBMISSIONS: 'recentSubmissions',
  BATCH_CHANGES: 'batchChanges',
  INTEGRATIONS: 'integrations',
  // Widget visibility toggle
  WIDGET_VISIBLE: 'widgetVisible',
  // Widget layout (panel size/position, toolbar position)
  WIDGET_LAYOUT: 'widgetLayout',
  // Title prefix
  TITLE_PREFIX: 'titlePrefix',
  // Jira submit options (assignee, priority)
  JIRA_SUBMIT_OPTIONS: 'jiraSubmitOptions',
} as const;

// Jira defaults
export const TICKET_PREFIX = '[BugShot]';

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
export const TICKET_PREFIX = '[BugShot]';

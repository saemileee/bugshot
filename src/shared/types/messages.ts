import type { CSSChange } from './css-change';
import type { IntegrationId, IntegrationResult, SubmissionPayload } from './integration';

export type ExtensionMessage =
  // Screenshot (Content Script <-> Service Worker)
  | { type: 'CAPTURE_SCREENSHOT'; tabId: number }
  | { type: 'SCREENSHOT_CAPTURED'; dataUrl: string }

  // Video Recording
  | { type: 'START_RECORDING'; tabId: number }
  | { type: 'STOP_RECORDING' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'RECORDING_STOPPED' }
  | { type: 'RECORDING_ERROR'; error: string }
  | { type: 'RECORDING_COMPLETE'; recordingId: string; dataUrl?: string; size?: number }

  // Jira Submission (legacy, still supported)
  | { type: 'SUBMIT_TO_JIRA'; payload: JiraSubmissionPayload }
  | { type: 'JIRA_SUBMIT_RESULT'; success: boolean; issueKey?: string; error?: string }

  // Multi-Integration Submission
  | { type: 'SUBMIT_TO_INTEGRATIONS'; payload: SubmissionPayload }
  | { type: 'INTEGRATION_RESULTS'; results: IntegrationResult[] }

  // Auth (API Token) — Jira legacy
  | { type: 'SAVE_JIRA_CREDENTIALS'; email: string; apiToken: string; siteUrl: string }
  | { type: 'JIRA_CREDENTIALS_RESULT'; success: boolean; displayName?: string; error?: string }
  | { type: 'CHECK_AUTH_STATUS' }
  | { type: 'AUTH_STATUS'; authenticated: boolean; siteUrl?: string }
  | { type: 'DISCONNECT_JIRA' }
  | { type: 'DISCONNECT_RESULT'; success: boolean }

  // Integration config
  | { type: 'SAVE_INTEGRATION_CONFIG'; integrationId: IntegrationId; credentials: Record<string, string>; settings: Record<string, string> }
  | { type: 'INTEGRATION_CONFIG_RESULT'; integrationId: IntegrationId; success: boolean; displayName?: string; error?: string }
  | { type: 'CHECK_INTEGRATION_STATUS'; integrationId: IntegrationId }
  | { type: 'INTEGRATION_STATUS'; integrationId: IntegrationId; connected: boolean; displayName?: string }
  | { type: 'DISCONNECT_INTEGRATION'; integrationId: IntegrationId }
  | { type: 'GET_ALL_INTEGRATIONS' }
  | { type: 'ALL_INTEGRATIONS_STATUS'; integrations: Array<{ id: IntegrationId; enabled: boolean; connected: boolean; displayName?: string }> }

  // Jira data fetch
  | { type: 'FETCH_JIRA_PROJECTS' }
  | { type: 'FETCH_JIRA_ISSUE_TYPES'; projectKey: string }
  | { type: 'FETCH_JIRA_STATUSES'; projectKey: string }
  | { type: 'FETCH_JIRA_EPICS'; projectKey: string }
  | { type: 'SEARCH_JIRA_ISSUES'; projectKey: string; query: string }
  | { type: 'FETCH_JIRA_ASSIGNEES'; projectKey: string }
  | { type: 'FETCH_JIRA_PRIORITIES' }

  // CDP CSS inspection
  | { type: 'GET_ELEMENT_STYLES'; selector: string }
  | { type: 'ELEMENT_STYLES_RESULT'; success: boolean; styles?: CDPStyleResult; error?: string };

// CDP CSS result structure
export interface CDPStyleRule {
  selector: string;
  source: string;
  properties: Array<{
    name: string;
    value: string;
    important: boolean;
  }>;
}

export interface CDPStyleResult {
  inlineStyles: Array<{ name: string; value: string }>;
  matchedRules: CDPStyleRule[];
}

export interface JiraSubmissionPayload {
  changes: CSSChange[];
  summary?: string;
  manualNotes?: string;
  screenshots: Array<{ dataUrl: string; filename: string }>;
  videoRecordingId?: string;
  pageUrl: string;
  pageTitle: string;
}

import type { CSSChange } from './css-change';

export type ExtensionMessage =
  // CSS Tracking (DevTools Panel <-> Service Worker)
  | { type: 'INIT_CSS_TRACKING'; tabId: number }
  | { type: 'STOP_CSS_TRACKING'; tabId: number }
  | { type: 'CSS_TRACKING_READY' }
  | { type: 'INLINE_STYLE_CHANGED'; selector: string; oldValue: string; newValue: string; url: string; timestamp: number }

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

  // Jira Submission
  | { type: 'SUBMIT_TO_JIRA'; payload: JiraSubmissionPayload }
  | { type: 'JIRA_SUBMIT_RESULT'; success: boolean; issueKey?: string; error?: string }

  // Change Sync (DevTools Panel <-> Content Script via Service Worker)
  | { type: 'SYNC_CHANGES'; changes: CSSChange[] }
  | { type: 'REQUEST_CHANGES' }

  // Element inspection (Content Script -> DevTools Panel via Service Worker)
  | { type: 'INSPECT_ELEMENT'; selector: string }

  // Auth (API Token)
  | { type: 'SAVE_JIRA_CREDENTIALS'; email: string; apiToken: string; siteUrl: string }
  | { type: 'JIRA_CREDENTIALS_RESULT'; success: boolean; displayName?: string; error?: string }
  | { type: 'CHECK_AUTH_STATUS' }
  | { type: 'AUTH_STATUS'; authenticated: boolean; siteUrl?: string }
  | { type: 'DISCONNECT_JIRA' }
  | { type: 'DISCONNECT_RESULT'; success: boolean }

  // Jira data fetch
  | { type: 'FETCH_JIRA_PROJECTS' }
  | { type: 'FETCH_JIRA_ISSUE_TYPES'; projectKey: string }
  | { type: 'FETCH_JIRA_STATUSES'; projectKey: string }
  | { type: 'FETCH_JIRA_EPICS'; projectKey: string }
  | { type: 'SEARCH_JIRA_ISSUES'; projectKey: string; query: string };

export interface JiraSubmissionPayload {
  changes: CSSChange[];
  summary?: string;
  manualNotes?: string;
  screenshots: Array<{ dataUrl: string; filename: string }>;
  videoRecordingId?: string;
  pageUrl: string;
  pageTitle: string;
}

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
  | { type: 'RECORDING_COMPLETE'; recordingId: string }

  // Jira Submission
  | { type: 'SUBMIT_TO_JIRA'; payload: JiraSubmissionPayload }
  | { type: 'JIRA_SUBMIT_RESULT'; success: boolean; issueKey?: string; error?: string }

  // Change Sync (DevTools Panel <-> Content Script via Service Worker)
  | { type: 'SYNC_CHANGES'; changes: CSSChange[] }
  | { type: 'REQUEST_CHANGES' }

  // Element inspection (Content Script -> DevTools Panel via Service Worker)
  | { type: 'INSPECT_ELEMENT'; selector: string }

  // Auth
  | { type: 'INITIATE_AUTH' }
  | { type: 'AUTH_RESULT'; success: boolean; cloudName?: string }
  | { type: 'CHECK_AUTH_STATUS' }
  | { type: 'AUTH_STATUS'; authenticated: boolean; cloudName?: string }
  | { type: 'AUTH_STATUS_CHANGED'; isAuthenticated: boolean }

  // Epic Config
  | { type: 'SET_EPIC_CONFIG'; epicKey: string; projectKey: string }
  | { type: 'GET_EPIC_CONFIG' }
  | { type: 'EPIC_CONFIG'; epicKey: string; projectKey: string };

export interface JiraSubmissionPayload {
  changes: CSSChange[];
  manualNotes?: string;
  screenshots: Array<{ dataUrl: string; filename: string }>;
  videoRecordingId?: string;
  pageUrl: string;
  pageTitle: string;
}

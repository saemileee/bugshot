import type { CSSChange } from './css-change';

export type IntegrationId = 'jira' | 'github' | 'n8n';

export interface IntegrationConfig {
  id: IntegrationId;
  enabled: boolean;
  credentials: Record<string, string>;
  settings: Record<string, string>;
}

export interface IntegrationResult {
  integrationId: IntegrationId;
  success: boolean;
  url?: string;
  issueKey?: string;
  error?: string;
}

export interface JiraSubmitOptions {
  assigneeId?: string;
  priorityId?: string;
}

export interface GithubSubmitOptions {
  labels?: string[];
  assignees?: string[];
}

export interface SubmissionPayload {
  changes: CSSChange[];
  summary: string;
  manualNotes?: string;
  screenshots: Array<{ dataUrl: string; filename: string }>;
  videoRecordingId?: string;
  pageUrl: string;
  pageTitle: string;
  // Integration-specific options
  jiraOptions?: JiraSubmitOptions;
  githubOptions?: GithubSubmitOptions;
}

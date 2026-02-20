export interface EpicConfig {
  epicKey: string;
  projectKey: string;
  issueType: string;
  defaultLabels: string[];
}

export interface JiraIssuePayload {
  projectKey: string;
  issueType: string;
  summary: string;
  description: object; // ADF format
  labels: string[];
  epicKey?: string;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}

export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

export interface EpicConfig {
  projectKey: string;
  projectName?: string;
  issueType: string;
  parentKey?: string;       // epic key or parent issue key (for sub-tasks)
  parentSummary?: string;
}

export interface JiraIssuePayload {
  projectKey: string;
  issueType: string;
  summary: string;
  description: object; // ADF format
  parentKey?: string;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  /** Media API file UUID — required for ADF mediaSingle inline images */
  mediaApiFileId?: string;
}

export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

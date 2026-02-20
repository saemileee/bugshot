import type { IntegrationConfig, IntegrationResult, SubmissionPayload } from '@/shared/types/integration';
import type { ChangeSet } from '@/shared/types/css-change';
import { saveAndVerify, isAuthenticated, logout, getCredentials } from '../jira/auth';
import {
  createIssue,
  addAttachment,
  updateIssueDescriptionWiki,
} from '../jira/api';
import { getRecordingBlob } from '../recording/manager';
import { STORAGE_KEYS } from '@/shared/constants';
import { generateSummary, buildFullDescription, buildWikiMarkupDescription } from '@/shared/utils/jira-formatter';
import { dataUrlToBlob } from '@/shared/utils/screenshot-utils';

export async function verifyJira(
  config: IntegrationConfig,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  const { email, apiToken, siteUrl } = config.credentials;
  if (!email || !apiToken || !siteUrl) {
    return { success: false, error: 'Email, API token, and site URL are required' };
  }
  return saveAndVerify(email, apiToken, siteUrl);
}

export async function checkJiraStatus(): Promise<{ connected: boolean; displayName?: string }> {
  const connected = await isAuthenticated();
  if (connected) {
    const creds = await getCredentials();
    return { connected: true, displayName: creds.siteUrl };
  }
  return { connected: false };
}

export async function disconnectJira(): Promise<void> {
  await logout();
}

export async function submitToJira(
  config: IntegrationConfig,
  payload: SubmissionPayload,
): Promise<IntegrationResult> {
  const projectKey = config.settings.projectKey;
  if (!projectKey) {
    return { integrationId: 'jira', success: false, error: 'No project key configured' };
  }

  try {
    const changeSet: ChangeSet = {
      id: crypto.randomUUID(),
      pageUrl: payload.pageUrl,
      pageTitle: payload.pageTitle,
      changes: payload.changes,
      manualNotes: payload.manualNotes || '',
      createdAt: Date.now(),
    };

    console.log('[Jira] Submission start:', {
      changes: payload.changes.length,
      screenshots: payload.screenshots.length,
      screenshotFiles: payload.screenshots.map((s) => s.filename),
      videoRecordingId: payload.videoRecordingId ?? '(none)',
    });

    // Collect all filenames
    const allFilenames = payload.screenshots.map((s) => s.filename);
    let videoFilename: string | undefined;
    if (payload.videoRecordingId) {
      videoFilename = `recording-${Date.now()}.webm`;
      allFilenames.push(videoFilename);
    }

    // Phase 1: Create issue with ADF description (fallback)
    const summary = payload.summary || generateSummary(changeSet);
    const description = buildFullDescription(changeSet, allFilenames);

    const issue = await createIssue({
      projectKey,
      issueType: config.settings.issueType || 'Task',
      summary,
      description,
      parentKey: config.settings.parentKey || undefined,
    });
    console.log('[Jira] Issue created:', issue.key);

    // Phase 2: Upload attachments
    let uploadedCount = 0;
    for (const screenshot of payload.screenshots) {
      try {
        const blob = dataUrlToBlob(screenshot.dataUrl);
        await addAttachment(issue.key, blob, screenshot.filename);
        uploadedCount++;
        console.log('[Jira] Attached:', screenshot.filename);
      } catch (err) {
        console.warn('[Jira] Failed to attach', screenshot.filename, err);
      }
    }

    if (payload.videoRecordingId && videoFilename) {
      try {
        const videoBlob = await getRecordingBlob(payload.videoRecordingId);
        if (videoBlob) {
          await addAttachment(issue.key, videoBlob, videoFilename);
          uploadedCount++;
          console.log('[Jira] Video attached:', videoFilename);
        }
      } catch (err) {
        console.warn('[Jira] Video attach failed:', err);
      }
    }

    // Phase 3: Update with wiki markup for inline images
    if (uploadedCount > 0) {
      try {
        const wikiDescription = buildWikiMarkupDescription(changeSet, allFilenames);
        await updateIssueDescriptionWiki(issue.key, wikiDescription);
        console.log('[Jira] Description updated with wiki markup');
      } catch (err) {
        console.warn('[Jira] Wiki description update failed:', err);
      }
    }

    // Save to recent
    const recentResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS);
    const recent: Array<{ key: string; summary: string; createdAt: number }> =
      recentResult[STORAGE_KEYS.RECENT_SUBMISSIONS] || [];
    recent.unshift({ key: issue.key, summary, createdAt: Date.now() });
    await chrome.storage.local.set({
      [STORAGE_KEYS.RECENT_SUBMISSIONS]: recent.slice(0, 20),
    });

    const siteUrl = config.credentials.siteUrl?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return {
      integrationId: 'jira',
      success: true,
      issueKey: issue.key,
      url: siteUrl ? `https://${siteUrl}/browse/${issue.key}` : undefined,
    };
  } catch (error) {
    return {
      integrationId: 'jira',
      success: false,
      error: (error as Error).message,
    };
  }
}

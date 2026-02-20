import type { ExtensionMessage, JiraSubmissionPayload } from '@/shared/types/messages';
import { initiateJiraAuth, isAuthenticated } from '../jira/auth';
import { createIssue, addAttachment } from '../jira/api';
import { startRecording, stopRecording, getRecordingBlob } from '../recording/manager';
import { STORAGE_KEYS } from '@/shared/constants';
import { formatSingleChange, formatBatchedChanges, generateSummary } from '@/shared/utils/jira-formatter';
import { dataUrlToBlob } from '@/shared/utils/screenshot-utils';
import type { EpicConfig } from '@/shared/types/jira-ticket';
import type { ChangeSet } from '@/shared/types/css-change';

// Port registries keyed by tabId
const devtoolsPorts = new Map<number, chrome.runtime.Port>();
const contentPorts = new Map<number, chrome.runtime.Port>();

export function initializeMessagingHub() {
  chrome.runtime.onConnect.addListener((port) => {
    switch (port.name) {
      case 'devtools-panel':
        handleDevToolsPort(port);
        break;
      case 'content-widget':
        handleContentPort(port);
        break;
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleOneShotMessage(message as ExtensionMessage, sender, sendResponse);
    return true; // async response
  });
}

function handleDevToolsPort(port: chrome.runtime.Port) {
  port.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'INIT_CSS_TRACKING') {
      devtoolsPorts.set(message.tabId, port);
    }

    if (message.type === 'SYNC_CHANGES') {
      // Forward changes to content script widget for the same tab
      for (const [tabId, p] of devtoolsPorts) {
        if (p === port) {
          contentPorts.get(tabId)?.postMessage(message);
          break;
        }
      }
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [tabId, p] of devtoolsPorts) {
      if (p === port) {
        devtoolsPorts.delete(tabId);
        break;
      }
    }
  });
}

function handleContentPort(port: chrome.runtime.Port) {
  const tabId = port.sender?.tab?.id;
  if (tabId === undefined) return;
  contentPorts.set(tabId, port);

  port.onMessage.addListener(async (message: ExtensionMessage) => {
    switch (message.type) {
      case 'CAPTURE_SCREENSHOT': {
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab({
            format: 'png',
            quality: 100,
          });
          port.postMessage({ type: 'SCREENSHOT_CAPTURED', dataUrl });
        } catch (error) {
          console.error('Screenshot capture failed:', error);
        }
        break;
      }

      case 'REQUEST_CHANGES': {
        devtoolsPorts.get(tabId)?.postMessage(message);
        break;
      }

      case 'INSPECT_ELEMENT': {
        devtoolsPorts.get(tabId)?.postMessage(message);
        break;
      }

      case 'SUBMIT_TO_JIRA': {
        try {
          const result = await handleJiraSubmission(message.payload);
          port.postMessage({
            type: 'JIRA_SUBMIT_RESULT',
            success: true,
            issueKey: result.key,
          });
        } catch (error) {
          port.postMessage({
            type: 'JIRA_SUBMIT_RESULT',
            success: false,
            error: (error as Error).message,
          });
        }
        break;
      }

      case 'START_RECORDING': {
        try {
          await startRecording(message.tabId || tabId);
          port.postMessage({ type: 'RECORDING_COMPLETE', recordingId: '__started__' });
        } catch (error) {
          console.error('Recording start failed:', error);
        }
        break;
      }

      case 'STOP_RECORDING': {
        await stopRecording();
        break;
      }
    }
  });

  // Listen for recording completion from offscreen document
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'recording-complete' && msg.target === 'service-worker') {
      port.postMessage({
        type: 'RECORDING_COMPLETE',
        recordingId: msg.recordingId,
      });
    }
  });

  port.onDisconnect.addListener(() => {
    contentPorts.delete(tabId);
  });
}

function handleOneShotMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) {
  switch (message.type) {
    case 'INITIATE_AUTH': {
      initiateJiraAuth().then((success) => {
        if (success) {
          chrome.storage.sync.get(STORAGE_KEYS.JIRA_CLOUD_NAME, (result) => {
            sendResponse({
              type: 'AUTH_RESULT',
              success: true,
              cloudName: result[STORAGE_KEYS.JIRA_CLOUD_NAME],
            });
          });
        } else {
          sendResponse({ type: 'AUTH_RESULT', success: false });
        }
      });
      break;
    }

    case 'CHECK_AUTH_STATUS': {
      isAuthenticated().then((authenticated) => {
        if (authenticated) {
          chrome.storage.sync.get(STORAGE_KEYS.JIRA_CLOUD_NAME, (result) => {
            sendResponse({
              type: 'AUTH_STATUS',
              authenticated: true,
              cloudName: result[STORAGE_KEYS.JIRA_CLOUD_NAME],
            });
          });
        } else {
          sendResponse({ type: 'AUTH_STATUS', authenticated: false });
        }
      });
      break;
    }

    case 'SUBMIT_TO_JIRA': {
      handleJiraSubmission(message.payload).then((result) => {
        sendResponse({
          type: 'JIRA_SUBMIT_RESULT',
          success: true,
          issueKey: result.key,
        });
      }).catch((error) => {
        sendResponse({
          type: 'JIRA_SUBMIT_RESULT',
          success: false,
          error: (error as Error).message,
        });
      });
      break;
    }

    case 'START_RECORDING': {
      const resolvedTabId = message.tabId || _sender.tab?.id || 0;
      startRecording(resolvedTabId).then(() => {
        sendResponse({ type: 'RECORDING_COMPLETE', recordingId: '__started__' });
      }).catch((error) => {
        console.error('Recording start failed:', error);
        sendResponse({ type: 'RECORDING_COMPLETE', recordingId: '__error__' });
      });
      break;
    }

    case 'STOP_RECORDING': {
      stopRecording().then(() => {
        sendResponse({ type: 'RECORDING_COMPLETE', recordingId: '__stopped__' });
      });
      break;
    }
  }
}

async function handleJiraSubmission(
  payload: JiraSubmissionPayload,
): Promise<{ key: string }> {
  const epicConfigResult = await chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG);
  const epicConfig: EpicConfig | undefined = epicConfigResult[STORAGE_KEYS.EPIC_CONFIG];

  // --- DRY RUN MODE: no project key configured ---
  if (!epicConfig?.projectKey) {
    return handleDryRunSubmission(payload);
  }

  const changeSet: ChangeSet = {
    id: crypto.randomUUID(),
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    changes: payload.changes,
    manualNotes: payload.manualNotes || '',
    createdAt: Date.now(),
  };

  const description =
    payload.changes.length <= 1 && payload.changes[0]
      ? formatSingleChange(payload.changes[0])
      : formatBatchedChanges(changeSet);

  const summary = generateSummary(changeSet);

  const issue = await createIssue({
    projectKey: epicConfig.projectKey,
    issueType: epicConfig.issueType || 'Task',
    summary,
    description,
    labels: epicConfig.defaultLabels || ['design-qa'],
    epicKey: epicConfig.epicKey || undefined,
  });

  // Upload screenshots as attachments
  for (const screenshot of payload.screenshots) {
    const blob = dataUrlToBlob(screenshot.dataUrl);
    await addAttachment(issue.key, blob, screenshot.filename);
  }

  // Upload video recording if present
  if (payload.videoRecordingId) {
    try {
      const videoBlob = await getRecordingBlob(payload.videoRecordingId);
      if (videoBlob) {
        await addAttachment(issue.key, videoBlob, `recording-${Date.now()}.webm`);
      }
    } catch (err) {
      console.warn('Failed to attach video recording:', err);
    }
  }

  // Save to recent submissions
  const recentResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS);
  const recent: Array<{ key: string; summary: string; createdAt: number }> =
    recentResult[STORAGE_KEYS.RECENT_SUBMISSIONS] || [];
  recent.unshift({ key: issue.key, summary, createdAt: Date.now() });
  await chrome.storage.local.set({
    [STORAGE_KEYS.RECENT_SUBMISSIONS]: recent.slice(0, 20),
  });

  return issue;
}

/**
 * Dry-run mode: simulates Jira submission when no project key is configured.
 * Logs the full payload to the service worker console so you can inspect it.
 */
async function handleDryRunSubmission(
  payload: JiraSubmissionPayload,
): Promise<{ key: string }> {
  const changeSet: ChangeSet = {
    id: crypto.randomUUID(),
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    changes: payload.changes,
    manualNotes: payload.manualNotes || '',
    createdAt: Date.now(),
  };

  const description =
    payload.changes.length <= 1 && payload.changes[0]
      ? formatSingleChange(payload.changes[0])
      : formatBatchedChanges(changeSet);

  const summary = generateSummary(changeSet);
  const fakeKey = `DRYRUN-${Date.now().toString(36).toUpperCase()}`;

  console.log(
    '%c[DRY RUN] Jira issue would be created:',
    'color: #f59e0b; font-weight: bold;',
  );
  console.log('Summary:', summary);
  console.log('Description (ADF):', JSON.stringify(description, null, 2));
  console.log('Screenshots:', payload.screenshots.length);
  console.log('Changes:', payload.changes);
  console.log('Manual notes:', payload.manualNotes);
  console.log('Page:', payload.pageUrl);

  // Save to recent submissions even in dry-run
  const recentResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS);
  const recent: Array<{ key: string; summary: string; createdAt: number }> =
    recentResult[STORAGE_KEYS.RECENT_SUBMISSIONS] || [];
  recent.unshift({ key: fakeKey, summary, createdAt: Date.now() });
  await chrome.storage.local.set({
    [STORAGE_KEYS.RECENT_SUBMISSIONS]: recent.slice(0, 20),
  });

  return { key: fakeKey };
}

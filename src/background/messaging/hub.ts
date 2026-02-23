import type { ExtensionMessage, JiraSubmissionPayload, CDPStyleResult, CDPStyleRule } from '@/shared/types/messages';
import { saveAndVerify, isAuthenticated, logout, getCredentials } from '../jira/auth';
import {
  createIssue,
  addAttachment,
  updateIssueDescriptionWiki,
  fetchProjects,
  fetchIssueTypes,
  fetchStatuses,
  fetchEpics,
  searchIssues,
} from '../jira/api';
import { startRecording, stopRecording, getRecordingBlob } from '../recording/manager';
import { STORAGE_KEYS } from '@/shared/constants';
import { generateSummary, buildFullDescription, buildWikiMarkupDescription } from '@/shared/utils/jira-formatter';
import { dataUrlToBlob } from '@/shared/utils/screenshot-utils';
import type { EpicConfig } from '@/shared/types/jira-ticket';
import type { ChangeSet } from '@/shared/types/css-change';
import {
  submitToAll,
  verifyIntegration,
  saveIntegrationConfig,
  checkIntegrationStatus,
  disconnectIntegration,
  getAllIntegrationStatuses,
} from '../integrations/registry';

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
    // Route recording completion from offscreen → content port
    if (message.type === 'recording-complete' && message.target === 'service-worker') {
      for (const [, port] of contentPorts) {
        port.postMessage({
          type: 'RECORDING_COMPLETE',
          recordingId: message.recordingId,
          dataUrl: message.dataUrl,
          size: message.size,
        });
      }
      return false;
    }

    // Route recording error from offscreen → content port
    if (message.type === 'recording-error' && message.target === 'service-worker') {
      for (const [, port] of contentPorts) {
        port.postMessage({
          type: 'RECORDING_ERROR',
          error: message.error || 'Recording failed',
        });
      }
      return false;
    }

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

      case 'SUBMIT_TO_INTEGRATIONS': {
        try {
          const results = await submitToAll(message.payload);
          port.postMessage({ type: 'INTEGRATION_RESULTS', results });
        } catch (error) {
          port.postMessage({
            type: 'INTEGRATION_RESULTS',
            results: [{ integrationId: 'jira', success: false, error: (error as Error).message }],
          });
        }
        break;
      }

      case 'START_RECORDING': {
        try {
          await startRecording(message.tabId || tabId);
          port.postMessage({ type: 'RECORDING_STARTED' });
        } catch (error) {
          port.postMessage({ type: 'RECORDING_ERROR', error: (error as Error).message });
        }
        break;
      }

      case 'STOP_RECORDING': {
        try {
          await stopRecording();
          port.postMessage({ type: 'RECORDING_STOPPED' });
        } catch (error) {
          console.error('Stop recording failed:', error);
          port.postMessage({ type: 'RECORDING_ERROR', error: (error as Error).message });
        }
        break;
      }

      case 'GET_ELEMENT_STYLES': {
        try {
          const styles = await getElementStylesViaCDP(tabId, message.selector);
          port.postMessage({ type: 'ELEMENT_STYLES_RESULT', success: true, styles });
        } catch (error) {
          console.error('CDP CSS fetch failed:', error);
          port.postMessage({
            type: 'ELEMENT_STYLES_RESULT',
            success: false,
            error: (error as Error).message,
          });
        }
        break;
      }
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
    case 'SAVE_JIRA_CREDENTIALS': {
      saveAndVerify(message.email, message.apiToken, message.siteUrl).then((result) => {
        if (result.success) {
          sendResponse({
            type: 'JIRA_CREDENTIALS_RESULT',
            success: true,
            displayName: result.displayName,
          });
        } else {
          sendResponse({
            type: 'JIRA_CREDENTIALS_RESULT',
            success: false,
            error: result.error,
          });
        }
      });
      break;
    }

    case 'CHECK_AUTH_STATUS': {
      isAuthenticated().then(async (authenticated) => {
        if (authenticated) {
          const creds = await getCredentials();
          sendResponse({
            type: 'AUTH_STATUS',
            authenticated: true,
            siteUrl: creds.siteUrl,
          });
        } else {
          sendResponse({ type: 'AUTH_STATUS', authenticated: false });
        }
      });
      break;
    }

    case 'DISCONNECT_JIRA': {
      logout().then(() => {
        sendResponse({ type: 'DISCONNECT_RESULT', success: true });
      });
      break;
    }

    case 'FETCH_JIRA_PROJECTS': {
      fetchProjects()
        .then((projects) => sendResponse({ success: true, data: projects }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      break;
    }

    case 'FETCH_JIRA_ISSUE_TYPES': {
      fetchIssueTypes(message.projectKey)
        .then((types) => sendResponse({ success: true, data: types }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      break;
    }

    case 'FETCH_JIRA_STATUSES': {
      fetchStatuses(message.projectKey)
        .then((statuses) => sendResponse({ success: true, data: statuses }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      break;
    }

    case 'FETCH_JIRA_EPICS': {
      fetchEpics(message.projectKey)
        .then((epics) => sendResponse({ success: true, data: epics }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      break;
    }

    case 'SEARCH_JIRA_ISSUES': {
      searchIssues(message.projectKey, message.query)
        .then((issues) => sendResponse({ success: true, data: issues }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
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

    case 'SUBMIT_TO_INTEGRATIONS': {
      submitToAll(message.payload).then((results) => {
        sendResponse({ type: 'INTEGRATION_RESULTS', results });
      }).catch((error) => {
        sendResponse({
          type: 'INTEGRATION_RESULTS',
          results: [{ integrationId: 'jira', success: false, error: (error as Error).message }],
        });
      });
      break;
    }

    // ── Integration config messages ──

    case 'SAVE_INTEGRATION_CONFIG': {
      const cfg = {
        id: message.integrationId,
        enabled: true,
        credentials: message.credentials,
        settings: message.settings,
      };
      verifyIntegration(cfg).then(async (result) => {
        if (result.success) {
          await saveIntegrationConfig(cfg);
          sendResponse({
            type: 'INTEGRATION_CONFIG_RESULT',
            integrationId: message.integrationId,
            success: true,
            displayName: result.displayName,
          });
        } else {
          sendResponse({
            type: 'INTEGRATION_CONFIG_RESULT',
            integrationId: message.integrationId,
            success: false,
            error: result.error,
          });
        }
      });
      break;
    }

    case 'CHECK_INTEGRATION_STATUS': {
      checkIntegrationStatus(message.integrationId).then((status) => {
        sendResponse({
          type: 'INTEGRATION_STATUS',
          integrationId: message.integrationId,
          connected: status.connected,
          displayName: status.displayName,
        });
      });
      break;
    }

    case 'DISCONNECT_INTEGRATION': {
      disconnectIntegration(message.integrationId).then(() => {
        sendResponse({ success: true });
      });
      break;
    }

    case 'GET_ALL_INTEGRATIONS': {
      getAllIntegrationStatuses().then((integrations) => {
        sendResponse({ type: 'ALL_INTEGRATIONS_STATUS', integrations });
      });
      break;
    }

    case 'START_RECORDING': {
      const resolvedTabId = message.tabId || _sender.tab?.id || 0;
      startRecording(resolvedTabId).then(() => {
        sendResponse({ type: 'RECORDING_STARTED' });
      }).catch((error) => {
        console.error('Recording start failed:', error);
        sendResponse({ type: 'RECORDING_ERROR', error: (error as Error).message });
      });
      break;
    }

    case 'STOP_RECORDING': {
      stopRecording().then(() => {
        sendResponse({ type: 'RECORDING_STOPPED' });
      }).catch((error) => {
        console.error('Stop recording failed:', error);
        sendResponse({ type: 'RECORDING_ERROR', error: (error as Error).message });
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

  // ── Diagnostic logging ──
  console.log('[Jira] Submission start:', {
    changes: payload.changes.length,
    screenshots: payload.screenshots.length,
    screenshotFiles: payload.screenshots.map((s) => s.filename),
    videoRecordingId: payload.videoRecordingId ?? '(none)',
    manualNotes: payload.manualNotes ? `${payload.manualNotes.length} chars` : '(none)',
  });

  // Collect all filenames that will be attached (known before upload)
  const allFilenames = payload.screenshots.map((s) => s.filename);
  let videoFilename: string | undefined;
  if (payload.videoRecordingId) {
    videoFilename = `recording-${Date.now()}.webm`;
    allFilenames.push(videoFilename);
  }

  // Phase 1: Create issue with comprehensive ADF description (fallback if Phase 3 fails)
  const summary = payload.summary || generateSummary(changeSet);
  const description = buildFullDescription(changeSet, allFilenames);

  const issue = await createIssue({
    projectKey: epicConfig.projectKey,
    issueType: epicConfig.issueType || 'Task',
    summary,
    description,
    parentKey: epicConfig.parentKey || undefined,
  });
  console.log('[Jira] Issue created:', issue.key);

  // Phase 2: Upload all attachments
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
    console.log('[Jira] Fetching video blob for:', payload.videoRecordingId);
    try {
      const videoBlob = await getRecordingBlob(payload.videoRecordingId);
      if (videoBlob) {
        console.log('[Jira] Video blob size:', videoBlob.size);
        await addAttachment(issue.key, videoBlob, videoFilename);
        uploadedCount++;
        console.log('[Jira] Video attached:', videoFilename);
      } else {
        console.log('[Jira] getRecordingBlob returned null');
      }
    } catch (err) {
      console.warn('[Jira] Video attach failed:', err);
    }
  } else {
    console.log('[Jira] No video to upload (recordingId:', payload.videoRecordingId, ')');
  }

  // Phase 3: Update description with wiki markup (v2 API) for inline images
  if (uploadedCount > 0) {
    try {
      const wikiDescription = buildWikiMarkupDescription(changeSet, allFilenames);
      await updateIssueDescriptionWiki(issue.key, wikiDescription);
      console.log('[Jira] Description updated with wiki markup (inline images)');
    } catch (err) {
      console.warn('[Jira] Wiki description update failed:', err);
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

  const allFilenames = payload.screenshots.map((s) => s.filename);
  const description = buildFullDescription(changeSet, allFilenames);
  const summary = payload.summary || generateSummary(changeSet);
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

/**
 * Get element styles via Chrome DevTools Protocol (CDP)
 * This provides accurate CSS information including shorthand properties
 */
async function getElementStylesViaCDP(tabId: number, selector: string): Promise<CDPStyleResult> {
  const target = { tabId };

  // Attach debugger
  await chrome.debugger.attach(target, '1.3');

  try {
    // Enable CSS domain
    await chrome.debugger.sendCommand(target, 'CSS.enable');
    await chrome.debugger.sendCommand(target, 'DOM.enable');

    // Get document root
    const docResult = await chrome.debugger.sendCommand(target, 'DOM.getDocument') as {
      root: { nodeId: number };
    };

    // Find element by selector
    const queryResult = await chrome.debugger.sendCommand(target, 'DOM.querySelector', {
      nodeId: docResult.root.nodeId,
      selector,
    }) as { nodeId: number };

    if (!queryResult.nodeId) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Get matched styles
    const stylesResult = await chrome.debugger.sendCommand(target, 'CSS.getMatchedStylesForNode', {
      nodeId: queryResult.nodeId,
    }) as {
      inlineStyle?: {
        cssProperties: Array<{ name: string; value: string; disabled?: boolean }>;
      };
      matchedCSSRules?: Array<{
        rule: {
          selectorList: { text: string };
          origin: string;
          style: {
            cssProperties: Array<{ name: string; value: string; important?: boolean; disabled?: boolean }>;
          };
          styleSheetId?: string;
        };
      }>;
    };

    // Parse inline styles
    const inlineStyles: Array<{ name: string; value: string }> = [];
    if (stylesResult.inlineStyle?.cssProperties) {
      for (const prop of stylesResult.inlineStyle.cssProperties) {
        if (!prop.disabled && prop.value) {
          inlineStyles.push({ name: prop.name, value: prop.value });
        }
      }
    }

    // Parse matched rules
    const matchedRules: CDPStyleRule[] = [];
    if (stylesResult.matchedCSSRules) {
      for (const match of stylesResult.matchedCSSRules) {
        const rule = match.rule;
        // Skip user-agent styles
        if (rule.origin === 'user-agent') continue;

        const properties: Array<{ name: string; value: string; important: boolean }> = [];
        for (const prop of rule.style.cssProperties) {
          if (!prop.disabled && prop.value) {
            properties.push({
              name: prop.name,
              value: prop.value,
              important: prop.important ?? false,
            });
          }
        }

        if (properties.length > 0) {
          matchedRules.push({
            selector: rule.selectorList.text,
            source: rule.origin === 'regular' ? 'stylesheet' : rule.origin,
            properties,
          });
        }
      }
    }

    return { inlineStyles, matchedRules };
  } finally {
    // Always detach debugger
    try {
      await chrome.debugger.detach(target);
    } catch {
      // Ignore detach errors
    }
  }
}

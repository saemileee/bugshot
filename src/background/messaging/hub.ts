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
  fetchAssignableUsers,
  fetchPriorities,
} from '../jira/api';
import { startRecording, stopRecording, getRecordingBlob, getRecordingStatus, resetRecordingState } from '../recording/manager';
import { startKeepAlive, stopKeepAlive } from '../service-worker';
import { STORAGE_KEYS } from '@/shared/constants';
import { generateSummary, buildFullDescription, buildWikiMarkupDescription } from '@/shared/utils/jira-formatter';
import { dataUrlToBlob } from '@/shared/utils/screenshot-utils';
import { jiraLogger } from '@/shared/utils/logger';
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

// Port registry keyed by tabId (for content scripts)
const contentPorts = new Map<number, chrome.runtime.Port>();

// Side panel ports (no tabId, registered separately)
const sidePanelPorts = new Set<chrome.runtime.Port>();

// CDP session cache to reduce attach/detach frequency
interface CDPSession {
  tabId: number;
  attached: boolean;
  lastUsed: number;
  detachTimer?: number;
}
const cdpSessions = new Map<number, CDPSession>();
const CDP_SESSION_TIMEOUT = 30000; // 30 seconds


// Guard to prevent duplicate listener registration
let hubInitialized = false;

/**
 * Check if side panel is currently open (has connected ports)
 */
export function isSidePanelOpen(): boolean {
  return sidePanelPorts.size > 0;
}

/**
 * Clean up CDP session for a specific tab (called on tab close)
 */
export function cleanupCDPSession(tabId: number) {
  const session = cdpSessions.get(tabId);
  if (session) {
    if (session.detachTimer) {
      clearTimeout(session.detachTimer);
    }
    // Try to detach (may already be detached if tab is closing)
    chrome.debugger.detach({ tabId }).catch((error) => {
      // Expected to fail if tab is already gone
      console.warn('[CDP] Detach failed for tab', tabId, '(expected if tab closed):', error);
    });
    cdpSessions.delete(tabId);
  }
}

export function initializeMessagingHub() {
  if (hubInitialized) return;
  hubInitialized = true;

  chrome.runtime.onConnect.addListener((port) => {
    console.log('[Hub] onConnect:', port.name, 'sender:', port.sender?.url);
    if (port.name === 'content-widget') {
      // Check if this is from a tab (content script) or side panel
      const tabId = port.sender?.tab?.id;
      console.log('[Hub] content-widget port, tabId:', tabId);
      if (tabId !== undefined) {
        handleContentPort(port);
      } else {
        // Side panel connection (no tab ID)
        handleSidePanelPort(port);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Helper to broadcast to all ports (content + side panel)
    const broadcastToAll = (msg: unknown) => {
      for (const [, port] of contentPorts) {
        port.postMessage(msg);
      }
      for (const port of sidePanelPorts) {
        port.postMessage(msg);
      }
    };

    // Route recording completion from offscreen → all ports
    if (message.type === 'recording-complete' && message.target === 'service-worker') {
      broadcastToAll({
        type: 'RECORDING_COMPLETE',
        recordingId: message.recordingId,
        dataUrl: message.dataUrl,
        size: message.size,
        mimeType: message.mimeType,
      });
      return false;
    }

    // Route recording error from offscreen → all ports
    if (message.type === 'recording-error' && message.target === 'service-worker') {
      broadcastToAll({
        type: 'RECORDING_ERROR',
        error: message.error || 'Recording failed',
      });
      return false;
    }

    // Route conversion progress from offscreen → all ports
    if (message.type === 'conversion-progress' && message.target === 'service-worker') {
      broadcastToAll({
        type: 'CONVERSION_PROGRESS',
        stage: message.stage,
        progress: message.progress,
        message: message.message,
      });
      return false;
    }

    // Side panel bridge messages from content script
    if (message.type === 'SIDEPANEL_ELEMENT_PICKED') {
      console.log('[Hub] SIDEPANEL_ELEMENT_PICKED received, sidePanelPorts count:', sidePanelPorts.size);
      // Forward all element info to side panel ports
      for (const port of sidePanelPorts) {
        console.log('[Hub] Forwarding ELEMENT_PICKED to side panel port');
        port.postMessage({
          type: 'ELEMENT_PICKED',
          cssChange: message.cssChange,
          className: message.className,
          textContent: message.textContent,
          cdpSelector: message.cdpSelector,
          computedStyles: message.computedStyles,
          cdpStyles: message.cdpStyles,
          pageTokens: message.pageTokens,
          screenshotBefore: message.screenshotBefore,
        });
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SIDEPANEL_PICKING_CANCELLED') {
      for (const port of sidePanelPorts) {
        port.postMessage({ type: 'PICKING_CANCELLED' });
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SIDEPANEL_REGION_SELECTED') {
      // Capture screenshot of the region
      chrome.tabs.captureVisibleTab({ format: 'png', quality: 100 })
        .then((dataUrl) => {
          for (const port of sidePanelPorts) {
            port.postMessage({
              type: 'SCREENSHOT_CAPTURED',
              dataUrl,
              region: message.region,
            });
          }
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: (error as Error).message });
        });
      return true;
    }

    if (message.type === 'SIDEPANEL_REGION_CANCELLED') {
      sendResponse({ success: true });
      return true;
    }

    handleOneShotMessage(message as ExtensionMessage, sender, sendResponse);
    return true; // async response
  });
}

function handleSidePanelPort(port: chrome.runtime.Port) {
  console.log('[Hub] Side panel connected, total ports:', sidePanelPorts.size + 1);
  sidePanelPorts.add(port);

  port.onMessage.addListener(async (message: ExtensionMessage) => {
    // Side panel messages are handled the same as content script messages
    switch (message.type) {
      case 'CAPTURE_SCREENSHOT': {
        try {
          // Check if current tab is a restricted URL before attempting capture
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          const url = activeTab?.url || '';
          if (url.startsWith('chrome://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
            port.postMessage({
              type: 'SCREENSHOT_ERROR',
              error: 'Cannot capture restricted page',
            });
            break;
          }
          const dataUrl = await chrome.tabs.captureVisibleTab({
            format: 'png',
            quality: 100,
          });
          port.postMessage({ type: 'SCREENSHOT_CAPTURED', dataUrl });
        } catch (error) {
          // Only log once per error type to prevent console spam
          const errMsg = (error as Error).message || 'Screenshot capture failed';
          if (!errMsg.includes('devtools://') && !errMsg.includes('chrome://')) {
            console.error('Screenshot capture failed:', error);
          }
          port.postMessage({
            type: 'SCREENSHOT_ERROR',
            error: errMsg,
          });
        }
        break;
      }

      case 'SUBMIT_TO_INTEGRATIONS': {
        try {
          startKeepAlive();
          const results = await submitToAll(message.payload);
          port.postMessage({ type: 'INTEGRATION_RESULTS', results });
        } catch (error) {
          port.postMessage({
            type: 'INTEGRATION_RESULTS',
            results: [{ integrationId: 'jira', success: false, error: (error as Error).message }],
          });
        } finally {
          stopKeepAlive();
        }
        break;
      }

      case 'START_RECORDING': {
        try {
          await startRecording(message.tabId || 0);
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
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Hub] Side panel disconnected');
    sidePanelPorts.delete(port);
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
          // Check if current tab is a restricted URL before attempting capture
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          const url = activeTab?.url || '';
          if (url.startsWith('chrome://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
            port.postMessage({
              type: 'SCREENSHOT_ERROR',
              error: 'Cannot capture restricted page',
            });
            break;
          }
          const dataUrl = await chrome.tabs.captureVisibleTab({
            format: 'png',
            quality: 100,
          });
          port.postMessage({ type: 'SCREENSHOT_CAPTURED', dataUrl });
        } catch (error) {
          // Only log once per error type to prevent console spam
          const errMsg = (error as Error).message || 'Screenshot capture failed';
          if (!errMsg.includes('devtools://') && !errMsg.includes('chrome://')) {
            console.error('Screenshot capture failed:', error);
          }
          port.postMessage({
            type: 'SCREENSHOT_ERROR',
            error: errMsg,
          });
        }
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
          startKeepAlive(); // Prevent service worker from sleeping during submission
          const results = await submitToAll(message.payload);
          port.postMessage({ type: 'INTEGRATION_RESULTS', results });
        } catch (error) {
          port.postMessage({
            type: 'INTEGRATION_RESULTS',
            results: [{ integrationId: 'jira', success: false, error: (error as Error).message }],
          });
        } finally {
          stopKeepAlive();
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
          const errMsg = (error as Error).message;
          // Don't log cooldown errors - they're expected when DevTools is open
          if (!errMsg.includes('cooldown')) {
            console.error('CDP CSS fetch failed:', error);
          }
          port.postMessage({
            type: 'ELEMENT_STYLES_RESULT',
            success: false,
            error: errMsg,
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
    case 'GET_TAB_ID': {
      // Return the tab ID of the sender
      const tabId = _sender.tab?.id;
      sendResponse({ tabId: tabId ?? null });
      break;
    }

    case 'OPEN_SIDE_PANEL': {
      // Open side panel for the sender's tab
      const tabId = _sender.tab?.id;
      if (tabId) {
        chrome.sidePanel.open({ tabId })
          .then(() => sendResponse({ success: true }))
          .catch((error) => {
            console.warn('[Hub] Failed to open side panel:', error);
            sendResponse({ success: false, error: (error as Error).message });
          });
      } else {
        sendResponse({ success: false, error: 'No tab ID' });
      }
      break;
    }

    case 'GET_RECORDING_STATUS': {
      // Return recording status for the sender's tab
      const tabId = _sender.tab?.id;
      if (tabId) {
        const status = getRecordingStatus(tabId);
        sendResponse(status);
      } else {
        sendResponse({ isRecording: false });
      }
      break;
    }

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

    case 'FETCH_JIRA_ASSIGNEES': {
      fetchAssignableUsers(message.projectKey)
        .then((users) => sendResponse({ success: true, data: users }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      break;
    }

    case 'FETCH_JIRA_PRIORITIES': {
      fetchPriorities()
        .then((priorities) => sendResponse({ success: true, data: priorities }))
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
      startKeepAlive(); // Prevent service worker from sleeping during submission
      submitToAll(message.payload).then((results) => {
        sendResponse({ type: 'INTEGRATION_RESULTS', results });
      }).catch((error) => {
        sendResponse({
          type: 'INTEGRATION_RESULTS',
          results: [{ integrationId: 'jira', success: false, error: (error as Error).message }],
        });
      }).finally(() => {
        stopKeepAlive();
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

    case 'GET_ELEMENT_STYLES': {
      const tabId = _sender.tab?.id;
      if (!tabId) {
        sendResponse({ type: 'ELEMENT_STYLES_RESULT', success: false, error: 'No tab ID' });
        break;
      }
      getElementStylesViaCDP(tabId, message.selector).then((styles) => {
        sendResponse({ type: 'ELEMENT_STYLES_RESULT', success: true, styles });
      }).catch((error) => {
        const errMsg = (error as Error).message;
        // Don't log cooldown errors - they're expected when DevTools is open
        if (!errMsg.includes('cooldown')) {
          console.error('CDP CSS fetch failed:', error);
        }
        sendResponse({
          type: 'ELEMENT_STYLES_RESULT',
          success: false,
          error: errMsg,
        });
      });
      break;
    }

    case 'DELETE_RECORDING': {
      // Reset recording state first to prevent "Already recording" errors
      resetRecordingState();

      // Forward to offscreen document to delete from IndexedDB
      chrome.runtime.sendMessage({
        type: 'delete-recording',
        target: 'offscreen',
        recordingId: message.recordingId,
      }).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        console.warn('Failed to delete recording:', error);
        sendResponse({ success: false, error: (error as Error).message });
      });
      break;
    }

    case 'CAPTURE_SCREENSHOT': {
      // Capture screenshot for side panel (uses provided tabId or sender's tab)
      const targetTabId = message.tabId || _sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ type: 'SCREENSHOT_CAPTURED', dataUrl: null, error: 'No tab ID' });
        break;
      }
      // Check if current tab is a restricted URL before attempting capture
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const activeTab = tabs[0];
        const url = activeTab?.url || '';
        if (url.startsWith('chrome://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
          sendResponse({ type: 'SCREENSHOT_CAPTURED', dataUrl: null, error: 'Cannot capture restricted page' });
          return;
        }
        chrome.tabs.captureVisibleTab({ format: 'png', quality: 100 })
          .then((dataUrl) => {
            sendResponse({ type: 'SCREENSHOT_CAPTURED', dataUrl });
          })
          .catch((error) => {
            sendResponse({ type: 'SCREENSHOT_CAPTURED', dataUrl: null, error: (error as Error).message });
          });
      });
      break;
    }
  }
}

// ── Helper functions for Jira submission ──

function createChangeSetFromPayload(payload: JiraSubmissionPayload): ChangeSet {
  return {
    id: crypto.randomUUID(),
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    changes: payload.changes,
    manualNotes: payload.manualNotes || '',
    createdAt: Date.now(),
  };
}

function collectAttachmentFilenames(payload: JiraSubmissionPayload): {
  all: string[];
  video?: string;
} {
  const all = payload.screenshots.map((s) => s.filename);
  let video: string | undefined;
  if (payload.videoRecordingId) {
    video = `recording-${Date.now()}.webm`;
    all.push(video);
  }
  return { all, video };
}

function collectScreenshotsWithDescriptions(payload: JiraSubmissionPayload): {
  all: Array<{ filename: string; description?: string }>;
  video?: string;
} {
  const all = payload.screenshots.map((s) => ({
    filename: s.filename,
    description: s.description,
  }));
  let video: string | undefined;
  if (payload.videoRecordingId) {
    video = `recording-${Date.now()}.webm`;
    all.push({ filename: video, description: undefined });
  }
  return { all, video };
}

async function uploadAttachments(
  issueKey: string,
  payload: JiraSubmissionPayload,
  videoFilename?: string,
): Promise<number> {
  let uploadedCount = 0;

  // Upload screenshots
  for (const screenshot of payload.screenshots) {
    try {
      const blob = dataUrlToBlob(screenshot.dataUrl);
      await addAttachment(issueKey, blob, screenshot.filename);
      uploadedCount++;
      jiraLogger.info('Attached:', screenshot.filename);
    } catch (err) {
      jiraLogger.warn('Failed to attach', screenshot.filename, err);
    }
  }

  // Upload video if present
  if (payload.videoRecordingId && videoFilename) {
    jiraLogger.info('Fetching video blob for:', payload.videoRecordingId);
    try {
      const videoBlob = await getRecordingBlob(payload.videoRecordingId);
      if (videoBlob) {
        jiraLogger.info('Video blob size:', videoBlob.size);
        await addAttachment(issueKey, videoBlob, videoFilename);
        uploadedCount++;
        jiraLogger.info('Video attached:', videoFilename);
      } else {
        jiraLogger.info('getRecordingBlob returned null');
      }
    } catch (err) {
      jiraLogger.warn('Video attach failed:', err);
    }
  }

  return uploadedCount;
}

async function saveToRecentSubmissions(issueKey: string, summary: string): Promise<void> {
  const recentResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS);
  const recent: Array<{ key: string; summary: string; createdAt: number }> =
    recentResult[STORAGE_KEYS.RECENT_SUBMISSIONS] || [];
  recent.unshift({ key: issueKey, summary, createdAt: Date.now() });
  await chrome.storage.local.set({
    [STORAGE_KEYS.RECENT_SUBMISSIONS]: recent.slice(0, 20),
  });
}

// ── Main submission handler ──

async function handleJiraSubmission(
  payload: JiraSubmissionPayload,
): Promise<{ key: string }> {
  const epicConfigResult = await chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG);
  const epicConfig: EpicConfig | undefined = epicConfigResult[STORAGE_KEYS.EPIC_CONFIG];

  // --- DRY RUN MODE: no project key configured ---
  if (!epicConfig?.projectKey) {
    return handleDryRunSubmission(payload);
  }

  const changeSet = createChangeSetFromPayload(payload);
  const filenames = collectAttachmentFilenames(payload);
  const screenshots = collectScreenshotsWithDescriptions(payload);

  jiraLogger.info('Submission start:', {
    changes: payload.changes.length,
    screenshots: payload.screenshots.length,
    screenshotFiles: filenames.all,
    videoRecordingId: payload.videoRecordingId ?? '(none)',
    manualNotes: payload.manualNotes ? `${payload.manualNotes.length} chars` : '(none)',
  });

  // Phase 1: Create issue
  const summary = payload.summary || generateSummary(changeSet);
  const description = buildFullDescription(changeSet, screenshots.all);

  const issue = await createIssue({
    projectKey: epicConfig.projectKey,
    issueType: epicConfig.issueType || 'Task',
    summary,
    description,
    parentKey: epicConfig.parentKey || undefined,
  });
  jiraLogger.info('Issue created:', issue.key);

  // Phase 2: Upload attachments
  const uploadedCount = await uploadAttachments(issue.key, payload, filenames.video);

  // Phase 3: Update description with wiki markup for inline images
  if (uploadedCount > 0) {
    try {
      const wikiDescription = buildWikiMarkupDescription(changeSet, screenshots.all);
      await updateIssueDescriptionWiki(issue.key, wikiDescription);
      jiraLogger.info('Description updated with wiki markup (inline images)');
    } catch (err) {
      jiraLogger.warn('Wiki description update failed:', err);
    }
  }

  // Save to recent submissions
  await saveToRecentSubmissions(issue.key, summary);

  // Clean up video recording from IndexedDB after successful submission
  if (payload.videoRecordingId) {
    try {
      await chrome.runtime.sendMessage({
        type: 'delete-recording',
        target: 'offscreen',
        recordingId: payload.videoRecordingId,
      });
      jiraLogger.info('Cleaned up recording:', payload.videoRecordingId);
    } catch (err) {
      jiraLogger.warn('Failed to clean up recording:', err);
    }
  }

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

  const allScreenshots = payload.screenshots.map((s) => ({
    filename: s.filename,
    description: s.description,
  }));
  const description = buildFullDescription(changeSet, allScreenshots);
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

  // Clean up video recording from IndexedDB even in dry-run
  if (payload.videoRecordingId) {
    try {
      await chrome.runtime.sendMessage({
        type: 'delete-recording',
        target: 'offscreen',
        recordingId: payload.videoRecordingId,
      });
    } catch {
      // Ignore cleanup errors in dry-run
    }
  }

  return { key: fakeKey };
}

/**
 * Get element styles via Chrome DevTools Protocol (CDP)
 * This provides accurate CSS information including shorthand properties
 */
/**
 * CSS selector is now properly escaped at the source (buildSelector in useContentCSSTracking).
 * This function is kept for any edge cases but should mostly be a pass-through.
 */
function escapeCSSSelector(selector: string): string {
  // The selector should already be properly escaped from buildSelector
  // Just return as-is
  return selector;
}

async function getElementStylesViaCDP(tabId: number, selector: string): Promise<CDPStyleResult> {
  const target = { tabId };
  const escapedSelector = escapeCSSSelector(selector);

  try {
    // Check if we have an active session for this tab
    let session = cdpSessions.get(tabId);

    // Attach debugger (or reuse existing session)
    if (!session || !session.attached) {
      try {
        await chrome.debugger.attach(target, '1.3');

        session = {
          tabId,
          attached: true,
          lastUsed: Date.now(),
        };
        cdpSessions.set(tabId, session);
      } catch (attachError) {
        console.error('[CDP] Failed to attach debugger:', attachError);
        throw new Error(`Debugger attach failed: ${(attachError as Error).message}`);
      }
    }

    // Update last used time and reset detach timer
    session.lastUsed = Date.now();
    if (session.detachTimer) {
      clearTimeout(session.detachTimer);
    }

    // Schedule auto-detach after timeout
    session.detachTimer = setTimeout(async () => {
      const s = cdpSessions.get(tabId);
      if (s && s.attached) {
        try {
          await chrome.debugger.detach(target);
        } catch {
          // Ignore detach errors
        }
        cdpSessions.delete(tabId);
      }
    }, CDP_SESSION_TIMEOUT) as unknown as number;

    // Enable DOM first, then CSS (DOM must be enabled before CSS operations)
    await chrome.debugger.sendCommand(target, 'DOM.enable');
    await chrome.debugger.sendCommand(target, 'CSS.enable');

    // Get document root
    const docResult = await chrome.debugger.sendCommand(target, 'DOM.getDocument') as {
      root: { nodeId: number };
    };

    // Find element by selector
    let queryResult: { nodeId: number };
    try {
      queryResult = await chrome.debugger.sendCommand(target, 'DOM.querySelector', {
        nodeId: docResult.root.nodeId,
        selector: escapedSelector,
      }) as { nodeId: number };
    } catch (queryError) {
      throw new Error(`Invalid selector "${selector}": ${(queryError as Error).message}`);
    }

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

    // Parse inline styles (deduplicate using Map)
    const inlineStyleMap = new Map<string, { name: string; value: string }>();
    if (stylesResult.inlineStyle?.cssProperties) {
      for (const prop of stylesResult.inlineStyle.cssProperties) {
        if (!prop.disabled && prop.value) {
          inlineStyleMap.set(prop.name, { name: prop.name, value: prop.value });
        }
      }
    }
    const inlineStyles = Array.from(inlineStyleMap.values());

    // Parse matched rules
    const matchedRules: CDPStyleRule[] = [];
    if (stylesResult.matchedCSSRules) {
      for (const match of stylesResult.matchedCSSRules) {
        const rule = match.rule;
        // Skip user-agent styles
        if (rule.origin === 'user-agent') continue;

        // Use Map to deduplicate properties (last value wins)
        const propMap = new Map<string, { name: string; value: string; important: boolean }>();
        for (const prop of rule.style.cssProperties) {
          if (!prop.disabled && prop.value) {
            propMap.set(prop.name, {
              name: prop.name,
              value: prop.value,
              important: prop.important ?? false,
            });
          }
        }
        const properties = Array.from(propMap.values());

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
  } catch (error) {
    // On error, mark session as invalid and detach
    const s = cdpSessions.get(tabId);
    if (s) {
      s.attached = false;
      if (s.detachTimer) {
        clearTimeout(s.detachTimer);
      }
      try {
        await chrome.debugger.detach(target);
      } catch {
        // Ignore detach errors
      }
      cdpSessions.delete(tabId);
    }
    throw error;
  }
}

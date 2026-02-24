import type { IntegrationId, IntegrationConfig, IntegrationResult, SubmissionPayload } from '@/shared/types/integration';
import type { EpicConfig } from '@/shared/types/jira-ticket';
import { STORAGE_KEYS } from '@/shared/constants';
import { verifyJira, submitToJira, checkJiraStatus, disconnectJira } from './jira';
import { verifyGithub, submitToGithub } from './github';
import { verifyN8n, submitToN8n } from './n8n';
import { isAuthenticated, getCredentials } from '../jira/auth';

// ── Storage helpers ──

export async function getIntegrationConfigs(): Promise<Record<string, IntegrationConfig>> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS);
  return result[STORAGE_KEYS.INTEGRATIONS] || {};
}

/**
 * Auto-migrate legacy Jira auth into INTEGRATIONS storage if not already present.
 * Called before reading enabled integrations to ensure Jira is always counted.
 */
async function ensureJiraMigration(): Promise<void> {
  const configs = await getIntegrationConfigs();
  if (configs.jira?.enabled) return; // already migrated

  const jiraConnected = await isAuthenticated();
  if (!jiraConnected) return;

  try {
    const creds = await getCredentials();
    const epicResult = await chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG);
    const epicConfig: EpicConfig | undefined = epicResult[STORAGE_KEYS.EPIC_CONFIG];

    const jiraConfig: IntegrationConfig = {
      id: 'jira',
      enabled: true,
      credentials: { email: creds.email, apiToken: creds.apiToken, siteUrl: creds.siteUrl },
      settings: {
        projectKey: epicConfig?.projectKey || '',
        issueType: epicConfig?.issueType || 'Task',
        parentKey: epicConfig?.parentKey || '',
      },
    };

    configs.jira = jiraConfig;
    await chrome.storage.sync.set({ [STORAGE_KEYS.INTEGRATIONS]: configs });
    console.log('[Registry] Legacy Jira auth migrated to INTEGRATIONS');
  } catch (err) {
    console.warn('[Registry] Jira migration failed:', err);
  }
}

export async function getIntegrationConfig(id: IntegrationId): Promise<IntegrationConfig | undefined> {
  const configs = await getIntegrationConfigs();
  return configs[id];
}

export async function saveIntegrationConfig(config: IntegrationConfig): Promise<void> {
  const configs = await getIntegrationConfigs();
  configs[config.id] = config;
  await chrome.storage.sync.set({ [STORAGE_KEYS.INTEGRATIONS]: configs });
}

export async function removeIntegrationConfig(id: IntegrationId): Promise<void> {
  const configs = await getIntegrationConfigs();
  delete configs[id];
  await chrome.storage.sync.set({ [STORAGE_KEYS.INTEGRATIONS]: configs });
}

export async function getEnabledIntegrations(): Promise<IntegrationConfig[]> {
  await ensureJiraMigration();
  const configs = await getIntegrationConfigs();
  return Object.values(configs).filter((c) => c.enabled);
}

// ── Verify ──

export async function verifyIntegration(
  config: IntegrationConfig,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  switch (config.id) {
    case 'jira': return verifyJira(config);
    case 'github': return verifyGithub(config);
    case 'n8n': return verifyN8n(config);
  }
}

// ── Status ──

export async function checkIntegrationStatus(
  id: IntegrationId,
): Promise<{ connected: boolean; displayName?: string }> {
  const config = await getIntegrationConfig(id);
  if (!config?.enabled) return { connected: false };

  switch (id) {
    case 'jira': return checkJiraStatus();
    case 'github': {
      if (!config.credentials.token) return { connected: false };
      const result = await verifyGithub(config);
      return { connected: result.success, displayName: result.displayName };
    }
    case 'n8n': {
      if (!config.credentials.webhookUrl) return { connected: false };
      return { connected: true, displayName: new URL(config.credentials.webhookUrl).host };
    }
  }
}

// ── Disconnect ──

export async function disconnectIntegration(id: IntegrationId): Promise<void> {
  if (id === 'jira') await disconnectJira();
  await removeIntegrationConfig(id);
}

// ── Submit to all enabled ──

export async function submitToAll(
  payload: SubmissionPayload,
): Promise<IntegrationResult[]> {
  const configs = await getEnabledIntegrations();

  if (configs.length === 0) {
    return [{ integrationId: 'jira', success: false, error: 'No integrations enabled' }];
  }

  const results = await Promise.allSettled(
    configs.map((cfg) => submitTo(cfg, payload)),
  );

  const mappedResults = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      integrationId: configs[i].id,
      success: false,
      error: (r.reason as Error)?.message || 'Unknown error',
    };
  });

  // Clean up video recording from IndexedDB if all submissions succeeded
  const allSucceeded = mappedResults.every((r) => r.success);
  if (allSucceeded && payload.videoRecordingId) {
    try {
      await chrome.runtime.sendMessage({
        type: 'delete-recording',
        target: 'offscreen',
        recordingId: payload.videoRecordingId,
      });
      console.log('[Registry] Cleaned up recording:', payload.videoRecordingId);
    } catch (err) {
      console.warn('[Registry] Failed to clean up recording:', err);
    }
  }

  return mappedResults;
}

async function submitTo(
  config: IntegrationConfig,
  payload: SubmissionPayload,
): Promise<IntegrationResult> {
  switch (config.id) {
    case 'jira': return submitToJira(config, payload);
    case 'github': return submitToGithub(config, payload);
    case 'n8n': return submitToN8n(config, payload);
  }
}

// ── Get all statuses (for UI) ──

export async function getAllIntegrationStatuses(): Promise<
  Array<{ id: IntegrationId; enabled: boolean; connected: boolean; displayName?: string }>
> {
  await ensureJiraMigration();
  const configs = await getIntegrationConfigs();
  const ids: IntegrationId[] = ['jira', 'github', 'n8n'];

  return Promise.all(
    ids.map(async (id) => {
      const config = configs[id];
      if (!config?.enabled) {
        return { id, enabled: false, connected: false };
      }
      const status = await checkIntegrationStatus(id);
      return { id, enabled: true, ...status };
    }),
  );
}

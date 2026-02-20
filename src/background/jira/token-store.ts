import { STORAGE_KEYS } from '@/shared/constants';
import type { JiraCredentials } from './types';

export const credentialStore = {
  async save(credentials: JiraCredentials): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEYS.JIRA_CREDENTIALS]: credentials });
  },

  async get(): Promise<JiraCredentials | null> {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.JIRA_CREDENTIALS);
    return result[STORAGE_KEYS.JIRA_CREDENTIALS] ?? null;
  },

  async clear(): Promise<void> {
    await chrome.storage.sync.remove(STORAGE_KEYS.JIRA_CREDENTIALS);
  },
};

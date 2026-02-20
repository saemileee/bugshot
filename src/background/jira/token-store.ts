import { STORAGE_KEYS } from '@/shared/constants';
import type { StoredTokens } from './types';

export const tokenStore = {
  async saveTokens(tokens: StoredTokens): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEYS.JIRA_TOKENS]: tokens });
  },

  async getTokens(): Promise<StoredTokens | null> {
    const result = await chrome.storage.session.get(STORAGE_KEYS.JIRA_TOKENS);
    return result[STORAGE_KEYS.JIRA_TOKENS] ?? null;
  },

  async clearTokens(): Promise<void> {
    await chrome.storage.session.remove(STORAGE_KEYS.JIRA_TOKENS);
  },
};

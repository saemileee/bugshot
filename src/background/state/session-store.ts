import { STORAGE_KEYS } from '@/shared/constants';
import type { CSSChange } from '@/shared/types/css-change';

export const sessionStore = {
  async getBatchChanges(): Promise<CSSChange[]> {
    const result = await chrome.storage.session.get(STORAGE_KEYS.BATCH_CHANGES);
    return result[STORAGE_KEYS.BATCH_CHANGES] || [];
  },

  async setBatchChanges(changes: CSSChange[]): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEYS.BATCH_CHANGES]: changes });
  },

  async clearBatchChanges(): Promise<void> {
    await chrome.storage.session.remove(STORAGE_KEYS.BATCH_CHANGES);
  },
};

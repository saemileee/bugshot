import { useState, useCallback } from 'react';
import type { CSSChange } from '@/shared/types/css-change';
import { STORAGE_KEYS } from '@/shared/constants';

export function useChangeStore() {
  const [changes, setChanges] = useState<CSSChange[]>([]);
  const [batchMode, setBatchMode] = useState(false);

  const persist = (updated: CSSChange[]) => {
    chrome.storage.session.set({ [STORAGE_KEYS.BATCH_CHANGES]: updated });
  };

  const addChange = useCallback((change: CSSChange) => {
    setChanges((prev) => {
      const updated = [...prev, change];
      persist(updated);
      return updated;
    });
  }, []);

  const removeChange = useCallback((id: string) => {
    setChanges((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const removeProperty = useCallback((changeId: string, propertyIndex: number) => {
    setChanges((prev) => {
      const updated = prev
        .map((c) => {
          if (c.id !== changeId) return c;
          const properties = c.properties.filter((_, i) => i !== propertyIndex);
          return properties.length > 0 ? { ...c, properties } : null;
        })
        .filter((c): c is CSSChange => c !== null);
      persist(updated);
      return updated;
    });
  }, []);

  const clearChanges = useCallback(() => {
    setChanges([]);
    chrome.storage.session.remove(STORAGE_KEYS.BATCH_CHANGES);
  }, []);

  const toggleBatchMode = useCallback(() => {
    setBatchMode((prev) => !prev);
  }, []);

  return {
    changes,
    addChange,
    removeChange,
    removeProperty,
    clearChanges,
    batchMode,
    toggleBatchMode,
  };
}

// Mock Chrome API for preview mode
const mockStorage: Record<string, unknown> = {};
const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

(window as unknown as { chrome: typeof chrome }).chrome = {
  runtime: {
    sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
      // Return mock responses based on message type
      if (callback) {
        callback({ success: true, data: [] });
      }
      return true;
    },
    connect: () => ({
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
      postMessage: () => {},
      disconnect: () => {},
      name: 'mock',
    }),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    getURL: (path: string) => path,
    id: 'mock-extension-id',
  },
  storage: {
    local: {
      get: (keys: string | string[] | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        if (typeof keys === 'string') {
          result[keys] = mockStorage[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(k => { result[k] = mockStorage[k]; });
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (callback) callback();
        return Promise.resolve();
      },
    },
    sync: {
      get: (keys: string | string[] | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        if (typeof keys === 'string') {
          result[keys] = mockStorage[keys] ?? '[BugShot]';
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (callback) callback();
        return Promise.resolve();
      },
    },
    onChanged: {
      addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
        listeners.push(fn);
      },
      removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    },
  },
  tabs: {
    query: (_queryInfo: unknown, callback?: (tabs: unknown[]) => void) => {
      if (callback) callback([{ id: 1, url: 'http://localhost:3000' }]);
      return Promise.resolve([{ id: 1 }]);
    },
    captureVisibleTab: (_windowId: unknown, _options: unknown, callback?: (dataUrl: string) => void) => {
      if (callback) callback('data:image/png;base64,mock');
      return Promise.resolve('data:image/png;base64,mock');
    },
  },
} as unknown as typeof chrome;

export {};

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock Chrome API
const mockStorage: Record<string, unknown> = {};
const storageListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = [];

const createStorageArea = (): chrome.storage.StorageArea => ({
  get: vi.fn((keys, callback) => {
    const result: Record<string, unknown> = {};
    const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || mockStorage);
    for (const key of keyList) {
      if (key in mockStorage) result[key] = mockStorage[key];
    }
    callback?.(result);
    return Promise.resolve(result);
  }),
  set: vi.fn((items, callback) => {
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: mockStorage[key], newValue: value };
      mockStorage[key] = value;
    }
    for (const listener of storageListeners) {
      listener(changes, 'local');
    }
    callback?.();
    return Promise.resolve();
  }),
  remove: vi.fn((keys, callback) => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      delete mockStorage[key];
    }
    callback?.();
    return Promise.resolve();
  }),
  clear: vi.fn((callback) => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    callback?.();
    return Promise.resolve();
  }),
  getBytesInUse: vi.fn(() => Promise.resolve(0)),
  setAccessLevel: vi.fn(() => Promise.resolve()),
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
    hasListeners: vi.fn(() => false),
    getRules: vi.fn(),
    removeRules: vi.fn(),
    addRules: vi.fn(),
  },
});

const mockPort: chrome.runtime.Port = {
  name: 'content-widget',
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
    hasListeners: vi.fn(() => false),
    getRules: vi.fn(),
    removeRules: vi.fn(),
    addRules: vi.fn(),
  },
  onDisconnect: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
    hasListeners: vi.fn(() => false),
    getRules: vi.fn(),
    removeRules: vi.fn(),
    addRules: vi.fn(),
  },
  sender: undefined,
};

global.chrome = {
  runtime: {
    connect: vi.fn(() => mockPort),
    sendMessage: vi.fn((message, callback) => {
      callback?.({});
      return Promise.resolve({});
    }),
    onConnect: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    id: 'test-extension-id',
    getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`),
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
  },
  storage: {
    local: createStorageArea(),
    sync: createStorageArea(),
    session: createStorageArea(),
    managed: createStorageArea(),
    onChanged: {
      addListener: vi.fn((listener) => storageListeners.push(listener)),
      removeListener: vi.fn((listener) => {
        const index = storageListeners.indexOf(listener);
        if (index > -1) storageListeners.splice(index, 1);
      }),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },
  tabs: {
    captureVisibleTab: vi.fn(() => Promise.resolve('data:image/png;base64,test')),
    query: vi.fn(() => Promise.resolve([])),
    get: vi.fn(() => Promise.resolve({ id: 1, url: 'https://example.com' })),
    sendMessage: vi.fn(() => Promise.resolve({})),
  },
  debugger: {
    attach: vi.fn(() => Promise.resolve()),
    detach: vi.fn(() => Promise.resolve()),
    sendCommand: vi.fn(() => Promise.resolve({})),
    onEvent: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onDetach: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },
} as unknown as typeof chrome;

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => `${Math.random().toString(36).substring(2)}-${Date.now()}`,
  },
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSWMessaging } from '../useSWMessaging';

describe('useSWMessaging', () => {
  let mockPort: {
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
    onDisconnect: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
  let messageListeners: Array<(msg: unknown) => void>;
  let disconnectListeners: Array<() => void>;

  beforeEach(() => {
    messageListeners = [];
    disconnectListeners = [];

    mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn((listener) => messageListeners.push(listener)),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn((listener) => disconnectListeners.push(listener)),
        removeListener: vi.fn(),
      },
    };

    vi.mocked(chrome.runtime.connect).mockReturnValue(mockPort as unknown as chrome.runtime.Port);
  });

  it('should connect to service worker on mount', () => {
    renderHook(() => useSWMessaging());

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'content-widget' });
  });

  it('should return port reference', () => {
    const { result } = renderHook(() => useSWMessaging());

    expect(result.current.port.current).toBe(mockPort);
  });

  it('should disconnect on unmount', () => {
    const { unmount } = renderHook(() => useSWMessaging());

    unmount();

    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  it('should call callback when message received', () => {
    const onMessage = vi.fn();
    renderHook(() => useSWMessaging(onMessage));

    // Simulate receiving a message
    const testMessage = { type: 'SCREENSHOT_CAPTURED', dataUrl: 'test' };
    act(() => {
      messageListeners[0](testMessage);
    });

    expect(onMessage).toHaveBeenCalledWith(testMessage);
  });

  it('should set portRef to null on disconnect', () => {
    const { result } = renderHook(() => useSWMessaging());

    expect(result.current.port.current).toBe(mockPort);

    // Simulate disconnect
    act(() => {
      disconnectListeners[0]();
    });

    expect(result.current.port.current).toBeNull();
  });

  it('should send message via chrome.runtime.sendMessage', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
      callback?.({ type: 'RESPONSE', success: true });
      return true;
    });

    const { result } = renderHook(() => useSWMessaging());

    const message = { type: 'CHECK_AUTH_STATUS' } as const;
    const response = await result.current.sendMessage(message);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message, expect.any(Function));
    expect(response).toEqual({ type: 'RESPONSE', success: true });
  });

  it('should reject on runtime error', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
      // Simulate lastError
      Object.defineProperty(chrome.runtime, 'lastError', {
        value: { message: 'Connection failed' },
        configurable: true,
      });
      callback?.({} as never);
      return true;
    });

    const { result } = renderHook(() => useSWMessaging());

    await expect(
      result.current.sendMessage({ type: 'CHECK_AUTH_STATUS' })
    ).rejects.toThrow('Connection failed');

    // Clean up
    Object.defineProperty(chrome.runtime, 'lastError', {
      value: undefined,
      configurable: true,
    });
  });

  it('should handle callback updates without reconnecting', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { rerender } = renderHook(
      ({ callback }) => useSWMessaging(callback),
      { initialProps: { callback: callback1 } }
    );

    // Rerender with new callback
    rerender({ callback: callback2 });

    // Should not reconnect
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);

    // New callback should receive messages
    const testMessage = { type: 'TEST' };
    act(() => {
      messageListeners[0](testMessage);
    });

    expect(callback2).toHaveBeenCalledWith(testMessage);
    expect(callback1).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContentCSSTracking } from '../useContentCSSTracking';

describe('useContentCSSTracking', () => {
  let testElement: HTMLDivElement;

  beforeEach(() => {
    // Create a test element with stable styles
    testElement = document.createElement('div');
    testElement.id = 'test-element';
    testElement.className = 'test-class';
    testElement.textContent = 'Test content';
    testElement.style.color = 'red';
    testElement.style.padding = '10px';
    document.body.appendChild(testElement);
  });

  afterEach(() => {
    if (testElement && testElement.parentNode) {
      testElement.parentNode.removeChild(testElement);
    }
  });

  describe('no changes scenario', () => {
    it('should return no_diff when capturing same element without modifications', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      // Capture before
      act(() => {
        result.current.captureBefore(testElement);
      });

      expect(result.current.status.state).toBe('before_captured');

      // Capture after without any modifications
      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      // Should detect no diff
      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');
    });

    it('should return no_diff when element has only inline styles', () => {
      // Clear any CSS rules influence by using a fresh element
      const freshElement = document.createElement('span');
      freshElement.id = 'fresh-element';
      freshElement.style.cssText = 'color: blue; font-size: 14px; margin: 5px;';
      document.body.appendChild(freshElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(freshElement);
      });

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      freshElement.remove();
    });

    it('should return no_diff when element has className but no style changes', () => {
      const classElement = document.createElement('div');
      classElement.className = 'my-class another-class';
      document.body.appendChild(classElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(classElement);
      });

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      classElement.remove();
    });
  });

  describe('with changes scenario', () => {
    it('should detect inline style change', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      // Modify the element
      testElement.style.color = 'blue';

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).not.toBeNull();
      expect(result.current.status.state).toBe('success');
      expect(change?.properties).toContainEqual(
        expect.objectContaining({
          property: 'color',
          asIs: 'red',
          toBe: 'blue',
        })
      );
    });

    it('should detect className change', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      // Modify className
      testElement.className = 'new-class';

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).not.toBeNull();
      expect(change?.properties).toContainEqual(
        expect.objectContaining({
          property: 'className',
          asIs: 'test-class',
          toBe: 'new-class',
        })
      );
    });

    it('should detect textContent change', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      // Modify text content
      testElement.textContent = 'New content';

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).not.toBeNull();
      expect(change?.properties).toContainEqual(
        expect.objectContaining({
          property: 'textContent',
          asIs: 'Test content',
          toBe: 'New content',
        })
      );
    });

    it('should detect new style property added', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      // Add new style
      testElement.style.backgroundColor = 'yellow';

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).not.toBeNull();
      expect(change?.properties).toContainEqual(
        expect.objectContaining({
          property: 'background-color',
          asIs: '(unset)',
          toBe: 'yellow',
        })
      );
    });
  });

  describe('shorthand properties', () => {
    it('should handle shorthand properties like margin consistently', () => {
      const marginElement = document.createElement('div');
      marginElement.style.margin = '10px';
      document.body.appendChild(marginElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(marginElement);
      });

      // No changes made
      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      marginElement.remove();
    });

    it('should handle shorthand properties like padding consistently', () => {
      const paddingElement = document.createElement('div');
      paddingElement.style.padding = '5px 10px 15px 20px';
      document.body.appendChild(paddingElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(paddingElement);
      });

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      paddingElement.remove();
    });

    it('should handle border shorthand consistently', () => {
      const borderElement = document.createElement('div');
      borderElement.style.border = '1px solid red';
      document.body.appendChild(borderElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(borderElement);
      });

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      borderElement.remove();
    });
  });

  describe('interactive pseudo-class filtering', () => {
    it('should not show false positive when element has focus state styles', () => {
      // This test verifies that :focus, :hover rules are filtered out
      // In jsdom, we can't fully simulate CSS rule matching, but we can verify
      // that an element with no actual changes reports no diff
      const inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.style.backgroundColor = 'white';
      document.body.appendChild(inputElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(inputElement);
      });

      // Focus the element (would normally trigger :focus styles)
      inputElement.focus();

      // Capture after without actual style changes
      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      // Should detect no diff because :focus rules are filtered
      expect(change).toBeNull();
      expect(result.current.status.state).toBe('no_diff');

      inputElement.remove();
    });

    it('should detect real style changes even with interactive state', () => {
      const buttonElement = document.createElement('button');
      buttonElement.style.backgroundColor = 'blue';
      document.body.appendChild(buttonElement);

      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(buttonElement);
      });

      // Make an actual style change
      buttonElement.style.backgroundColor = 'red';

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      // Should detect the real change
      expect(change).not.toBeNull();
      expect(result.current.status.state).toBe('success');
      expect(change?.properties).toContainEqual(
        expect.objectContaining({
          property: 'background-color',
          asIs: 'blue',
          toBe: 'red',
        })
      );

      buttonElement.remove();
    });
  });

  describe('edge cases', () => {
    it('should handle element removed from DOM', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      // Remove element from DOM
      testElement.remove();

      let change: ReturnType<typeof result.current.captureAfter>;
      act(() => {
        change = result.current.captureAfter();
      });

      expect(change).toBeNull();
      expect(result.current.status.state).toBe('error');
    });

    it('should reset state correctly', () => {
      const { result } = renderHook(() => useContentCSSTracking());

      act(() => {
        result.current.captureBefore(testElement);
      });

      expect(result.current.status.state).toBe('before_captured');

      act(() => {
        result.current.reset();
      });

      expect(result.current.status.state).toBe('idle');
    });
  });
});

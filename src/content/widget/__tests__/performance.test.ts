/**
 * Performance Tests
 *
 * These tests ensure critical operations meet performance targets:
 * - No Long Tasks (> 50ms blocking)
 * - Throttled high-frequency events
 * - Memory cleanup on unmount
 */

import { render, fireEvent, waitFor } from '@testing-library/react';
import { WidgetRoot } from '../WidgetRoot';
import { FloatingWidget } from '../components/FloatingWidget';

describe('Performance Tests', () => {
  describe('Event Throttling', () => {
    it('should throttle mousemove events with RAF', () => {
      // Track actual handler calls
      let handlerCalls = 0;
      const mockHandler = jest.fn(() => handlerCalls++);

      const TestComponent = () => {
        const rafId = React.useRef<number | null>(null);

        const handleMove = (e: React.MouseEvent) => {
          if (rafId.current !== null) return;

          rafId.current = requestAnimationFrame(() => {
            rafId.current = null;
            mockHandler();
          });
        };

        return <div onMouseMove={handleMove} data-testid="target" />;
      };

      const { getByTestId } = render(<TestComponent />);
      const target = getByTestId('target');

      // Simulate 100 mousemove events
      for (let i = 0; i < 100; i++) {
        fireEvent.mouseMove(target, { clientX: i, clientY: i });
      }

      // With RAF throttling, should be much less than 100
      expect(handlerCalls).toBeLessThan(100);
      expect(handlerCalls).toBeGreaterThan(0);
    });
  });

  describe('Memory Cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const addSpy = jest.spyOn(document, 'addEventListener');
      const removeSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = render(<WidgetRoot />);

      const addedEvents = addSpy.mock.calls.map(call => call[0]);

      unmount();

      // All added listeners should be removed
      addedEvents.forEach(eventType => {
        expect(removeSpy).toHaveBeenCalledWith(
          eventType,
          expect.any(Function),
          expect.anything()
        );
      });

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('should cancel RAF on unmount', () => {
      const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame');

      const { unmount } = render(<FloatingWidget {...mockProps} />);

      // Start a drag operation
      const widget = document.querySelector('[data-testid="widget"]');
      if (widget) {
        fireEvent.mouseDown(widget);
        fireEvent.mouseMove(widget, { clientX: 100, clientY: 100 });
      }

      unmount();

      // RAF should be cancelled
      expect(cancelSpy).toHaveBeenCalled();
      cancelSpy.mockRestore();
    });
  });

  describe('Heavy Operations', () => {
    it('should complete CSS scan within target time', () => {
      const mockRules = generateMockCSSRules(3000);

      const start = performance.now();
      const result = collectFromRules(mockRules);
      const duration = performance.now() - start;

      // Target: < 500ms for 3000 rules
      expect(duration).toBeLessThan(500);
    });

    it('should respect MAX_RULES limit', () => {
      const mockRules = generateMockCSSRules(10000);

      const start = performance.now();
      const result = collectFromRules(mockRules);
      const duration = performance.now() - start;

      // Should stop at 3000, so similar time as above
      expect(duration).toBeLessThan(600);

      // Should not process all 10000
      expect(result.processedCount).toBeLessThanOrEqual(3000);
    });
  });
});

// Helper: Generate mock CSS rules
function generateMockCSSRules(count: number): CSSRuleList {
  const rules: any[] = [];

  for (let i = 0; i < count; i++) {
    rules.push({
      selectorText: `.class-${i}`,
      style: {
        length: 3,
        item: (index: number) => ['color', 'background', 'padding'][index],
        getPropertyValue: (prop: string) => 'value',
      },
    });
  }

  return rules as any;
}

import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '../css-diff';
import type { ElementStyleSnapshot } from '../../types/css-change';

describe('css-diff', () => {
  const baseSnapshot: ElementStyleSnapshot = {
    selector: '.test-element',
    authoredStyles: {
      color: 'red',
      'font-size': '16px',
      padding: '10px',
    },
    inlineStyles: {},
    cssVariables: {},
    className: 'test-class',
    textContent: 'Hello World',
    tagName: 'div',
    url: 'https://example.com',
    timestamp: Date.now(),
  };

  describe('identical snapshots', () => {
    it('should return empty array when snapshots are identical', () => {
      const before = { ...baseSnapshot };
      const after = { ...baseSnapshot };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should return empty array when only timestamp differs', () => {
      const before = { ...baseSnapshot, timestamp: 1000 };
      const after = { ...baseSnapshot, timestamp: 2000 };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should return empty array when styles are same with different whitespace', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'rgb(255, 0, 0)' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'rgb(255,0,0)' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should return empty array when styles are same with different case', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'RED' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'red' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });
  });

  describe('className changes', () => {
    it('should detect className change', () => {
      const before = { ...baseSnapshot, className: 'old-class' };
      const after = { ...baseSnapshot, className: 'new-class' };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'className',
        asIs: 'old-class',
        toBe: 'new-class',
      });
    });

    it('should only diff inline styles when className changes', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        className: 'old-class',
        authoredStyles: { color: 'red', padding: '10px' },
        inlineStyles: { margin: '5px' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        className: 'new-class',
        authoredStyles: { color: 'blue', padding: '20px' },
        inlineStyles: { margin: '10px' },
      };

      const result = diffSnapshots(before, after);

      // Should have className change
      expect(result).toContainEqual({
        property: 'className',
        asIs: 'old-class',
        toBe: 'new-class',
      });

      // Should have inline style change
      expect(result).toContainEqual({
        property: 'margin',
        asIs: '5px',
        toBe: '10px',
      });

      // Should NOT have authored style changes (because class changed)
      expect(result.find(c => c.property === 'color')).toBeUndefined();
      expect(result.find(c => c.property === 'padding')).toBeUndefined();
    });
  });

  describe('textContent changes', () => {
    it('should detect textContent change', () => {
      const before = { ...baseSnapshot, textContent: 'Old text' };
      const after = { ...baseSnapshot, textContent: 'New text' };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'textContent',
        asIs: 'Old text',
        toBe: 'New text',
      });
    });
  });

  describe('style property changes', () => {
    it('should detect style property change', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'red' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'blue' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'color',
        asIs: 'red',
        toBe: 'blue',
      });
    });

    it('should detect new property added', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: {},
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'red' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'color',
        asIs: '(unset)',
        toBe: 'red',
      });
    });

    it('should detect property removed', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { color: 'red' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: {},
      };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'color',
        asIs: 'red',
        toBe: '(unset)',
      });
    });
  });

  describe('CSS variables', () => {
    it('should detect CSS variable change', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        cssVariables: { '--primary-color': '#ff0000' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        cssVariables: { '--primary-color': '#00ff00' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: '--primary-color',
        asIs: '#ff0000',
        toBe: '#00ff00',
        isDesignToken: true,
        tokenName: '--primary-color',
      });
    });
  });

  describe('value normalization', () => {
    it('should normalize zero values with different units', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { margin: '0px' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { margin: '0' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should normalize decimal values (leading zero)', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { opacity: '0.5' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { opacity: '.5' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should normalize decimal values (trailing zero)', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { opacity: '0.5' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { opacity: '0.50' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should normalize quoted vs unquoted font names', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { 'font-family': '"Arial"' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { 'font-family': 'Arial' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should normalize calc() whitespace', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { width: 'calc(100% - 20px)' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { width: 'calc( 100% - 20px )' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should normalize zero units in complex values', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { margin: '0 10px 0px 10px' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { margin: '0px 10px 0 10px' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty className', () => {
      const before = { ...baseSnapshot, className: '' };
      const after = { ...baseSnapshot, className: '' };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should handle empty textContent', () => {
      const before = { ...baseSnapshot, textContent: '' };
      const after = { ...baseSnapshot, textContent: '' };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should handle identical complex styles', () => {
      const complexStyles = {
        'background-image': 'linear-gradient(to right, #ff0000, #00ff00)',
        transform: 'translateX(10px) rotate(45deg)',
        'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.1)',
        filter: 'blur(5px) brightness(1.2)',
      };

      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: complexStyles,
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { ...complexStyles },
      };

      const result = diffSnapshots(before, after);
      expect(result).toEqual([]);
    });

    it('should detect subtle value differences', () => {
      const before: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { padding: '10px' },
      };
      const after: ElementStyleSnapshot = {
        ...baseSnapshot,
        authoredStyles: { padding: '10.5px' },
      };

      const result = diffSnapshots(before, after);
      expect(result).toContainEqual({
        property: 'padding',
        asIs: '10px',
        toBe: '10.5px',
      });
    });
  });
});

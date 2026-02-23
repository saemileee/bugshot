import { describe, it, expect } from 'vitest';
import { generateSummary, buildWikiMarkupDescription, buildFullDescription } from '../jira-formatter';
import type { ChangeSet } from '../../types/css-change';

describe('jira-formatter', () => {
  const baseChangeSet: ChangeSet = {
    id: 'test-123',
    pageUrl: 'https://example.com/page',
    pageTitle: 'Test Page',
    createdAt: Date.now(),
    changes: [],
  };

  describe('generateSummary', () => {
    it('should generate summary for manual QA note when no changes', () => {
      const result = generateSummary(baseChangeSet);
      expect(result).toBe('[BugShot] Test Page - Manual QA note');
    });

    it('should generate summary for single change', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        changes: [{
          id: 'change-1',
          timestamp: Date.now(),
          selector: '.header',
          elementDescription: 'header',
          url: 'https://example.com',
          properties: [{ property: 'color', asIs: 'red', toBe: 'blue' }],
          status: 'pending',
        }],
      };
      const result = generateSummary(changeSet);
      expect(result).toBe('[BugShot] Test Page - color change on .header');
    });

    it('should generate summary for multiple changes', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        changes: [
          {
            id: 'change-1',
            timestamp: Date.now(),
            selector: '.header',
            elementDescription: 'header',
            url: 'https://example.com',
            properties: [{ property: 'color', asIs: 'red', toBe: 'blue' }],
            status: 'pending',
          },
          {
            id: 'change-2',
            timestamp: Date.now(),
            selector: '.footer',
            elementDescription: 'footer',
            url: 'https://example.com',
            properties: [{ property: 'padding', asIs: '10px', toBe: '20px' }],
            status: 'pending',
          },
        ],
      };
      const result = generateSummary(changeSet);
      expect(result).toBe('[BugShot] Test Page - 2 CSS changes');
    });

    it('should use pathname when pageTitle is empty', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        pageTitle: '',
        pageUrl: 'https://example.com/products/item',
      };
      const result = generateSummary(changeSet);
      expect(result).toContain('/products/item');
    });
  });

  describe('buildWikiMarkupDescription', () => {
    it('should include context section', () => {
      const result = buildWikiMarkupDescription(baseChangeSet, []);
      expect(result).toContain('h3. Context');
      expect(result).toContain('https://example.com/page');
    });

    it('should include manual notes when provided', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        manualNotes: 'This is a test note',
      };
      const result = buildWikiMarkupDescription(changeSet, []);
      expect(result).toContain('h3. Notes');
      expect(result).toContain('This is a test note');
    });

    it('should include property table for changes', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        changes: [{
          id: 'change-1',
          timestamp: Date.now(),
          selector: '.btn',
          elementDescription: 'button',
          url: 'https://example.com',
          properties: [
            { property: 'color', asIs: 'red', toBe: 'blue' },
            { property: 'font-size', asIs: '12px', toBe: '14px' },
          ],
          status: 'pending',
        }],
      };
      const result = buildWikiMarkupDescription(changeSet, []);
      expect(result).toContain('||Property||As-Is||To-Be||');
      expect(result).toContain('|{{color}}|red|blue|');
      expect(result).toContain('|{{font-size}}|12px|14px|');
    });

    it('should reference screenshots with thumbnail format', () => {
      const result = buildWikiMarkupDescription(baseChangeSet, ['screenshot-123.png']);
      expect(result).toContain('h3. Screenshots');
      expect(result).toContain('!screenshot-123.png|thumbnail!');
    });

    it('should reference video with attachment link format', () => {
      const result = buildWikiMarkupDescription(baseChangeSet, ['recording-456.webm']);
      expect(result).toContain('h3. Video');
      expect(result).toContain('[^recording-456.webm]');
    });

    it('should include As-Is and To-Be screenshots for element', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        changes: [{
          id: 'change-1',
          timestamp: Date.now(),
          selector: '.header',
          elementDescription: 'header',
          url: 'https://example.com',
          properties: [],
          status: 'pending',
        }],
      };
      const result = buildWikiMarkupDescription(changeSet, [
        '_header-as-is.png',
        '_header-to-be.png',
      ]);
      expect(result).toContain('*As-Is:*');
      expect(result).toContain('!_header-as-is.png|thumbnail!');
      expect(result).toContain('*To-Be:*');
      expect(result).toContain('!_header-to-be.png|thumbnail!');
    });
  });

  describe('buildFullDescription', () => {
    it('should return valid ADF document structure', () => {
      const result = buildFullDescription(baseChangeSet, []) as {
        version: number;
        type: string;
        content: unknown[];
      };
      expect(result.version).toBe(1);
      expect(result.type).toBe('doc');
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should include context heading', () => {
      const result = buildFullDescription(baseChangeSet, []) as {
        content: Array<{ type: string; content?: Array<{ text: string }> }>;
      };
      const contextHeading = result.content.find(
        (node) => node.type === 'heading' && node.content?.[0]?.text === 'Context'
      );
      expect(contextHeading).toBeDefined();
    });

    it('should include element heading for changes', () => {
      const changeSet: ChangeSet = {
        ...baseChangeSet,
        changes: [{
          id: 'change-1',
          timestamp: Date.now(),
          selector: '#main-nav',
          elementDescription: 'navigation',
          url: 'https://example.com',
          properties: [],
          status: 'pending',
        }],
      };
      const result = buildFullDescription(changeSet, []) as {
        content: Array<{ type: string; content?: Array<{ text: string }> }>;
      };
      const elementHeading = result.content.find(
        (node) => node.type === 'heading' && node.content?.[0]?.text === 'Element: #main-nav'
      );
      expect(elementHeading).toBeDefined();
    });
  });
});

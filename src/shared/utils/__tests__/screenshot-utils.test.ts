import { describe, it, expect } from 'vitest';
import { dataUrlToBlob } from '../screenshot-utils';

describe('screenshot-utils', () => {
  describe('dataUrlToBlob', () => {
    it('should convert PNG data URL to Blob', () => {
      // Small 1x1 transparent PNG
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const blob = dataUrlToBlob(dataUrl);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should convert JPEG data URL to Blob', () => {
      // Small 1x1 white JPEG
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';
      const blob = dataUrlToBlob(dataUrl);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/jpeg');
    });

    it('should default to image/png when mime type regex does not match', () => {
      // Malformed data URL where regex won't find mime
      const dataUrl = 'data:base64,dGVzdA=='; // Missing the colon-semicolon pattern
      const blob = dataUrlToBlob(dataUrl);

      expect(blob).toBeInstanceOf(Blob);
      // Defaults to image/png when regex fails
      expect(blob.type).toBe('image/png');
    });

    it('should preserve binary data correctly', () => {
      // "test" in base64
      const dataUrl = 'data:text/plain;base64,dGVzdA==';
      const blob = dataUrlToBlob(dataUrl);

      expect(blob.size).toBe(4); // "test" is 4 bytes
    });
  });
});

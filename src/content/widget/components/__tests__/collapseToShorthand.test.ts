import { describe, it, expect } from 'vitest';

// Copy the types and functions from StyleEditor for testing
interface RuleProperty {
  property: string;
  value: string;
  priority: string;
  overridden: boolean;
}

interface ShorthandMapping {
  shorthand: string;
  longhands: string[];
  type: 'box' | 'corner' | 'pair';
}

const SHORTHAND_MAPPINGS: ShorthandMapping[] = [
  { shorthand: 'padding', longhands: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], type: 'box' },
  { shorthand: 'margin', longhands: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], type: 'box' },
  { shorthand: 'border-style', longhands: ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'], type: 'box' },
  { shorthand: 'border-width', longhands: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'], type: 'box' },
  { shorthand: 'border-color', longhands: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'], type: 'box' },
  { shorthand: 'border-radius', longhands: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], type: 'corner' },
  { shorthand: 'gap', longhands: ['row-gap', 'column-gap'], type: 'pair' },
  { shorthand: 'inset', longhands: ['top', 'right', 'bottom', 'left'], type: 'box' },
];

function isDefaultValue(prop: string, value: string): boolean {
  const v = value.toLowerCase().trim();

  // Only filter border-style: none (all sides must be none for shorthand)
  if (prop === 'border-style' && v === 'none') {
    return true;
  }

  // Only filter padding/margin when ALL sides are 0
  if ((prop === 'padding' || prop === 'margin') && (v === '0px' || v === '0')) {
    return true;
  }

  return false;
}

function collapseToShorthand(props: RuleProperty[]): RuleProperty[] {
  const propMap = new Map<string, RuleProperty>();
  for (const p of props) {
    propMap.set(p.property, p);
  }

  const result: RuleProperty[] = [];
  const consumed = new Set<string>();

  for (const mapping of SHORTHAND_MAPPINGS) {
    // If shorthand already exists in props, mark longhands as consumed and skip collapse
    if (propMap.has(mapping.shorthand)) {
      mapping.longhands.forEach((name) => consumed.add(name));
      continue;
    }

    const longhands = mapping.longhands.map((name) => propMap.get(name)).filter(Boolean) as RuleProperty[];

    // Only collapse if ALL longhands are present
    if (longhands.length !== mapping.longhands.length) continue;

    // Check if all have the same priority
    const priorities = new Set(longhands.map((p) => p.priority));
    if (priorities.size > 1) continue;

    // Check if all are overridden or none are
    const overridden = longhands.every((p) => p.overridden);
    const notOverridden = longhands.every((p) => !p.overridden);
    if (!overridden && !notOverridden) continue;

    const values = longhands.map((p) => p.value);

    let shorthandValue: string;

    if (mapping.type === 'box' || mapping.type === 'corner') {
      const [top, right, bottom, left] = values;

      if (top === right && right === bottom && bottom === left) {
        shorthandValue = top;
      } else if (top === bottom && right === left) {
        shorthandValue = `${top} ${right}`;
      } else if (right === left) {
        shorthandValue = `${top} ${right} ${bottom}`;
      } else {
        shorthandValue = `${top} ${right} ${bottom} ${left}`;
      }
    } else if (mapping.type === 'pair') {
      const [first, second] = values;
      shorthandValue = first === second ? first : `${first} ${second}`;
    } else {
      continue;
    }

    // Mark longhands as consumed
    mapping.longhands.forEach((name) => consumed.add(name));

    // Skip if the collapsed shorthand is a default value
    if (isDefaultValue(mapping.shorthand, shorthandValue)) {
      continue;
    }

    result.push({
      property: mapping.shorthand,
      value: shorthandValue,
      priority: longhands[0].priority,
      overridden: overridden,
    });
  }

  // Add remaining properties that weren't collapsed (iterate deduplicated Map)
  for (const p of propMap.values()) {
    if (!consumed.has(p.property)) {
      // Skip default values for certain properties
      if (!isDefaultValue(p.property, p.value)) {
        result.push(p);
      }
    }
  }

  return result;
}

// Helper to create a property
function prop(property: string, value: string, overridden = false): RuleProperty {
  return { property, value, priority: '', overridden };
}

describe('collapseToShorthand', () => {
  describe('border-radius', () => {
    it('should collapse 4 equal border-radius values to shorthand', () => {
      const input = [
        prop('border-top-left-radius', '8px'),
        prop('border-top-right-radius', '8px'),
        prop('border-bottom-right-radius', '8px'),
        prop('border-bottom-left-radius', '8px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-radius');
      expect(result[0].value).toBe('8px');
    });

    it('should collapse different border-radius values correctly', () => {
      const input = [
        prop('border-top-left-radius', '4px'),
        prop('border-top-right-radius', '8px'),
        prop('border-bottom-right-radius', '4px'),
        prop('border-bottom-left-radius', '8px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-radius');
      expect(result[0].value).toBe('4px 8px');
    });

    it('should NOT filter out border-radius with 0px values', () => {
      const input = [
        prop('border-top-left-radius', '0px'),
        prop('border-top-right-radius', '0px'),
        prop('border-bottom-right-radius', '0px'),
        prop('border-bottom-left-radius', '0px'),
      ];
      const result = collapseToShorthand(input);
      // border-radius: 0px is still valid and should be shown
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-radius');
      expect(result[0].value).toBe('0px');
    });

    it('should keep border-radius if only some longhands are present', () => {
      const input = [
        prop('border-top-left-radius', '8px'),
        prop('border-top-right-radius', '8px'),
        // missing bottom corners
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.property)).toContain('border-top-left-radius');
      expect(result.map(r => r.property)).toContain('border-top-right-radius');
    });
  });

  describe('padding', () => {
    it('should collapse 4 equal padding values to shorthand', () => {
      const input = [
        prop('padding-top', '10px'),
        prop('padding-right', '10px'),
        prop('padding-bottom', '10px'),
        prop('padding-left', '10px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('padding');
      expect(result[0].value).toBe('10px');
    });

    it('should collapse padding with 2 unique values (top/bottom, left/right)', () => {
      const input = [
        prop('padding-top', '10px'),
        prop('padding-right', '20px'),
        prop('padding-bottom', '10px'),
        prop('padding-left', '20px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('padding');
      expect(result[0].value).toBe('10px 20px');
    });

    it('should collapse and filter out padding: 0px (all zeros)', () => {
      const input = [
        prop('padding-top', '0px'),
        prop('padding-right', '0px'),
        prop('padding-bottom', '0px'),
        prop('padding-left', '0px'),
      ];
      const result = collapseToShorthand(input);
      // After collapse to padding: 0px, it gets filtered as default
      expect(result).toHaveLength(0);
    });

    it('should NOT filter individual padding-* when not all present', () => {
      const input = [
        prop('padding-top', '0px'),
        prop('padding-bottom', '0px'),
        // missing right and left
      ];
      const result = collapseToShorthand(input);
      // Individual longhands should remain since we can't collapse
      expect(result).toHaveLength(2);
    });

    it('should NOT filter out padding if only some are 0px', () => {
      const input = [
        prop('padding-top', '10px'),
        prop('padding-right', '0px'),
        prop('padding-bottom', '10px'),
        prop('padding-left', '0px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('padding');
      expect(result[0].value).toBe('10px 0px');
    });
  });

  describe('border-style', () => {
    it('should collapse and filter out border-style: none (all none)', () => {
      const input = [
        prop('border-top-style', 'none'),
        prop('border-right-style', 'none'),
        prop('border-bottom-style', 'none'),
        prop('border-left-style', 'none'),
      ];
      const result = collapseToShorthand(input);
      // After collapse to border-style: none, it gets filtered as default
      expect(result).toHaveLength(0);
    });

    it('should NOT filter individual border-*-style: none (only shorthand is filtered)', () => {
      // If only some sides are present, they should NOT be filtered
      const input = [
        prop('border-top-style', 'none'),
        prop('border-bottom-style', 'none'),
        // missing right and left
      ];
      const result = collapseToShorthand(input);
      // Individual longhands should remain since we can't collapse
      expect(result).toHaveLength(2);
    });

    it('should collapse border-style: solid', () => {
      const input = [
        prop('border-top-style', 'solid'),
        prop('border-right-style', 'solid'),
        prop('border-bottom-style', 'solid'),
        prop('border-left-style', 'solid'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-style');
      expect(result[0].value).toBe('solid');
    });
  });

  describe('mixed properties', () => {
    it('should handle mix of collapsible and non-collapsible properties', () => {
      const input = [
        prop('display', 'flex'),
        prop('padding-top', '10px'),
        prop('padding-right', '10px'),
        prop('padding-bottom', '10px'),
        prop('padding-left', '10px'),
        prop('color', 'red'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(3);
      expect(result.map(r => r.property)).toContain('display');
      expect(result.map(r => r.property)).toContain('padding');
      expect(result.map(r => r.property)).toContain('color');
    });

    it('should preserve property order (non-collapsed first, then collapsed)', () => {
      const input = [
        prop('display', 'flex'),
        prop('border-top-left-radius', '8px'),
        prop('border-top-right-radius', '8px'),
        prop('border-bottom-right-radius', '8px'),
        prop('border-bottom-left-radius', '8px'),
      ];
      const result = collapseToShorthand(input);
      // First should be the collapsed shorthand, then display
      expect(result).toHaveLength(2);
      expect(result.map(r => r.property)).toContain('border-radius');
      expect(result.map(r => r.property)).toContain('display');
    });
  });

  describe('gap', () => {
    it('should collapse equal row-gap and column-gap', () => {
      const input = [
        prop('row-gap', '16px'),
        prop('column-gap', '16px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('gap');
      expect(result[0].value).toBe('16px');
    });

    it('should collapse different row-gap and column-gap', () => {
      const input = [
        prop('row-gap', '16px'),
        prop('column-gap', '24px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('gap');
      expect(result[0].value).toBe('16px 24px');
    });
  });

  describe('shorthand properties passed directly (CDP behavior)', () => {
    it('should keep border-radius shorthand when passed directly', () => {
      // CDP sometimes returns the shorthand directly, not longhands
      const input = [
        prop('border-radius', '8px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-radius');
      expect(result[0].value).toBe('8px');
    });

    it('should keep padding shorthand when passed directly', () => {
      const input = [
        prop('padding', '10px 20px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('padding');
      expect(result[0].value).toBe('10px 20px');
    });

    it('should keep border-style shorthand when not none', () => {
      const input = [
        prop('border-style', 'solid'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-style');
      expect(result[0].value).toBe('solid');
    });

    it('should filter out border-style: none shorthand', () => {
      const input = [
        prop('border-style', 'none'),
      ];
      const result = collapseToShorthand(input);
      // Should be filtered because border-style none is default
      expect(result).toHaveLength(0);
    });

    it('should handle mix of shorthand and other properties', () => {
      const input = [
        prop('display', 'flex'),
        prop('border-radius', '8px'),
        prop('padding', '10px'),
        prop('color', '#333'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(4);
      expect(result.map(r => r.property)).toContain('display');
      expect(result.map(r => r.property)).toContain('border-radius');
      expect(result.map(r => r.property)).toContain('padding');
      expect(result.map(r => r.property)).toContain('color');
    });

    it('should NOT duplicate longhands when shorthand already exists', () => {
      // CDP sometimes returns both shorthand AND longhands
      const input = [
        prop('border-radius', '8px'),
        prop('border-top-left-radius', '8px'),
        prop('border-top-right-radius', '8px'),
        prop('border-bottom-right-radius', '8px'),
        prop('border-bottom-left-radius', '8px'),
      ];
      const result = collapseToShorthand(input);
      // Should only have the shorthand, longhands consumed
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('border-radius');
      expect(result[0].value).toBe('8px');
    });

    it('should NOT duplicate padding longhands when shorthand already exists', () => {
      const input = [
        prop('padding', '10px 20px'),
        prop('padding-top', '10px'),
        prop('padding-right', '20px'),
        prop('padding-bottom', '10px'),
        prop('padding-left', '20px'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('padding');
      expect(result[0].value).toBe('10px 20px');
    });

    it('should deduplicate same property appearing multiple times', () => {
      // CDP sometimes returns the same property multiple times
      const input = [
        prop('pointer-events', 'auto'),
        prop('pointer-events', 'none'),
        prop('display', 'flex'),
        prop('display', 'block'),
      ];
      const result = collapseToShorthand(input);
      expect(result).toHaveLength(2);
      // Last value wins
      expect(result.find(r => r.property === 'pointer-events')?.value).toBe('none');
      expect(result.find(r => r.property === 'display')?.value).toBe('block');
    });
  });
});

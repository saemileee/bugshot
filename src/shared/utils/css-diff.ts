import type { CSSPropertyChange, ElementStyleSnapshot } from '../types/css-change';

/**
 * Diff two snapshots using authored styles (not computed).
 *
 * Logic:
 * 1. className changed → report it, suppress rule-derived style diffs (only inline style diffs shown)
 * 2. textContent changed → report it
 * 3. CSS custom properties (--*) changed → report them
 * 4. Authored style properties changed → report with var() references preserved
 */
export function diffSnapshots(
  before: ElementStyleSnapshot,
  after: ElementStyleSnapshot,
): CSSPropertyChange[] {
  const changes: CSSPropertyChange[] = [];
  const classChanged = before.className !== after.className;

  // 1. className
  if (classChanged) {
    changes.push({
      property: 'className',
      asIs: before.className || '(none)',
      toBe: after.className || '(none)',
    });
  }

  // 2. textContent
  if (before.textContent !== after.textContent) {
    changes.push({
      property: 'textContent',
      asIs: before.textContent || '(empty)',
      toBe: after.textContent || '(empty)',
    });
  }

  // 3. CSS custom properties (design tokens)
  const allVarNames = new Set([
    ...Object.keys(before.cssVariables),
    ...Object.keys(after.cssVariables),
  ]);
  for (const varName of allVarNames) {
    const asIs = before.cssVariables[varName] ?? '';
    const toBe = after.cssVariables[varName] ?? '';
    if (normalizeValue(asIs) !== normalizeValue(toBe)) {
      changes.push({
        property: varName,
        asIs: asIs || '(unset)',
        toBe: toBe || '(unset)',
        isDesignToken: true,
        tokenName: varName,
      });
    }
  }

  // 4. Style properties
  // If class changed → only diff inline styles (rule-based diffs are side-effects of class change)
  // If class didn't change → diff all authored styles (rules + inline)
  const beforeStyles = classChanged ? before.inlineStyles : before.authoredStyles;
  const afterStyles = classChanged ? after.inlineStyles : after.authoredStyles;

  const allProps = new Set([
    ...Object.keys(beforeStyles),
    ...Object.keys(afterStyles),
  ]);

  for (const prop of allProps) {
    if (prop.startsWith('--')) continue; // already handled above
    const asIs = beforeStyles[prop] ?? '';
    const toBe = afterStyles[prop] ?? '';
    if (normalizeValue(asIs) !== normalizeValue(toBe)) {
      const change: CSSPropertyChange = {
        property: prop,
        asIs: asIs || '(unset)',
        toBe: toBe || '(unset)',
      };
      if (hasVarReference(asIs) || hasVarReference(toBe)) {
        change.isDesignToken = true;
      }
      changes.push(change);
    }
  }

  return changes;
}

/**
 * Check if a CSS value contains a var() reference.
 */
function hasVarReference(value: string): boolean {
  return value.includes('var(');
}

/**
 * Normalize CSS values for comparison.
 */
function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, 'rgb($1, $2, $3)')
    .replace(
      /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,
      'rgba($1, $2, $3, $4)',
    );
}

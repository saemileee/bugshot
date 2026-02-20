export interface CSSPropertyChange {
  property: string;
  asIs: string;
  toBe: string;
  /** Authored value before (preserves var() references) */
  authoredAsIs?: string;
  /** Authored value after (preserves var() references) */
  authoredToBe?: string;
  isDesignToken?: boolean;
  tokenName?: string;
}

export interface CSSChange {
  id: string;
  timestamp: number;
  selector: string;
  elementDescription: string;
  url: string;
  properties: CSSPropertyChange[];
  /** Free-text description for changes that can't be expressed via CSS edits */
  description?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  status: 'pending' | 'batched' | 'submitted';
}

export interface ChangeSet {
  id: string;
  pageUrl: string;
  pageTitle: string;
  changes: CSSChange[];
  manualNotes: string;
  createdAt: number;
}

export interface ElementStyleSnapshot {
  selector: string;
  /** All authored styles from matched CSS rules + inline (preserves var() references) */
  authoredStyles: Record<string, string>;
  /** Inline styles only (from el.style) — used when className changed to exclude rule-derived diffs */
  inlineStyles: Record<string, string>;
  /** CSS custom properties (--*) from matched rules + inline */
  cssVariables: Record<string, string>;
  /** Element's className attribute */
  className: string;
  /** Direct text content (text nodes only, not nested elements) */
  textContent: string;
  tagName: string;
  url: string;
  timestamp: number;
}

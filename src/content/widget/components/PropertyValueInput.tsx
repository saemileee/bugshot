import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

interface PropertyValueInputProps {
  property: string;
  value: string;
  onChange: (value: string) => void;
  overridden?: boolean;
}

// ── Color detection ──

const NAMED_COLORS = new Set([
  'black','silver','gray','white','maroon','red','purple','fuchsia',
  'green','lime','olive','yellow','navy','blue','teal','aqua','orange',
  'aliceblue','antiquewhite','aquamarine','azure','beige','bisque',
  'blanchedalmond','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue',
  'darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
  'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred',
  'darksalmon','darkseagreen','darkslateblue','darkslategray','darkslategrey',
  'darkturquoise','darkviolet','deeppink','deepskyblue','dimgray','dimgrey',
  'dodgerblue','firebrick','floralwhite','forestgreen','gainsboro','ghostwhite',
  'gold','goldenrod','greenyellow','grey','honeydew','hotpink','indianred',
  'indigo','ivory','khaki','lavender','lavenderblush','lawngreen',
  'lemonchiffon','lightblue','lightcoral','lightcyan','lightgoldenrodyellow',
  'lightgray','lightgreen','lightgrey','lightpink','lightsalmon','lightseagreen',
  'lightskyblue','lightslategray','lightslategrey','lightsteelblue','lightyellow',
  'limegreen','linen','magenta','mediumaquamarine','mediumblue','mediumorchid',
  'mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen',
  'mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose',
  'moccasin','navajowhite','oldlace','olivedrab','orangered','orchid',
  'palegoldenrod','palegreen','paleturquoise','palevioletred','papayawhip',
  'peachpuff','peru','pink','plum','powderblue','rosybrown','royalblue',
  'saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','skyblue',
  'slateblue','slategray','slategrey','snow','springgreen','steelblue','tan',
  'thistle','tomato','turquoise','violet','wheat','whitesmoke','yellowgreen',
  'rebeccapurple','transparent','currentcolor','inherit',
]);

const COLOR_PROPERTIES = new Set([
  'color', 'background-color', 'border-color', 'outline-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'text-decoration-color', 'column-rule-color', 'caret-color', 'accent-color',
  'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
]);

function isColorProperty(prop: string): boolean {
  return COLOR_PROPERTIES.has(prop);
}

function isColorValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v);
  if (v.startsWith('rgb')) return /^rgba?\s*\(/.test(v);
  if (v.startsWith('hsl')) return /^hsla?\s*\(/.test(v);
  if (NAMED_COLORS.has(v)) return true;
  return false;
}

/** Convert any CSS color to #rrggbb for <input type="color"> */
function colorToHex(cssColor: string): string {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return '#000000';
    ctx.fillStyle = cssColor;
    const result = ctx.fillStyle;
    // ctx.fillStyle normalizes to #rrggbb or rgba
    if (result.startsWith('#')) return result;
    const m = result.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const hex = (n: string) => parseInt(n).toString(16).padStart(2, '0');
      return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
    }
    return '#000000';
  } catch {
    return '#000000';
  }
}

// ── Numeric detection ──

const NUMERIC_RE = /^(-?\d*\.?\d+)\s*(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|cm|mm|in|s|ms|deg|rad|turn)?$/;

function parseNumericValue(value: string): { num: number; unit: string } | null {
  const m = value.trim().match(NUMERIC_RE);
  if (!m) return null;
  return { num: parseFloat(m[1]), unit: m[2] || '' };
}

function getStep(unit: string, shift: boolean): number {
  if (shift) return unit === 'rem' || unit === 'em' ? 1 : 10;
  return unit === 'rem' || unit === 'em' ? 0.1 : 1;
}

// ── Token detection ──

const VAR_RE = /^var\(\s*(--[\w-]+)(?:\s*,\s*(.+))?\s*\)$/;

function parseVarReference(value: string): { token: string; fallback?: string } | null {
  const m = value.trim().match(VAR_RE);
  if (!m) return null;
  return { token: m[1], fallback: m[2]?.trim() };
}

/** Collect all CSS custom properties from stylesheets and :root */
function collectPageTokens(): Map<string, string> {
  const tokens = new Map<string, string>();

  function extractFromRules(rules: CSSRuleList) {
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];

      // Recurse into grouping rules (@media, @layer, @supports, etc.)
      try {
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          extractFromRules((rule as CSSGroupingRule).cssRules);
        }
      } catch { /* can't access nested rules */ }

      if (!(rule instanceof CSSStyleRule)) continue;

      for (let p = 0; p < rule.style.length; p++) {
        const prop = rule.style.item(p);
        if (prop.startsWith('--')) {
          tokens.set(prop, rule.style.getPropertyValue(prop).trim());
        }
      }
    }
  }

  // Collect from all stylesheets (recursing into nested rules)
  for (let s = 0; s < document.styleSheets.length; s++) {
    let rules: CSSRuleList;
    try { rules = document.styleSheets[s].cssRules; } catch { continue; }
    try { extractFromRules(rules); } catch { /* skip */ }
  }

  // Also collect resolved values from :root via getComputedStyle
  const rootStyle = getComputedStyle(document.documentElement);
  for (const [name] of tokens) {
    const resolved = rootStyle.getPropertyValue(name).trim();
    if (resolved) tokens.set(name, resolved);
  }

  // Collect from inline style of documentElement
  const root = document.documentElement;
  for (let i = 0; i < root.style.length; i++) {
    const prop = root.style.item(i);
    if (prop.startsWith('--')) {
      tokens.set(prop, root.style.getPropertyValue(prop).trim());
    }
  }

  return tokens;
}

/** Group tokens by prefix (e.g. --color-*, --spacing-*) */
function getTokenPrefix(token: string): string {
  // --color-primary-500 → --color
  // --spacing-4 → --spacing
  const parts = token.replace(/^--/, '').split('-');
  return `--${parts[0]}`;
}

function getSimilarTokens(
  currentToken: string,
  allTokens: Map<string, string>,
): Array<{ name: string; value: string }> {
  const prefix = getTokenPrefix(currentToken);
  const similar: Array<{ name: string; value: string }> = [];

  for (const [name, value] of allTokens) {
    if (getTokenPrefix(name) === prefix) {
      similar.push({ name, value });
    }
  }

  // Sort alphabetically
  similar.sort((a, b) => a.name.localeCompare(b.name));
  return similar;
}

// ── Component ──

export function PropertyValueInput({ property, value, onChange, overridden }: PropertyValueInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);
  // Keep latest onChange in a ref so inline handlers always call the current version
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isColor = isColorProperty(property) || isColorValue(value);
  const numParsed = parseNumericValue(value);
  const varRef = parseVarReference(value);

  // Collect page tokens once (memoized)
  const pageTokens = useMemo(() => {
    if (!varRef) return new Map<string, string>();
    return collectPageTokens();
  }, [!!varRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const similarTokens = useMemo(() => {
    if (!varRef) return [];
    return getSimilarTokens(varRef.token, pageTokens);
  }, [varRef?.token, pageTokens]);

  // ── Color picker handler ──
  const handleSwatchClick = useCallback(() => {
    colorInputRef.current?.click();
  }, []);

  // ── Number stepper via keyboard ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (!numParsed) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = getStep(numParsed.unit, e.shiftKey);
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const newNum = Math.round((numParsed.num + step * dir) * 100) / 100;
      onChangeRef.current(`${newNum}${numParsed.unit}`);
    }
  }, [numParsed]);

  // ── Mouse wheel stepper ──
  const handleWheel = useCallback((e: WheelEvent) => {
    if (document.activeElement !== inputRef.current) return;
    if (!numParsed) return;
    e.preventDefault();
    const step = getStep(numParsed.unit, e.shiftKey);
    const dir = e.deltaY < 0 ? 1 : -1;
    const newNum = Math.round((numParsed.num + step * dir) * 100) / 100;
    onChangeRef.current(`${newNum}${numParsed.unit}`);
  }, [numParsed]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Scroll to the active token when dropdown opens
  useEffect(() => {
    if (tokenDropdownOpen && tokenDropdownRef.current) {
      const active = tokenDropdownRef.current.querySelector('.qa-sp-token-option.active');
      if (active) {
        active.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [tokenDropdownOpen]);

  return (
    <span className="qa-sp-pvi">
      {/* Color swatch */}
      {isColor && !overridden && (
        <>
          <span
            className="qa-sp-swatch"
            style={{ backgroundColor: value }}
            onClick={handleSwatchClick}
            title="Click to pick color"
          />
          <input
            ref={colorInputRef}
            type="color"
            className="qa-sp-color-input"
            value={colorToHex(value)}
            onChange={(e) => onChangeRef.current(e.target.value)}
          />
        </>
      )}

      {/* Token badge + dropdown */}
      {varRef && !overridden && (
        <>
          {/* Backdrop overlay to close dropdown on outside click */}
          {tokenDropdownOpen && (
            <div
              className="qa-sp-token-backdrop"
              onMouseDown={() => setTokenDropdownOpen(false)}
            />
          )}
          <span className="qa-sp-token-ref" style={tokenDropdownOpen ? { zIndex: 100 } : undefined}>
            <button
              type="button"
              className="qa-sp-token-badge"
              onMouseDown={(e) => {
                e.stopPropagation();
                setTokenDropdownOpen((p) => !p);
              }}
              title={`Token: ${varRef.token}`}
            >
              {varRef.token.replace(/^--/, '')}
            </button>

            {/* Token dropdown */}
            {tokenDropdownOpen && similarTokens.length > 0 && (
              <div ref={tokenDropdownRef} className="qa-sp-token-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                <div className="qa-sp-token-dropdown-title">
                  {similarTokens.length > 1
                    ? `${getTokenPrefix(varRef.token)}-* (${similarTokens.length})`
                    : varRef.token}
                </div>
                {similarTokens.map((t) => (
                  <button
                    type="button"
                    key={t.name}
                    className={`qa-sp-token-option ${t.name === varRef.token ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const fallback = varRef.fallback ? `, ${varRef.fallback}` : '';
                      onChangeRef.current(`var(${t.name}${fallback})`);
                      setTokenDropdownOpen(false);
                    }}
                  >
                    <span className="qa-sp-token-option-name">{t.name}</span>
                    <span className="qa-sp-token-option-value">
                      {isColorValue(t.value) && (
                        <span className="qa-sp-swatch-mini" style={{ backgroundColor: t.value }} />
                      )}
                      {t.value}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </span>
        </>
      )}

      {/* Main value input */}
      <input
        ref={inputRef}
        type="text"
        className={`qa-sp-pv ${numParsed ? 'qa-sp-pv-num' : ''}`}
        value={value}
        onChange={(e) => onChangeRef.current(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />

      {/* Numeric unit badge */}
      {numParsed && numParsed.unit && !overridden && (
        <span className="qa-sp-unit">{numParsed.unit}</span>
      )}
    </span>
  );
}

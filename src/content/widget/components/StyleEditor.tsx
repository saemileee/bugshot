import { useState, useEffect, useCallback, useRef } from 'react';
import { PropertyValueInput } from './PropertyValueInput';
import { PropertyNameInput } from './PropertyNameInput';
import { PropertyValueAutocomplete, PropertyValueAutocompleteHandle } from './PropertyValueAutocomplete';
import type { CDPStyleResult } from '@/shared/types/messages';

interface StyleEditorProps {
  element: Element;
  selector: string;
}

/* ── Shorthand property grouping ── */

interface ShorthandMapping {
  shorthand: string;
  longhands: string[];
  // How to combine values: 'box' (top/right/bottom/left), 'corner' (4 corners), 'pair' (2 values)
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

  // Border style 'none' means no border
  if (prop.includes('border') && prop.includes('style') && v === 'none') {
    return true;
  }

  // Padding/margin 0 is default
  if ((prop.startsWith('padding') || prop.startsWith('margin')) && (v === '0px' || v === '0')) {
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

    // Skip if all values are defaults (e.g., all padding-* are 0px)
    if (values.every((v, i) => isDefaultValue(mapping.longhands[i], v))) {
      mapping.longhands.forEach((name) => consumed.add(name));
      continue;
    }

    let shorthandValue: string;

    if (mapping.type === 'box' || mapping.type === 'corner') {
      // Box model: top, right, bottom, left
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

    result.push({
      property: mapping.shorthand,
      value: shorthandValue,
      priority: longhands[0].priority,
      overridden: overridden,
    });

    mapping.longhands.forEach((name) => consumed.add(name));
  }

  // Add remaining properties that weren't collapsed
  for (const p of props) {
    if (!consumed.has(p.property)) {
      // Skip default values for certain properties
      if (!isDefaultValue(p.property, p.value)) {
        result.push(p);
      }
    }
  }

  return result;
}

/* ── Fetch styles via CDP (Chrome DevTools Protocol) ── */

async function fetchStylesViaCDP(selector: string): Promise<CDPStyleResult | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_ELEMENT_STYLES', selector },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[StyleEditor] CDP fetch failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (response?.success && response.styles) {
          resolve(response.styles as CDPStyleResult);
        } else {
          console.warn('[StyleEditor] CDP fetch failed:', response?.error);
          resolve(null);
        }
      }
    );
  });
}

function convertCDPToBlocks(cdpResult: CDPStyleResult): StyleRuleBlock[] {
  const blocks: StyleRuleBlock[] = [];
  let blockId = 0;

  // Inline styles
  const inlineProps: RuleProperty[] = cdpResult.inlineStyles.map((s) => ({
    property: s.name,
    value: s.value,
    priority: '',
    overridden: false,
  }));
  blocks.push({
    id: `block-${blockId++}`,
    selector: 'element.style',
    source: '',
    properties: collapseToShorthand(inlineProps),
    isInline: true,
  });

  // Matched rules (CDP returns them in order, last = highest specificity)
  for (const rule of cdpResult.matchedRules.slice().reverse()) {
    const props: RuleProperty[] = rule.properties.map((p) => ({
      property: p.name,
      value: p.value,
      priority: p.important ? 'important' : '',
      overridden: false,
    }));

    // Collapse longhand properties to shorthand
    const collapsedProps = collapseToShorthand(props);

    // Skip blocks with no meaningful properties after filtering
    if (collapsedProps.length === 0) continue;

    blocks.push({
      id: `block-${blockId++}`,
      selector: rule.selector,
      source: rule.source,
      properties: collapsedProps,
      isInline: false,
    });
  }

  // Mark overridden properties (need to handle shorthand vs longhand conflicts)
  const winner = new Map<string, string>();
  for (const block of blocks) {
    for (const p of block.properties) {
      if (!winner.has(p.property) || block.isInline || p.priority === 'important') {
        winner.set(p.property, block.id);
      }
    }
  }
  for (const block of blocks) {
    for (const p of block.properties) {
      p.overridden = winner.get(p.property) !== block.id;
    }
  }

  return blocks;
}

interface RuleProperty {
  property: string;
  value: string;
  priority: string;
  overridden: boolean;
}

interface StyleRuleBlock {
  id: string;
  selector: string;
  source: string;
  properties: RuleProperty[];
  isInline: boolean;
}

/* ── Collect all matching CSS rule blocks ── */

function collectRuleBlocks(el: Element): StyleRuleBlock[] {
  const htmlEl = el as HTMLElement;
  const blocks: StyleRuleBlock[] = [];
  let blockId = 0;

  // 1. element.style (inline) — always first
  const inlineProps: RuleProperty[] = [];
  for (let i = 0; i < htmlEl.style.length; i++) {
    const prop = htmlEl.style.item(i);
    const val = htmlEl.style.getPropertyValue(prop).trim();
    const priority = htmlEl.style.getPropertyPriority(prop);
    if (val) inlineProps.push({ property: prop, value: val, priority, overridden: false });
  }
  blocks.push({
    id: `block-${blockId++}`,
    selector: 'element.style',
    source: '',
    properties: inlineProps,
    isInline: true,
  });

  // 2. Collect matching rules from all stylesheets
  function processRuleList(rules: CSSRuleList, source: string, context: string) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      // Grouping rules — recurse into children
      if (rule instanceof CSSMediaRule) {
        try {
          const ctx = `@media ${rule.conditionText || rule.media.mediaText}`;
          processRuleList(rule.cssRules, source, ctx);
        } catch { /* can't access sub-rules */ }
        continue;
      }
      if (rule instanceof CSSSupportsRule) {
        try {
          processRuleList(rule.cssRules, source, `@supports ${rule.conditionText}`);
        } catch {}
        continue;
      }
      // @layer blocks
      try {
        if ((rule as any).cssRules && !(rule instanceof CSSStyleRule)) {
          processRuleList((rule as any).cssRules, source, context);
          continue;
        }
      } catch {}

      // Style rules — check if matches our element
      if (!(rule instanceof CSSStyleRule)) continue;

      try {
        if (!el.matches(rule.selectorText)) continue;
      } catch {
        continue; // invalid or complex selector
      }

      const props: RuleProperty[] = [];
      const addedProps = new Set<string>();

      // Iterate declared properties
      for (let p = 0; p < rule.style.length; p++) {
        const prop = rule.style.item(p);
        const val = rule.style.getPropertyValue(prop).trim();
        const priority = rule.style.getPropertyPriority(prop);
        if (val) {
          props.push({ property: prop, value: val, priority, overridden: false });
          addedProps.add(prop);
        }
      }

      // Check shorthand properties that may not appear in iteration
      const SHORTHAND_PROPS = ['gap', 'margin', 'padding', 'border', 'background', 'font', 'flex', 'grid'];
      for (const shorthand of SHORTHAND_PROPS) {
        if (addedProps.has(shorthand)) continue;
        const val = rule.style.getPropertyValue(shorthand).trim();
        if (val) {
          const priority = rule.style.getPropertyPriority(shorthand);
          props.push({ property: shorthand, value: val, priority, overridden: false });
        }
      }

      if (props.length === 0) continue;

      let src = source;
      if (context) src = `${context} — ${src}`;

      blocks.push({
        id: `block-${blockId++}`,
        selector: rule.selectorText,
        source: src,
        properties: props,
        isInline: false,
      });
    }
  }

  // Iterate ALL stylesheets individually
  for (let s = 0; s < document.styleSheets.length; s++) {
    const sheet = document.styleSheets[s];
    let source: string;
    try {
      source = sheet.href ? (sheet.href.split('/').pop() || sheet.href) : `<style>#${s}`;
    } catch {
      source = `<style>#${s}`;
    }

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // CORS-blocked stylesheet — skip
      continue;
    }

    try {
      processRuleList(rules, source, '');
    } catch {
      // Error processing rules in this sheet — skip
    }
  }

  // 3. Reverse non-inline blocks (last matched = highest specificity → show first)
  const inlineBlock = blocks[0];
  const ruleBlocks = blocks.slice(1).reverse();

  // 4. Collapse longhand properties to shorthand for each block
  inlineBlock.properties = collapseToShorthand(inlineBlock.properties);
  for (const block of ruleBlocks) {
    block.properties = collapseToShorthand(block.properties);
  }

  // 5. Filter out empty blocks
  const filteredRuleBlocks = ruleBlocks.filter((b) => b.properties.length > 0);

  // 6. Mark overridden properties
  const winner = new Map<string, string>();
  // Inline wins first (unless !important elsewhere)
  for (const p of inlineBlock.properties) {
    winner.set(p.property, inlineBlock.id);
  }
  for (const block of filteredRuleBlocks) {
    for (const p of block.properties) {
      if (!winner.has(p.property)) {
        winner.set(p.property, block.id);
      } else if (p.priority === 'important' && winner.get(p.property) !== inlineBlock.id) {
        winner.set(p.property, block.id);
      }
    }
  }
  const allBlocks = [inlineBlock, ...filteredRuleBlocks];
  for (const block of allBlocks) {
    for (const p of block.properties) {
      p.overridden = winner.get(p.property) !== block.id;
    }
  }

  return allBlocks;
}

/* ── Computed styles fallback (when no rule blocks found) ── */

// Use shorthand properties where possible
const COMMON_PROPS = [
  'display', 'position', 'width', 'height', 'max-width', 'min-width',
  'padding', 'margin',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'background',
  'border', 'border-radius', 'border-color', 'border-style', 'border-width',
  'gap', 'flex-direction', 'align-items', 'justify-content',
  'opacity', 'overflow', 'z-index', 'box-shadow', 'text-align',
];

function getComputedBlock(el: Element): StyleRuleBlock {
  const computed = window.getComputedStyle(el);
  const props: RuleProperty[] = [];
  for (const prop of COMMON_PROPS) {
    const val = computed.getPropertyValue(prop).trim();
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto'
      && val !== '0px' && val !== 'rgba(0, 0, 0, 0)' && val !== 'rgb(0, 0, 0)') {
      props.push({ property: prop, value: val, priority: '', overridden: false });
    }
  }
  return {
    id: 'computed-block',
    selector: 'Computed',
    source: '(stylesheets not accessible)',
    properties: props,
    isInline: false,
  };
}

/* ── Component ── */

export function StyleEditor({ element, selector }: StyleEditorProps) {
  const [className, setClassName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [blocks, setBlocks] = useState<StyleRuleBlock[]>([]);
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropValue, setNewPropValue] = useState('');
  const [cdpSource, setCdpSource] = useState(false);
  const htmlEl = useRef<HTMLElement | null>(null);
  const valueInputRef = useRef<PropertyValueAutocompleteHandle>(null);

  useEffect(() => {
    htmlEl.current = element as HTMLElement;

    let cn = element.className;
    if (typeof cn !== 'string') cn = '';
    setClassName(cn.trim());

    let directText = '';
    for (let i = 0; i < element.childNodes.length; i++) {
      if (element.childNodes[i].nodeType === Node.TEXT_NODE) {
        directText += element.childNodes[i].textContent;
      }
    }
    setTextContent(directText.trim());

    // Try CDP first, fallback to direct DOM access
    let cancelled = false;
    (async () => {
      if (selector) {
        const cdpResult = await fetchStylesViaCDP(selector);
        if (!cancelled && cdpResult) {
          const cdpBlocks = convertCDPToBlocks(cdpResult);
          if (cdpBlocks.length > 1 || cdpBlocks[0].properties.length > 0) {
            setBlocks(cdpBlocks);
            setCdpSource(true);
            return;
          }
        }
      }

      if (cancelled) return;

      // Fallback to direct DOM access
      const collected = collectRuleBlocks(element);
      if (collected.length <= 1) {
        collected.push(getComputedBlock(element));
      }
      setBlocks(collected);
      setCdpSource(false);
    })();

    return () => { cancelled = true; };
  }, [element, selector]);

  const handleClassNameChange = useCallback((val: string) => {
    setClassName(val);
    if (htmlEl.current) htmlEl.current.className = val;
  }, []);

  const handleTextContentChange = useCallback((val: string) => {
    setTextContent(val);
    if (!htmlEl.current) return;
    for (let i = 0; i < htmlEl.current.childNodes.length; i++) {
      if (htmlEl.current.childNodes[i].nodeType === Node.TEXT_NODE) {
        htmlEl.current.childNodes[i].textContent = val;
        return;
      }
    }
    htmlEl.current.insertBefore(document.createTextNode(val), htmlEl.current.firstChild);
  }, []);

  const handleValueChange = useCallback((blockId: string, prop: string, val: string) => {
    if (!htmlEl.current) return;
    htmlEl.current.style.setProperty(prop, val);

    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              properties: b.properties.map((p) =>
                p.property === prop ? { ...p, value: val } : p
              ),
            }
          : b
      )
    );
  }, []);

  const handleAddProperty = useCallback((submittedValue?: string) => {
    const prop = newPropName.trim();
    const val = (submittedValue ?? newPropValue).trim();
    if (!prop || !htmlEl.current) return;

    htmlEl.current.style.setProperty(prop, val);

    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, properties: [...b.properties] }));
      const inlineBlock = next.find((b) => b.isInline)!;
      if (!inlineBlock.properties.some((p) => p.property === prop)) {
        inlineBlock.properties.push({
          property: prop, value: val, priority: '', overridden: false,
        });
      }
      return next;
    });

    setNewPropName('');
    setNewPropValue('');
    setAddingToBlock(null);
  }, [newPropName, newPropValue]);

  const ruleCount = blocks.filter((b) => !b.isInline).length;

  return (
    <div className="qa-sp">
      {/* className */}
      <div className="qa-sp-field">
        <span className="qa-sp-field-label">.cls</span>
        <input
          type="text"
          className="qa-sp-class-input"
          value={className}
          onChange={(e) => handleClassNameChange(e.target.value)}
          placeholder="(no class)"
          spellCheck={false}
        />
      </div>

      {/* textContent */}
      {textContent !== '' && (
        <div className="qa-sp-field">
          <span className="qa-sp-field-label">text</span>
          <input
            type="text"
            className="qa-sp-class-input"
            value={textContent}
            onChange={(e) => handleTextContentChange(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="qa-sp-bar">
        <span>{ruleCount} matched rule{ruleCount !== 1 ? 's' : ''}</span>
        <span>
          {cdpSource ? 'CDP' : `${document.styleSheets.length} stylesheet${document.styleSheets.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Rule blocks */}
      <div className="qa-sp-scroll">
        {blocks.map((block) => (
          <div key={block.id} className="qa-sp-rule">
            <div className="qa-sp-rule-header">
              <span className={`qa-sp-sel ${block.isInline ? 'qa-sp-sel-inline' : ''}`}>
                {block.selector}
              </span>
              {block.source && <span className="qa-sp-src">{block.source}</span>}
            </div>

            <div className="qa-sp-body">
              {block.properties.map((p, i) => (
                <div key={`${p.property}-${i}`} className={`qa-sp-prop ${p.overridden ? 'qa-sp-over' : ''}`}>
                  <span className={`qa-sp-pn ${p.property.startsWith('--') ? 'qa-sp-pn-tok' : ''}`}>
                    {p.property}
                  </span>
                  <span className="qa-sp-c">:</span>
                  <PropertyValueInput
                    property={p.property}
                    value={p.value}
                    onChange={(val) => handleValueChange(block.id, p.property, val)}
                    overridden={p.overridden}
                  />
                  {p.priority === 'important' && <span className="qa-sp-imp">!important</span>}
                  <span className="qa-sp-sc">;</span>
                </div>
              ))}

              {/* Add property */}
              {addingToBlock === block.id ? (
                <div className="qa-sp-add">
                  <PropertyNameInput
                    value={newPropName}
                    onChange={setNewPropName}
                    onSelect={(name) => {
                      setNewPropName(name);
                      // Focus the value input after selecting property
                      setTimeout(() => valueInputRef.current?.focus(), 0);
                    }}
                    onEscape={() => setAddingToBlock(null)}
                  />
                  <span className="qa-sp-c">:</span>
                  <PropertyValueAutocomplete
                    ref={valueInputRef}
                    property={newPropName}
                    value={newPropValue}
                    onChange={setNewPropValue}
                    onSubmit={handleAddProperty}
                    onEscape={() => setAddingToBlock(null)}
                  />
                  <span className="qa-sp-sc">;</span>
                </div>
              ) : (
                <button
                  className="qa-sp-add-btn"
                  onClick={() => { setAddingToBlock(block.id); setNewPropName(''); setNewPropValue(''); }}
                >
                  + property
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

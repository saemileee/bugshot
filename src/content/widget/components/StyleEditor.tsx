import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PropertyValueInput } from './PropertyValueInput';
import { PropertyNameInput } from './PropertyNameInput';
import { PropertyValueAutocomplete, PropertyValueAutocompleteHandle } from './PropertyValueAutocomplete';
import type { CDPStyleResult } from '@/shared/types/messages';
import { cn } from '@/shared/utils/cn';

interface StyleEditorProps {
  element: Element;
}

/* ── Selector builder for CDP ── */

function escapeCSSIdentifier(str: string): string {
  return str.replace(/([[\]!/:@.#()'"*+,;\\<=>^`{|}~])/g, '\\$1');
}

function isSafeClassName(className: string): boolean {
  if (className.includes('[')) return false;
  if (className.includes('(')) return false;
  if (className.length > 40) return false;
  if (/^[!@#$%^&*()+=]/.test(className)) return false;
  return true;
}

function buildSelectorForElement(el: Element): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && parts.length < 5) {
    let s = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift('#' + escapeCSSIdentifier(current.id));
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const safeClasses = current.className
        .trim()
        .split(/\s+/)
        .filter(isSafeClassName)
        .slice(0, 2)
        .map(escapeCSSIdentifier)
        .join('.');
      if (safeClasses) s += '.' + safeClasses;
    }
    parts.unshift(s);
    current = current.parentElement;
  }

  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase();
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

  // Only filter border-style: none (all sides must be none for shorthand)
  // This is checked AFTER collapse, so we check the shorthand property
  if (prop === 'border-style' && v === 'none') {
    return true;
  }

  // Only filter padding/margin when ALL sides are 0
  // This is checked AFTER collapse, so we check the shorthand property
  if ((prop === 'padding' || prop === 'margin') && (v === '0px' || v === '0')) {
    return true;
  }

  return false;
}

function collapseToShorthand(props: RuleProperty[]): RuleProperty[] {
  // First, deduplicate input (last value wins)
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

    // Mark longhands as consumed
    mapping.longhands.forEach((name) => consumed.add(name));

    // Skip if the collapsed shorthand is a default value (e.g., padding: 0px, border-style: none)
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

/* ── Fetch styles via CDP (Chrome DevTools Protocol) ── */

async function fetchStylesViaCDP(selector: string): Promise<CDPStyleResult | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_ELEMENT_STYLES', selector },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[StyleEditor] CDP request failed:', chrome.runtime.lastError.message);
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

/* ── Component ── */

export function StyleEditor({ element }: StyleEditorProps) {
  const [className, setClassName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [blocks, setBlocks] = useState<StyleRuleBlock[]>([]);
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropValue, setNewPropValue] = useState('');
  const [cdpError, setCdpError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const htmlEl = useRef<HTMLElement | null>(null);
  const valueInputRef = useRef<PropertyValueAutocompleteHandle>(null);

  // Generate selector from element directly to avoid timing issues
  const selector = useMemo(() => buildSelectorForElement(element), [element]);

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

    // Fetch styles via CDP (no fallback - show error if CDP fails)
    let cancelled = false;
    setIsLoading(true);
    setCdpError(null);

    (async () => {
      if (!selector) {
        if (!cancelled) {
          setCdpError('No selector available for this element');
          setIsLoading(false);
        }
        return;
      }

      const cdpResult = await fetchStylesViaCDP(selector);
      if (cancelled) return;

      if (!cdpResult) {
        setCdpError('CDP connection failed. Try closing DevTools or refreshing the page.');
        setIsLoading(false);
        return;
      }

      const cdpBlocks = convertCDPToBlocks(cdpResult);
      setBlocks(cdpBlocks);
      setIsLoading(false);
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
    <div className="flex flex-col min-h-0 flex-1">
      {/* className */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <span className="text-[11px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-px rounded flex-shrink-0">.cls</span>
        <input
          type="text"
          className="flex-1 font-mono text-[11px] border-none outline-none bg-transparent text-slate-800 px-1 py-0.5 rounded min-w-0 focus:bg-white focus:shadow-[0_0_0_1px_#93c5fd]"
          value={className}
          onChange={(e) => handleClassNameChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="(no class)"
          spellCheck={false}
        />
      </div>

      {/* textContent */}
      {textContent !== '' && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
          <span className="text-[11px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-px rounded flex-shrink-0">text</span>
          <input
            type="text"
            className="flex-1 font-mono text-[11px] border-none outline-none bg-transparent text-slate-800 px-1 py-0.5 rounded min-w-0 focus:bg-white focus:shadow-[0_0_0_1px_#93c5fd]"
            value={textContent}
            onChange={(e) => handleTextContentChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-6 px-4 text-center text-gray-500 text-[13px]">Loading styles...</div>
      )}

      {/* Error state */}
      {cdpError && (
        <div className="flex items-start gap-2 p-3 m-2 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs leading-relaxed">
          <span className="flex-shrink-0 text-sm">⚠</span>
          <span>{cdpError}</span>
        </div>
      )}

      {/* Filter bar */}
      {!isLoading && !cdpError && (
        <div className="flex items-center justify-between px-2 py-0.5 border-b border-gray-200 bg-slate-100 text-[10px] text-gray-500">
          <span>{ruleCount} matched rule{ruleCount !== 1 ? 's' : ''}</span>
          <span>CDP</span>
        </div>
      )}

      {/* Rule blocks */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {!isLoading && !cdpError && blocks.map((block) => (
          <div key={block.id} className="border-b border-gray-200">
            <div className="flex items-baseline justify-between px-2 py-1 bg-gray-50 gap-2">
              <span className={cn(
                'font-mono text-[11px] font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0',
                block.isInline ? 'text-gray-400 italic' : 'text-purple-800'
              )}>
                {block.selector}
              </span>
              {block.source && <span className="text-[10px] text-gray-400 flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap max-w-[140px]">{block.source}</span>}
            </div>

            <div className="py-0.5 px-2 pl-4">
              {block.properties.map((p, i) => (
                <div key={`${p.property}-${i}`} className={cn(
                  'flex items-baseline py-px leading-relaxed font-mono text-[11px]',
                  p.overridden && 'opacity-45 [&_.prop-name]:line-through [&_.prop-value]:line-through'
                )}>
                  <span className={cn(
                    'prop-name flex-shrink-0 whitespace-nowrap',
                    p.property.startsWith('--') ? 'text-violet-600' : 'text-blue-800'
                  )}>
                    {p.property}
                  </span>
                  <span className="text-gray-400 mr-0.5 flex-shrink-0">:</span>
                  <PropertyValueInput
                    property={p.property}
                    value={p.value}
                    onChange={(val) => handleValueChange(block.id, p.property, val)}
                    overridden={p.overridden}
                  />
                  {p.priority === 'important' && <span className="text-red-600 text-[10px] ml-0.5 flex-shrink-0">!important</span>}
                  <span className="text-gray-400 flex-shrink-0">;</span>
                </div>
              ))}

              {/* Add property */}
              {addingToBlock === block.id ? (
                <div className="flex items-baseline py-px font-mono text-[11px]">
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
                  <span className="text-gray-400 mr-0.5">:</span>
                  <PropertyValueAutocomplete
                    ref={valueInputRef}
                    property={newPropName}
                    value={newPropValue}
                    onChange={setNewPropValue}
                    onSubmit={handleAddProperty}
                    onEscape={() => setAddingToBlock(null)}
                  />
                  <span className="text-gray-400">;</span>
                </div>
              ) : (
                <button
                  className="inline-block font-mono text-[10px] text-gray-500 bg-transparent border-none cursor-pointer px-1 py-0.5 mt-px rounded hover:text-blue-500 hover:bg-blue-50"
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

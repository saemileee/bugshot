import { useState, useEffect, useCallback, useRef } from 'react';

interface StyleEditorProps {
  element: Element;
  selector: string;
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
      for (let p = 0; p < rule.style.length; p++) {
        const prop = rule.style.item(p);
        const val = rule.style.getPropertyValue(prop).trim();
        const priority = rule.style.getPropertyPriority(prop);
        if (val) props.push({ property: prop, value: val, priority, overridden: false });
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

  // 4. Mark overridden properties
  const winner = new Map<string, string>();
  // Inline wins first (unless !important elsewhere)
  for (const p of inlineBlock.properties) {
    winner.set(p.property, inlineBlock.id);
  }
  for (const block of ruleBlocks) {
    for (const p of block.properties) {
      if (!winner.has(p.property)) {
        winner.set(p.property, block.id);
      } else if (p.priority === 'important' && winner.get(p.property) !== inlineBlock.id) {
        winner.set(p.property, block.id);
      }
    }
  }
  const allBlocks = [inlineBlock, ...ruleBlocks];
  for (const block of allBlocks) {
    for (const p of block.properties) {
      p.overridden = winner.get(p.property) !== block.id;
    }
  }

  return allBlocks;
}

/* ── Computed styles fallback (when no rule blocks found) ── */

const COMMON_PROPS = [
  'display', 'position', 'width', 'height', 'max-width', 'min-width',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'background',
  'border', 'border-radius', 'border-color',
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

export function StyleEditor({ element }: StyleEditorProps) {
  const [className, setClassName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [blocks, setBlocks] = useState<StyleRuleBlock[]>([]);
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropValue, setNewPropValue] = useState('');
  const htmlEl = useRef<HTMLElement | null>(null);

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

    const collected = collectRuleBlocks(element);
    // If only inline block found (no rule blocks), add computed fallback
    if (collected.length <= 1) {
      collected.push(getComputedBlock(element));
    }
    setBlocks(collected);
  }, [element]);

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

  const handleAddProperty = useCallback(() => {
    const prop = newPropName.trim();
    const val = newPropValue.trim();
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
        <span>{document.styleSheets.length} stylesheet{document.styleSheets.length !== 1 ? 's' : ''}</span>
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
                  <input
                    type="text"
                    className="qa-sp-pv"
                    value={p.value}
                    onChange={(e) => handleValueChange(block.id, p.property, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    spellCheck={false}
                  />
                  {p.priority === 'important' && <span className="qa-sp-imp">!important</span>}
                  <span className="qa-sp-sc">;</span>
                </div>
              ))}

              {/* Add property */}
              {addingToBlock === block.id ? (
                <div className="qa-sp-add">
                  <input
                    className="qa-sp-add-n"
                    placeholder="property"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).nextElementSibling?.nextElementSibling
                        && ((e.target as HTMLInputElement).nextElementSibling!.nextElementSibling as HTMLInputElement)?.focus();
                      if (e.key === 'Escape') setAddingToBlock(null);
                    }}
                    spellCheck={false}
                    autoFocus
                  />
                  <span className="qa-sp-c">:</span>
                  <input
                    className="qa-sp-add-v"
                    placeholder="value"
                    value={newPropValue}
                    onChange={(e) => setNewPropValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddProperty();
                      if (e.key === 'Escape') setAddingToBlock(null);
                    }}
                    spellCheck={false}
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

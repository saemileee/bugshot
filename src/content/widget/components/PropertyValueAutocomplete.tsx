import { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/shared/utils/cn';

// CSS property value suggestions
const CSS_VALUE_MAP: Record<string, string[]> = {
  // Display
  'display': ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'flow-root', 'table', 'table-row', 'table-cell'],

  // Position
  'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],

  // Flexbox
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end'],
  'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
  'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
  'align-content': ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'start', 'end'],

  // Grid
  'justify-items': ['start', 'end', 'center', 'stretch'],
  'place-items': ['start', 'end', 'center', 'stretch'],
  'place-content': ['start', 'end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly'],

  // Box sizing
  'box-sizing': ['content-box', 'border-box'],

  // Overflow
  'overflow': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  'overflow-x': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  'overflow-y': ['visible', 'hidden', 'clip', 'scroll', 'auto'],

  // Visibility
  'visibility': ['visible', 'hidden', 'collapse'],

  // Float & Clear
  'float': ['none', 'left', 'right', 'inline-start', 'inline-end'],
  'clear': ['none', 'left', 'right', 'both', 'inline-start', 'inline-end'],

  // Text
  'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
  'text-decoration': ['none', 'underline', 'overline', 'line-through'],
  'text-decoration-line': ['none', 'underline', 'overline', 'line-through'],
  'text-decoration-style': ['solid', 'double', 'dotted', 'dashed', 'wavy'],
  'text-transform': ['none', 'capitalize', 'uppercase', 'lowercase'],
  'text-overflow': ['clip', 'ellipsis'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
  'word-break': ['normal', 'break-all', 'keep-all', 'break-word'],
  'word-wrap': ['normal', 'break-word'],
  'overflow-wrap': ['normal', 'break-word', 'anywhere'],
  'vertical-align': ['baseline', 'sub', 'super', 'text-top', 'text-bottom', 'middle', 'top', 'bottom'],

  // Font
  'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
  'font-style': ['normal', 'italic', 'oblique'],
  'font-variant': ['normal', 'small-caps'],
  'font-stretch': ['normal', 'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'],

  // Border
  'border-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-top-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-right-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-bottom-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-left-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-collapse': ['separate', 'collapse'],

  // Background
  'background-repeat': ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'],
  'background-position': ['left', 'center', 'right', 'top', 'bottom'],
  'background-size': ['auto', 'cover', 'contain'],
  'background-attachment': ['scroll', 'fixed', 'local'],
  'background-clip': ['border-box', 'padding-box', 'content-box', 'text'],
  'background-origin': ['border-box', 'padding-box', 'content-box'],
  'background-blend-mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'],

  // List
  'list-style-type': ['none', 'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha'],
  'list-style-position': ['inside', 'outside'],

  // Cursor
  'cursor': ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing', 'col-resize', 'row-resize', 'n-resize', 's-resize', 'e-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out'],

  // Pointer events
  'pointer-events': ['auto', 'none', 'visiblePainted', 'visibleFill', 'visibleStroke', 'visible', 'painted', 'fill', 'stroke', 'all'],

  // User select
  'user-select': ['auto', 'none', 'text', 'all', 'contain'],

  // Resize
  'resize': ['none', 'both', 'horizontal', 'vertical', 'block', 'inline'],

  // Object fit
  'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
  'object-position': ['top', 'right', 'bottom', 'left', 'center'],

  // Transform
  'transform-style': ['flat', 'preserve-3d'],
  'backface-visibility': ['visible', 'hidden'],

  // Animation
  'animation-direction': ['normal', 'reverse', 'alternate', 'alternate-reverse'],
  'animation-fill-mode': ['none', 'forwards', 'backwards', 'both'],
  'animation-play-state': ['running', 'paused'],
  'animation-timing-function': ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'],

  // Transition
  'transition-timing-function': ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'],

  // Mix blend mode
  'mix-blend-mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'],

  // Isolation
  'isolation': ['auto', 'isolate'],

  // Table
  'table-layout': ['auto', 'fixed'],
  'caption-side': ['top', 'bottom'],
  'empty-cells': ['show', 'hide'],

  // Writing mode
  'writing-mode': ['horizontal-tb', 'vertical-rl', 'vertical-lr'],
  'direction': ['ltr', 'rtl'],

  // Scroll
  'scroll-behavior': ['auto', 'smooth'],
  'scroll-snap-type': ['none', 'x mandatory', 'x proximity', 'y mandatory', 'y proximity', 'both mandatory', 'both proximity'],
  'scroll-snap-align': ['none', 'start', 'end', 'center'],
  'overscroll-behavior': ['auto', 'contain', 'none'],
  'overscroll-behavior-x': ['auto', 'contain', 'none'],
  'overscroll-behavior-y': ['auto', 'contain', 'none'],

  // Touch
  'touch-action': ['auto', 'none', 'pan-x', 'pan-y', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'pinch-zoom', 'manipulation'],

  // Will change
  'will-change': ['auto', 'scroll-position', 'contents', 'transform', 'opacity'],

  // Contain
  'contain': ['none', 'strict', 'content', 'size', 'layout', 'style', 'paint'],

  // Aspect ratio
  'aspect-ratio': ['auto', '1/1', '4/3', '16/9', '21/9'],

  // Generic values that apply to many properties
  '_generic': ['inherit', 'initial', 'unset', 'revert'],
};

// Common length/size values
const SIZE_VALUES = ['0', 'auto', '100%', '50%', '100vw', '100vh', 'fit-content', 'min-content', 'max-content'];

// Properties that accept size values
const SIZE_PROPERTIES = new Set([
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'top', 'right', 'bottom', 'left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'grid-gap',
  'flex-basis',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'outline-width', 'outline-offset',
  'font-size', 'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
]);

function getValuesForProperty(property: string): string[] {
  const values = CSS_VALUE_MAP[property] || [];
  const generic = CSS_VALUE_MAP['_generic'] || [];

  if (SIZE_PROPERTIES.has(property)) {
    return [...values, ...SIZE_VALUES, ...generic];
  }

  return [...values, ...generic];
}

export interface PropertyValueAutocompleteHandle {
  focus: () => void;
}

interface PropertyValueAutocompleteProps {
  property: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;  // Pass value directly to avoid state timing issues
  onEscape: () => void;
}

export const PropertyValueAutocomplete = forwardRef<PropertyValueAutocompleteHandle, PropertyValueAutocompleteProps>(
  function PropertyValueAutocomplete({ property, value, onChange, onSubmit, onEscape }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [hasTyped, setHasTyped] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => {
        setHasTyped(false); // Reset on focus
        inputRef.current?.focus();
      },
    }));

    const allValues = useMemo(() => getValuesForProperty(property), [property]);

    const filteredValues = useMemo(() => {
      const query = value.toLowerCase().trim();
      if (!query) return allValues.slice(0, 12);

      const prefixMatches: string[] = [];
      const includesMatches: string[] = [];

      for (const val of allValues) {
        if (val.toLowerCase().startsWith(query)) {
          prefixMatches.push(val);
        } else if (val.toLowerCase().includes(query)) {
          includesMatches.push(val);
        }
      }

      return [...prefixMatches, ...includesMatches].slice(0, 12);
    }, [value, allValues]);

    // Only open dropdown when user has typed something
    useEffect(() => {
      if (hasTyped && allValues.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
      }
    }, [value, allValues.length, hasTyped]);

    useEffect(() => {
      if (!isOpen || !dropdownRef.current) return;
      const items = dropdownRef.current.querySelectorAll('[data-item]');
      const highlighted = items[highlightedIndex];
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }, [highlightedIndex, isOpen]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isOpen && filteredValues.length > 0 && highlightedIndex < filteredValues.length) {
          const selectedValue = filteredValues[highlightedIndex];
          onChange(selectedValue);
          setIsOpen(false);
          onSubmit(selectedValue); // Pass value directly
        } else {
          onSubmit(value); // Pass current value
        }
        return;
      }

      if (e.key === 'Tab') {
        if (isOpen && filteredValues.length > 0) {
          e.preventDefault();
          onChange(filteredValues[highlightedIndex]);
          setIsOpen(false);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen && allValues.length > 0) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) =>
            prev < filteredValues.length - 1 ? prev + 1 : prev
          );
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
    }, [filteredValues, highlightedIndex, isOpen, allValues.length, value, onChange, onSubmit, onEscape]);

    const handleItemClick = useCallback((val: string) => {
      onChange(val);
      setIsOpen(false);
      inputRef.current?.focus();
    }, [onChange]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setHasTyped(true);
      onChange(e.target.value);
    }, [onChange]);

    const showDropdown = isOpen && filteredValues.length > 0 && allValues.length > 0;

    return (
      <span className="relative inline-flex">
        <input
          ref={inputRef}
          className="border-none outline-none font-mono text-[11px] bg-amber-50 px-0.5 py-px rounded min-w-[50px] flex-1 text-slate-800 focus:shadow-[0_0_0_1px_#93c5fd] focus:bg-white"
          placeholder="value"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          spellCheck={false}
          autoComplete="off"
        />

        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 z-[100] min-w-[140px] max-w-[200px] max-h-[200px] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg mt-0.5 p-1"
          >
            {filteredValues.map((val, index) => (
              <button
                key={val}
                type="button"
                data-item
                className={cn(
                  'block w-full px-2 py-1 border-none bg-transparent cursor-pointer rounded text-left font-mono text-[11px] text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis',
                  index === highlightedIndex && 'bg-blue-50'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleItemClick(val);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {highlightQuery(val, value)}
              </button>
            ))}
          </div>
        )}
      </span>
    );
  }
);

function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="text-blue-600 font-semibold bg-blue-100 rounded px-px">{text.slice(index, index + lowerQuery.length)}</span>
      {text.slice(index + lowerQuery.length)}
    </>
  );
}

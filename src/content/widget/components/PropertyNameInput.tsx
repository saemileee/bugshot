import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// Commonly used CSS properties for autocomplete
const CSS_PROPERTIES = [
  // Layout
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'float', 'clear', 'visibility', 'overflow', 'overflow-x', 'overflow-y',

  // Flexbox
  'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'align-content', 'order',

  // Grid
  'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-column', 'grid-row', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
  'grid-area', 'grid-gap', 'gap', 'row-gap', 'column-gap',
  'justify-items', 'place-items', 'place-content', 'place-self',

  // Box Model
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'box-sizing', 'aspect-ratio',

  // Border
  'border', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-collapse', 'border-spacing',

  // Background
  'background', 'background-color', 'background-image', 'background-position',
  'background-size', 'background-repeat', 'background-attachment', 'background-clip',
  'background-origin', 'background-blend-mode',

  // Typography
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-variant', 'font-stretch', 'line-height', 'letter-spacing', 'word-spacing',
  'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-color',
  'text-decoration-style', 'text-transform', 'text-indent', 'text-shadow',
  'text-overflow', 'white-space', 'word-break', 'word-wrap', 'overflow-wrap',
  'vertical-align', 'direction', 'writing-mode',

  // List
  'list-style', 'list-style-type', 'list-style-position', 'list-style-image',

  // Table
  'table-layout', 'caption-side', 'empty-cells',

  // Effects
  'opacity', 'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode',

  // Transform
  'transform', 'transform-origin', 'transform-style', 'perspective', 'perspective-origin',

  // Transition & Animation
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  'animation-fill-mode', 'animation-play-state',

  // Outline
  'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset',

  // Cursor & Pointer
  'cursor', 'pointer-events', 'user-select', 'touch-action',

  // Scroll
  'scroll-behavior', 'scroll-margin', 'scroll-padding', 'scroll-snap-type', 'scroll-snap-align',
  'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y',

  // Columns
  'columns', 'column-count', 'column-width', 'column-rule',

  // Other
  'content', 'quotes', 'counter-reset', 'counter-increment',
  'resize', 'object-fit', 'object-position', 'clip-path', 'mask',
  'will-change', 'contain', 'isolation', 'caret-color', 'accent-color',
];

interface PropertyNameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onEscape: () => void;
}

export function PropertyNameInput({ value, onChange, onSelect, onEscape }: PropertyNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Filter properties based on input value
  const filteredProperties = useMemo(() => {
    const query = value.toLowerCase().trim();
    if (!query) return CSS_PROPERTIES.slice(0, 15); // Show first 15 when empty

    // Exact prefix match first, then includes
    const prefixMatches: string[] = [];
    const includesMatches: string[] = [];

    for (const prop of CSS_PROPERTIES) {
      if (prop.startsWith(query)) {
        prefixMatches.push(prop);
      } else if (prop.includes(query)) {
        includesMatches.push(prop);
      }
    }

    return [...prefixMatches, ...includesMatches].slice(0, 15);
  }, [value]);

  // Open dropdown when user starts typing
  useEffect(() => {
    setIsOpen(true);
    setHighlightedIndex(0);
  }, [value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('.qa-sp-autocomplete-item');
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
      if (isOpen && filteredProperties.length > 0) {
        onSelect(filteredProperties[highlightedIndex]);
      } else if (value.trim()) {
        onSelect(value.trim());
      }
      return;
    }

    if (e.key === 'Tab') {
      if (isOpen && filteredProperties.length > 0) {
        e.preventDefault();
        onSelect(filteredProperties[highlightedIndex]);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredProperties.length - 1 ? prev + 1 : prev
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
  }, [filteredProperties, highlightedIndex, isOpen, value, onSelect, onEscape]);

  const handleItemClick = useCallback((prop: string) => {
    onSelect(prop);
  }, [onSelect]);

  return (
    <span className="qa-sp-autocomplete-wrap">
      <input
        ref={inputRef}
        className="qa-sp-add-n"
        placeholder="property"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // Delay close so click events on dropdown items can fire
          setTimeout(() => setIsOpen(false), 150);
        }}
        spellCheck={false}
        autoFocus
        autoComplete="off"
      />

      {isOpen && filteredProperties.length > 0 && (
        <div ref={dropdownRef} className="qa-sp-autocomplete-dropdown">
          {filteredProperties.map((prop, index) => (
            <button
              key={prop}
              type="button"
              className={`qa-sp-autocomplete-item ${index === highlightedIndex ? 'highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                handleItemClick(prop);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {highlightQuery(prop, value)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// Helper to highlight matching text
function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="qa-sp-autocomplete-match">{text.slice(index, index + lowerQuery.length)}</span>
      {text.slice(index + lowerQuery.length)}
    </>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  avatarUrl?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyLabel = 'None',
  loading = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Filter options based on search
  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.subLabel?.toLowerCase().includes(search.toLowerCase())
  );

  // All selectable items: empty option (index 0) + filtered options
  const totalItems = filteredOptions.length + 1;

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('.qa-searchable-select-option');
      const item = items[highlightedIndex];
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setSearch('');
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  }, []);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        // Empty option selected
        handleSelect('');
      } else if (highlightedIndex > 0 && highlightedIndex <= filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex - 1].value);
      } else if (filteredOptions.length > 0) {
        // No highlight, select first filtered option
        handleSelect(filteredOptions[0].value);
      }
    }
  }, [filteredOptions, totalItems, highlightedIndex, handleSelect, handleClose]);

  return (
    <div className="qa-searchable-select">
      {/* Backdrop for closing dropdown */}
      {isOpen && (
        <div
          className="qa-searchable-select-backdrop"
          onClick={handleClose}
        />
      )}

      {/* Display selected value or trigger */}
      {!isOpen ? (
        <button
          type="button"
          className="qa-searchable-select-trigger"
          onClick={handleOpen}
        >
          {selectedOption ? (
            <div className="qa-searchable-select-value">
              {selectedOption.avatarUrl && (
                <img src={selectedOption.avatarUrl} alt="" className="qa-searchable-select-avatar" />
              )}
              <span>{selectedOption.label}</span>
            </div>
          ) : (
            <span className="qa-searchable-select-placeholder">{emptyLabel}</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="qa-searchable-select-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
        />
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="qa-searchable-select-dropdown" ref={dropdownRef}>
          {loading ? (
            <div className="qa-searchable-select-loading">Loading...</div>
          ) : (
            <>
              {/* Empty option */}
              <button
                type="button"
                className={`qa-searchable-select-option ${!value ? 'selected' : ''} ${highlightedIndex === 0 ? 'highlighted' : ''}`}
                onClick={() => handleSelect('')}
                onMouseEnter={() => setHighlightedIndex(0)}
              >
                <span className="qa-searchable-select-option-label">{emptyLabel}</span>
              </button>

              {filteredOptions.length === 0 && search && (
                <div className="qa-searchable-select-empty">No results</div>
              )}

              {filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={`qa-searchable-select-option ${option.value === value ? 'selected' : ''} ${highlightedIndex === index + 1 ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index + 1)}
                >
                  {option.avatarUrl && (
                    <img src={option.avatarUrl} alt="" className="qa-searchable-select-avatar" />
                  )}
                  <div className="qa-searchable-select-option-content">
                    <span className="qa-searchable-select-option-label">{option.label}</span>
                    {option.subLabel && (
                      <span className="qa-searchable-select-option-sublabel">{option.subLabel}</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

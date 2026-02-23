import { useState, useRef, useEffect, useCallback } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Filter options based on search
  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.subLabel?.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter' && filteredOptions.length > 0) {
      handleSelect(filteredOptions[0].value);
    }
  }, [filteredOptions, handleSelect]);

  return (
    <div className="qa-searchable-select" ref={containerRef}>
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
        <div className="qa-searchable-select-dropdown">
          {loading ? (
            <div className="qa-searchable-select-loading">Loading...</div>
          ) : (
            <>
              {/* Empty option */}
              <button
                type="button"
                className={`qa-searchable-select-option ${!value ? 'selected' : ''}`}
                onClick={() => handleSelect('')}
              >
                <span className="qa-searchable-select-option-label">{emptyLabel}</span>
              </button>

              {filteredOptions.length === 0 && search && (
                <div className="qa-searchable-select-empty">No results</div>
              )}

              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`qa-searchable-select-option ${option.value === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
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

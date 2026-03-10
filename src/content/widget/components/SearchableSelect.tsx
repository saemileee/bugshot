import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/shared/utils/cn';
import { ChevronDown } from 'lucide-react';

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

  // Filter options based on search (memoized to avoid re-filtering on unrelated re-renders)
  const filteredOptions = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return options.filter((o) =>
      o.label.toLowerCase().includes(lowerSearch) ||
      o.subLabel?.toLowerCase().includes(lowerSearch)
    );
  }, [options, search]);

  // All selectable items: empty option (index 0) + filtered options
  const totalItems = filteredOptions.length + 1;

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-option]');
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
    // Prevent host page from intercepting keystrokes (e.g., GitHub's "/" shortcut)
    e.stopPropagation();

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
    <div className="relative w-full">
      {/* Backdrop for closing dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={handleClose}
        />
      )}

      {/* Display selected value or trigger */}
      {!isOpen ? (
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-slate-800 cursor-pointer text-left transition-colors hover:border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          onClick={handleOpen}
        >
          {selectedOption ? (
            <div className="flex items-center gap-2 overflow-hidden">
              {selectedOption.avatarUrl && (
                <img src={selectedOption.avatarUrl} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
              )}
              <span>{selectedOption.label}</span>
            </div>
          ) : (
            <span className="text-gray-400">{emptyLabel}</span>
          )}
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="w-full px-2.5 py-1.5 bg-white border border-blue-500 rounded-md text-xs text-slate-800 outline-none ring-2 ring-blue-500/10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
        />
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 max-h-[200px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-[100]"
        >
          {loading ? (
            <div className="p-3 text-xs text-gray-500 text-center">Loading...</div>
          ) : (
            <>
              {/* Empty option */}
              <button
                type="button"
                data-option
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 bg-transparent border-none text-xs text-slate-800 text-left cursor-pointer transition-colors',
                  !value && 'bg-blue-50 text-blue-500',
                  highlightedIndex === 0 && 'bg-gray-100',
                  highlightedIndex === 0 && !value && 'bg-blue-100'
                )}
                onClick={() => handleSelect('')}
                onMouseEnter={() => setHighlightedIndex(0)}
              >
                <span className="font-medium">{emptyLabel}</span>
              </button>

              {filteredOptions.length === 0 && search && (
                <div className="p-3 text-xs text-gray-500 text-center">No results</div>
              )}

              {filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  data-option
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 bg-transparent border-none text-xs text-slate-800 text-left cursor-pointer transition-colors',
                    option.value === value && 'bg-blue-50 text-blue-500',
                    highlightedIndex === index + 1 && 'bg-gray-100',
                    highlightedIndex === index + 1 && option.value === value && 'bg-blue-100'
                  )}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index + 1)}
                >
                  {option.avatarUrl && (
                    <img src={option.avatarUrl} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                  )}
                  <div className="flex flex-col gap-px overflow-hidden">
                    <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{option.label}</span>
                    {option.subLabel && (
                      <span className="text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{option.subLabel}</span>
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

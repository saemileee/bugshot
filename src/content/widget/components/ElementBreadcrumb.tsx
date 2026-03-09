import { useMemo, useCallback, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ElementBreadcrumbProps {
  element: Element;
  onSelectElement: (element: Element) => void;
  onHoverElement: (element: Element) => void;
  onHoverEnd: () => void;
}

interface BreadcrumbItem {
  element: Element;
  label: string;
  isCurrentPicked: boolean;
}

/**
 * Generate a short label for an element (e.g., "div.container", "p#intro")
 */
function getElementLabel(el: Element): string {
  let tag = el.tagName.toLowerCase();

  if (el.id) {
    tag += '#' + el.id;
  } else if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      // Show first class only to keep it short
      tag += '.' + classes[0];
      if (classes.length > 1) {
        tag += '...';
      }
    }
  }

  return tag;
}

/**
 * Get parent chain (ancestors) up to body
 */
function getAncestorChain(element: Element, maxDepth = 5): Element[] {
  const ancestors: Element[] = [];
  let current = element.parentElement;

  while (current && current !== document.documentElement && ancestors.length < maxDepth) {
    ancestors.unshift(current);
    current = current.parentElement;
  }

  return ancestors;
}

/**
 * Get direct children that are elements (not text nodes)
 */
function getDirectChildren(element: Element, maxCount = 10): Element[] {
  const children: Element[] = [];

  for (let i = 0; i < element.children.length && children.length < maxCount; i++) {
    const child = element.children[i];
    // Skip script, style, and bugshot elements
    if (
      child.tagName !== 'SCRIPT' &&
      child.tagName !== 'STYLE' &&
      child.tagName !== 'NOSCRIPT' &&
      !child.id?.startsWith('bugshot-')
    ) {
      children.push(child);
    }
  }

  return children;
}

export function ElementBreadcrumb({
  element,
  onSelectElement,
  onHoverElement,
  onHoverEnd,
}: ElementBreadcrumbProps) {
  const [showChildren, setShowChildren] = useState(false);

  // Build breadcrumb items (ancestors + current element)
  const breadcrumbItems = useMemo((): BreadcrumbItem[] => {
    const ancestors = getAncestorChain(element);
    const items: BreadcrumbItem[] = ancestors.map((el) => ({
      element: el,
      label: getElementLabel(el),
      isCurrentPicked: false,
    }));

    // Add current element
    items.push({
      element,
      label: getElementLabel(element),
      isCurrentPicked: true,
    });

    return items;
  }, [element]);

  // Get children of current element
  const children = useMemo(() => getDirectChildren(element), [element]);

  const handleItemClick = useCallback((el: Element, isCurrent: boolean) => {
    if (!isCurrent) {
      onSelectElement(el);
    }
  }, [onSelectElement]);

  const handleItemMouseEnter = useCallback((el: Element, isCurrent: boolean) => {
    if (!isCurrent) {
      onHoverElement(el);
    }
  }, [onHoverElement]);

  const handleItemMouseLeave = useCallback(() => {
    onHoverEnd();
  }, [onHoverEnd]);

  const handleChildClick = useCallback((child: Element) => {
    onSelectElement(child);
    setShowChildren(false);
  }, [onSelectElement]);

  const handleChildMouseEnter = useCallback((child: Element) => {
    onHoverElement(child);
  }, [onHoverElement]);

  return (
    <div className="flex flex-col gap-1">
      {/* Breadcrumb path */}
      <div className="flex items-center flex-wrap gap-0.5">
        {breadcrumbItems.map((item, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-slate-300 mx-0.5 flex-shrink-0" />
            )}
            <button
              className={cn(
                'px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors',
                'border-none cursor-pointer',
                item.isCurrentPicked
                  ? 'bg-violet-100 text-violet-700 font-medium cursor-default'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              )}
              onClick={() => handleItemClick(item.element, item.isCurrentPicked)}
              onMouseEnter={() => handleItemMouseEnter(item.element, item.isCurrentPicked)}
              onMouseLeave={handleItemMouseLeave}
              title={item.isCurrentPicked ? 'Current element' : `Select ${item.label}`}
            >
              {item.label}
            </button>
          </div>
        ))}

        {/* Children toggle button */}
        {children.length > 0 && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-300 mx-0.5 flex-shrink-0" />
            <button
              className={cn(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono',
                'border border-dashed border-slate-300 bg-transparent text-slate-500',
                'hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50',
                'cursor-pointer transition-colors',
                showChildren && 'border-solid border-violet-300 bg-violet-50 text-violet-600'
              )}
              onClick={() => setShowChildren(!showChildren)}
              title={showChildren ? 'Hide children' : `Show ${children.length} children`}
            >
              <span>{children.length} children</span>
              <ChevronDown
                className={cn(
                  'w-3 h-3 transition-transform',
                  showChildren && 'rotate-180'
                )}
              />
            </button>
          </>
        )}
      </div>

      {/* Children dropdown */}
      {showChildren && children.length > 0 && (
        <div className="ml-4 mt-1 flex flex-wrap gap-1 p-2 bg-slate-50 rounded-md border border-slate-100">
          {children.map((child, index) => (
            <button
              key={index}
              className={cn(
                'px-2 py-1 rounded text-[11px] font-mono',
                'border border-slate-200 bg-white text-slate-600',
                'hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700',
                'cursor-pointer transition-colors'
              )}
              onClick={() => handleChildClick(child)}
              onMouseEnter={() => handleChildMouseEnter(child)}
              onMouseLeave={handleItemMouseLeave}
              title={`Select ${getElementLabel(child)}`}
            >
              {getElementLabel(child)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

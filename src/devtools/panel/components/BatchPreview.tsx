import { useState, useMemo } from 'react';
import type { CSSChange } from '@/shared/types/css-change';

interface BatchPreviewProps {
  changes: CSSChange[];
  onRemoveChange: (id: string) => void;
  onRemoveProperty: (changeId: string, propertyIndex: number) => void;
  onSubmitBatch: (notes: string) => void;
  isSubmitting: boolean;
}

interface GroupedChanges {
  selector: string;
  changes: CSSChange[];
  totalProperties: number;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

export function BatchPreview({
  changes,
  onRemoveChange,
  onRemoveProperty,
  onSubmitBatch,
  isSubmitting,
}: BatchPreviewProps) {
  const [notes, setNotes] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo<GroupedChanges[]>(() => {
    const map = new Map<string, CSSChange[]>();
    for (const change of changes) {
      const existing = map.get(change.selector) || [];
      existing.push(change);
      map.set(change.selector, existing);
    }
    return Array.from(map.entries()).map(([selector, grpChanges]) => ({
      selector,
      changes: grpChanges,
      totalProperties: grpChanges.reduce((sum, c) => sum + c.properties.length, 0),
    }));
  }, [changes]);

  const totalProperties = changes.reduce((sum, c) => sum + c.properties.length, 0);

  const toggleGroup = (selector: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(selector)) next.delete(selector);
      else next.add(selector);
      return next;
    });
  };

  if (changes.length === 0) {
    return (
      <div className="batch-empty">
        <p>No changes in batch. Use "Before/After Snapshot" to capture CSS changes.</p>
      </div>
    );
  }

  return (
    <div className="batch-preview">
      <div className="batch-header">
        <span className="batch-count">
          {totalProperties} propert{totalProperties !== 1 ? 'ies' : 'y'} across {grouped.length} element{grouped.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="batch-groups">
        {grouped.map((group) => {
          const isExpanded = expandedGroups.has(group.selector);
          return (
            <div key={group.selector} className="batch-group">
              <div
                className="batch-group-header"
                onClick={() => toggleGroup(group.selector)}
              >
                <span className="batch-group-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                <code className="batch-group-selector">{group.selector}</code>
                <span className="batch-group-count">({group.totalProperties})</span>
              </div>

              {isExpanded && (
                <div className="batch-group-body">
                  {group.changes.map((change) => (
                    <div key={change.id} className="batch-change">
                      {/* Meta changes (className, textContent) */}
                      {change.properties.some((p) => SPECIAL_PROPS.has(p.property)) && (
                        <div className="meta-changes">
                          {change.properties
                            .filter((p) => SPECIAL_PROPS.has(p.property))
                            .map((m, i) => (
                              <div key={i} className="meta-change-row">
                                <span className="meta-label">{m.property}</span>
                                <span className="meta-value as-is">{m.asIs}</span>
                                <span className="meta-arrow">&rarr;</span>
                                <span className="meta-value to-be">{m.toBe}</span>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Style / token changes */}
                      {change.properties.some((p) => !SPECIAL_PROPS.has(p.property)) && (
                        <table className="change-table">
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>As-Is</th>
                              <th>To-Be</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {change.properties
                              .filter((p) => !SPECIAL_PROPS.has(p.property))
                              .map((prop, i) => {
                                const origIndex = change.properties.indexOf(prop);
                                return (
                                  <tr key={i} className={prop.property.startsWith('--') ? 'token-row' : ''}>
                                    <td>
                                      <code className={prop.property.startsWith('--') ? 'token-name' : ''}>
                                        {prop.property}
                                      </code>
                                      {prop.isDesignToken && !prop.property.startsWith('--') && (
                                        <span className="token-badge">token</span>
                                      )}
                                    </td>
                                    <td className="as-is">{prop.asIs}</td>
                                    <td className="to-be">{prop.toBe}</td>
                                    <td>
                                      <button
                                        className="btn-inline-remove"
                                        onClick={() => onRemoveProperty(change.id, origIndex)}
                                        title="Remove this property"
                                      >
                                        &times;
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      )}

                      <button
                        className="btn btn-sm btn-text-danger"
                        onClick={() => onRemoveChange(change.id)}
                      >
                        Remove element
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="batch-notes">
        <label>Designer Notes (optional)</label>
        <textarea
          placeholder="Add context about these changes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <button
        className="btn btn-success btn-block"
        onClick={() => onSubmitBatch(notes)}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : `Submit Batch (${totalProperties} changes)`}
      </button>
    </div>
  );
}

import type { CSSChange, CSSPropertyChange } from '@/shared/types/css-change';

interface ChangeListProps {
  changes: CSSChange[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSubmitSingle: (id: string) => void;
  isSubmitting: boolean;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

function classifyProperties(props: CSSPropertyChange[]) {
  const meta: CSSPropertyChange[] = [];   // className, textContent
  const tokens: CSSPropertyChange[] = []; // --* CSS variables
  const styles: CSSPropertyChange[] = []; // regular CSS properties
  for (const p of props) {
    if (SPECIAL_PROPS.has(p.property)) meta.push(p);
    else if (p.property.startsWith('--')) tokens.push(p);
    else styles.push(p);
  }
  return { meta, tokens, styles };
}

export function ChangeList({
  changes,
  onRemove,
  onClear,
  onSubmitSingle,
  isSubmitting,
}: ChangeListProps) {
  if (changes.length === 0) {
    return (
      <div className="empty-state">
        <p>No changes captured yet.</p>
        <ol className="hint-steps">
          <li>Select an element in the Elements panel</li>
          <li>Click <strong>"1. Before"</strong> to snapshot current styles</li>
          <li>Edit CSS, className, or text in DevTools</li>
          <li>Click <strong>"2. After"</strong> to capture the change</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="change-list">
      <div className="change-list-header">
        <span>{changes.length} change(s) captured</span>
        <button className="btn btn-danger btn-sm" onClick={onClear}>
          Clear All
        </button>
      </div>
      {changes.map((change) => {
        const { meta, tokens, styles } = classifyProperties(change.properties);
        return (
          <div key={change.id} className="change-item">
            <div className="change-item-header">
              <code className="change-selector">{change.selector}</code>
              <div className="change-item-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onSubmitSingle(change.id)}
                  disabled={isSubmitting}
                  title="Submit this change to Jira"
                >
                  Submit
                </button>
                <button
                  className="btn-remove"
                  onClick={() => onRemove(change.id)}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* className / textContent changes */}
            {meta.length > 0 && (
              <div className="meta-changes">
                {meta.map((m, i) => (
                  <div key={i} className="meta-change-row">
                    <span className="meta-label">{m.property}</span>
                    <span className="meta-value as-is">{m.asIs}</span>
                    <span className="meta-arrow">&rarr;</span>
                    <span className="meta-value to-be">{m.toBe}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Design token (CSS variable) changes */}
            {tokens.length > 0 && (
              <>
                <div className="token-section-label">Design Tokens</div>
                <table className="change-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>As-Is</th>
                      <th>To-Be</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((prop, i) => (
                      <tr key={i} className="token-row">
                        <td><code className="token-name">{prop.property}</code></td>
                        <td className="as-is">{prop.asIs}</td>
                        <td className="to-be">{prop.toBe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Regular style property changes */}
            {styles.length > 0 && (
              <>
                {(meta.length > 0 || tokens.length > 0) && (
                  <div className="token-section-label">Styles</div>
                )}
                <table className="change-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>As-Is</th>
                      <th>To-Be</th>
                    </tr>
                  </thead>
                  <tbody>
                    {styles.map((prop, i) => (
                      <tr key={i}>
                        <td>
                          <code>{prop.property}</code>
                          {prop.isDesignToken && <span className="token-badge">token</span>}
                        </td>
                        <td className="as-is">{prop.asIs}</td>
                        <td className="to-be">{prop.toBe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="change-item-meta">
              {new Date(change.timestamp).toLocaleTimeString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

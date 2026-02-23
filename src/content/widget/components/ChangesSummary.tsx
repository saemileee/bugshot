import type { CSSChange, CSSPropertyChange } from '@/shared/types/css-change';
import type { CaptureStatus } from '../hooks/useContentCSSTracking';

interface ChangesViewProps {
  changes: CSSChange[];
  captureStatus: CaptureStatus;
  onRemoveChange: (id: string) => void;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

function classifyProps(props: CSSPropertyChange[]) {
  const meta: CSSPropertyChange[] = [];
  const tokens: CSSPropertyChange[] = [];
  const styles: CSSPropertyChange[] = [];
  for (const p of props) {
    if (SPECIAL_PROPS.has(p.property)) meta.push(p);
    else if (p.property.startsWith('--')) tokens.push(p);
    else styles.push(p);
  }
  return { meta, tokens, styles };
}

export function ChangesSummary({
  changes,
  captureStatus,
  onRemoveChange,
}: ChangesViewProps) {
  return (
    <div>
      {/* ── Brief status (only errors/warnings) ── */}
      {captureStatus.state === 'error' && (
        <div className="qa-status qa-status-error">
          {captureStatus.message}
        </div>
      )}
      {captureStatus.state === 'no_diff' && (
        <div className="qa-status qa-status-warn">
          No CSS changes. You can still save with a description.
        </div>
      )}
      {captureStatus.state === 'success' && (
        <div className="qa-status qa-status-success">
          {captureStatus.change.properties.length} change(s) captured!
        </div>
      )}

      {/* ── Empty state ── */}
      {changes.length === 0 && captureStatus.state === 'idle' && (
        <div className="qa-empty-hint-compact">
          Pick an element from toolbar to edit styles
        </div>
      )}

      {/* ── Change list ── */}
      {changes.length > 0 && (
        <div>
          {changes.map((change) => {
            const { meta, tokens, styles } = classifyProps(change.properties);
            return (
              <div key={change.id} className="qa-change-card">
                <div className="qa-change-card-header">
                  <code className="qa-change-card-selector">{change.selector}</code>
                  <button
                    className="qa-remove-btn"
                    onClick={() => onRemoveChange(change.id)}
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                {/* As-Is / To-Be screenshots */}
                {(change.screenshotBefore || change.screenshotAfter) && (
                  <div className="qa-change-ss">
                    {change.screenshotBefore && (
                      <div className="qa-change-ss-col">
                        <span className="qa-change-ss-label">As-Is</span>
                        <img className="qa-change-ss-img" src={change.screenshotBefore} alt="Before" />
                      </div>
                    )}
                    {change.screenshotAfter && (
                      <div className="qa-change-ss-col">
                        <span className="qa-change-ss-label">To-Be</span>
                        <img className="qa-change-ss-img" src={change.screenshotAfter} alt="After" />
                      </div>
                    )}
                  </div>
                )}

                {/* Description note */}
                {change.description && (
                  <div className="qa-change-desc">
                    {change.description}
                  </div>
                )}

                {meta.map((m, i) => (
                  <div key={i} className="qa-change-meta-row">
                    <span className="qa-change-meta-label">{m.property}</span>
                    <span className="qa-change-meta-val as-is">{m.asIs}</span>
                    <span className="qa-change-meta-arrow">&rarr;</span>
                    <span className="qa-change-meta-val to-be">{m.toBe}</span>
                  </div>
                ))}

                {tokens.length > 0 && (
                  <div className="qa-change-section">
                    <div className="qa-change-section-label">Tokens</div>
                    {tokens.map((t, i) => (
                      <div key={i} className="qa-change-row">
                        <code className="qa-token-name">{t.property}</code>
                        <span className="as-is">{t.asIs}</span>
                        <span style={{ color: '#9ca3af', margin: '0 4px' }}>&rarr;</span>
                        <span className="to-be">{t.toBe}</span>
                      </div>
                    ))}
                  </div>
                )}

                {styles.length > 0 && (
                  <div className="qa-change-section">
                    {(meta.length > 0 || tokens.length > 0) && (
                      <div className="qa-change-section-label">Styles</div>
                    )}
                    {styles.map((s, i) => (
                      <div key={i} className="qa-change-row">
                        <code>{s.property}</code>
                        {s.isDesignToken && <span className="qa-token-badge">token</span>}
                        <span className="as-is">{s.asIs}</span>
                        <span style={{ color: '#9ca3af', margin: '0 4px' }}>&rarr;</span>
                        <span className="to-be">{s.toBe}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="qa-change-card-time">
                  {new Date(change.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

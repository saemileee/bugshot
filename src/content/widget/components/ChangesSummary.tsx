import { useState, useRef, useCallback } from 'react';
import type { CSSChange, CSSPropertyChange } from '@/shared/types/css-change';
import type { CaptureStatus } from '../hooks/useContentCSSTracking';

interface ChangesViewProps {
  changes: CSSChange[];
  captureStatus: CaptureStatus;
  isPicking: boolean;
  onStartPicking: () => void;
  onRemoveChange: (id: string) => void;
  onClearChanges: () => void;
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
  isPicking,
  onStartPicking,
  onRemoveChange,
  onClearChanges,
}: ChangesViewProps) {
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isIdle =
    captureStatus.state === 'idle' ||
    captureStatus.state === 'error' ||
    captureStatus.state === 'no_diff' ||
    captureStatus.state === 'success';

  const handleClearAll = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearTimer.current = setTimeout(() => setClearConfirm(false), 2000);
      return;
    }
    // Second click within 2s → actually clear
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setClearConfirm(false);
    onClearChanges();
  }, [clearConfirm, onClearChanges]);

  return (
    <div>
      {/* ── Pick Element button (only when idle) ── */}
      {isIdle && (
        <div className="qa-capture-flow">
          <button
            className="qa-btn qa-btn-primary"
            onClick={onStartPicking}
            disabled={isPicking}
            style={{ flex: 1 }}
          >
            {isPicking ? (
              <>
                <span className="qa-recording-dot" style={{ display: 'inline-block', width: 8, height: 8, marginRight: 6, verticalAlign: 'middle' }} />
                Picking... click an element
              </>
            ) : (
              'Pick Element'
            )}
          </button>
        </div>
      )}

      {/* ── Brief status (only errors/warnings) ── */}
      {captureStatus.state === 'error' && (
        <div className="qa-status qa-status-error" style={{ marginTop: 8 }}>
          {captureStatus.message}
        </div>
      )}
      {captureStatus.state === 'no_diff' && (
        <div className="qa-status qa-status-warn" style={{ marginTop: 8 }}>
          No CSS changes. You can still save with a description.
        </div>
      )}
      {captureStatus.state === 'success' && (
        <div className="qa-status qa-status-success" style={{ marginTop: 8 }}>
          {captureStatus.change.properties.length} change(s) captured!
        </div>
      )}

      {/* ── Change list (only when there are changes) ── */}
      {changes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="qa-change-badge">
              {changes.length} change{changes.length !== 1 ? 's' : ''}
            </span>
            <button
              className={`qa-btn qa-btn-ghost ${clearConfirm ? 'qa-btn-clear-confirm' : ''}`}
              onClick={handleClearAll}
            >
              {clearConfirm ? 'Clear All?' : 'Clear All'}
            </button>
          </div>

          {changes.map((change) => {
            const { meta, tokens, styles } = classifyProps(change.properties);
            return (
              <div key={change.id} className="qa-change-card">
                <div className="qa-change-card-header">
                  <code className="qa-change-card-selector">{change.selector}</code>
                  <button
                    className="qa-change-card-remove"
                    onClick={() => onRemoveChange(change.id)}
                    title="Remove"
                  >
                    &times;
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

import { useState } from 'react';
import type { CSSChange } from '@/shared/types/css-change';
import type { ExtensionMessage, JiraSubmissionPayload } from '@/shared/types/messages';
import type { ScreenshotData } from '../WidgetRoot';
import { TICKET_PREFIX } from '@/shared/constants';

interface SubmitPanelProps {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  sendMessage: (msg: ExtensionMessage) => Promise<ExtensionMessage>;
  onSuccess: () => void;
  onBack?: () => void;
  isPreview?: boolean;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

function generatePreviewSummary(changes: CSSChange[]): string {
  const title = document.title || window.location.pathname;
  if (changes.length === 0) return `${TICKET_PREFIX} ${title} - Manual QA note`;
  if (changes.length === 1) {
    const prop = changes[0].properties[0]?.property || 'style';
    return `${TICKET_PREFIX} ${title} - ${prop} change on ${changes[0].selector}`;
  }
  return `${TICKET_PREFIX} ${title} - ${changes.length} CSS changes`;
}

export function SubmitPanel({
  screenshots,
  description,
  changes,
  sendMessage,
  onSuccess,
  onBack,
  isPreview,
}: SubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; issueKey?: string; error?: string } | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setResult(null);

    // Collect all screenshots: manual + per-change as-is/to-be
    const allScreenshots: Array<{ dataUrl: string; filename: string }> = screenshots.map((ss) => ({
      dataUrl: ss.annotated || ss.original,
      filename: ss.filename,
    }));

    for (const c of changes) {
      const safeSel = c.selector.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      if (c.screenshotBefore) {
        allScreenshots.push({ dataUrl: c.screenshotBefore, filename: `${safeSel}-as-is.png` });
      }
      if (c.screenshotAfter) {
        allScreenshots.push({ dataUrl: c.screenshotAfter, filename: `${safeSel}-to-be.png` });
      }
    }

    const payload: JiraSubmissionPayload = {
      changes,
      manualNotes: description,
      screenshots: allScreenshots,
      pageUrl: window.location.href,
      pageTitle: document.title,
    };

    try {
      const response = await sendMessage({ type: 'SUBMIT_TO_JIRA', payload });

      if (response.type === 'JIRA_SUBMIT_RESULT') {
        setResult({
          success: response.success,
          issueKey: response.issueKey,
          error: response.error,
        });

        if (response.success) {
          setTimeout(onSuccess, 3000);
        }
      }
    } catch (err) {
      setResult({ success: false, error: (err as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isPreview) return null;

  const summary = generatePreviewSummary(changes);

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ padding: '0 16px', paddingTop: 12 }}>
        <h3 className="qa-section-title" style={{ marginBottom: 0 }}>Ticket Preview</h3>
        {onBack && (
          <button className="qa-btn qa-btn-ghost" onClick={onBack}>
            Back
          </button>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Summary */}
        <div className="qa-preview-card">
          <div className="qa-preview-label">Summary</div>
          <div className="qa-preview-value" style={{ fontWeight: 600 }}>{summary}</div>
        </div>

        {/* CSS Changes table */}
        {changes.length > 0 && (
          <div className="qa-preview-card">
            <div className="qa-preview-label">CSS Changes ({changes.length})</div>
            {changes.map((change) => {
              const meta = change.properties.filter((p) => SPECIAL_PROPS.has(p.property));
              const styles = change.properties.filter((p) => !SPECIAL_PROPS.has(p.property));

              return (
                <div key={change.id} style={{ marginBottom: 12 }}>
                  <code className="qa-preview-selector">{change.selector}</code>

                  {(change.screenshotBefore || change.screenshotAfter) && (
                    <div className="qa-change-ss" style={{ margin: '6px 0', padding: '6px', background: '#f9fafb', borderRadius: 6 }}>
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

                  {change.description && (
                    <div className="qa-change-desc" style={{ borderRadius: 4, marginBottom: 6 }}>
                      {change.description}
                    </div>
                  )}

                  {meta.length > 0 && meta.map((m, i) => (
                    <div key={i} className="qa-preview-meta">
                      <span style={{ fontWeight: 600 }}>{m.property}:</span>{' '}
                      <span className="as-is">{m.asIs}</span>
                      <span className="text-gray-400 mx-1">&rarr;</span>
                      <span className="to-be">{m.toBe}</span>
                    </div>
                  ))}

                  {styles.length > 0 && (
                    <table className="qa-preview-table">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>As-Is</th>
                          <th>To-Be</th>
                        </tr>
                      </thead>
                      <tbody>
                        {styles.map((s, i) => (
                          <tr key={i}>
                            <td>
                              <code>{s.property}</code>
                              {s.isDesignToken && <span className="qa-token-badge ml-1">token</span>}
                            </td>
                            <td className="as-is">{s.asIs}</td>
                            <td className="to-be">{s.toBe}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <div className="qa-preview-card">
            <div className="qa-preview-label">Screenshots ({screenshots.length})</div>
            <div className="qa-preview-thumbs">
              {screenshots.map((ss, i) => (
                <img
                  key={i}
                  src={ss.annotated || ss.original}
                  alt={`Screenshot ${i + 1}`}
                  className="qa-preview-thumb"
                />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {description.trim() && (
          <div className="qa-preview-card">
            <div className="qa-preview-label">Notes</div>
            <div className="qa-preview-value" style={{ whiteSpace: 'pre-wrap' }}>{description}</div>
          </div>
        )}

        {/* Context */}
        <div className="qa-preview-card">
          <div className="qa-preview-label">Context</div>
          <div className="qa-preview-value">
            <div>Page: <a href={window.location.href} style={{ color: '#3b82f6' }}>{window.location.pathname}</a></div>
            <div>Captured: {new Date().toLocaleString()}</div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`qa-status ${result.success ? 'qa-status-success' : 'qa-status-error'} mb-3`}>
            {result.success ? (
              <span>Created <strong>{result.issueKey}</strong> successfully!</span>
            ) : (
              <span>Failed: {result.error}</span>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          className="qa-btn qa-btn-success qa-btn-block qa-btn-lg"
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{ marginBottom: 16 }}
        >
          {isSubmitting ? 'Submitting to Jira...' : 'Create Jira Issue'}
        </button>
      </div>
    </div>
  );
}

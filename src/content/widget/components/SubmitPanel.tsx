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
}: SubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [result, setResult] = useState<{ success: boolean; issueKey?: string; error?: string } | null>(null);

  const hasContent = screenshots.length > 0 || description.trim() || changes.length > 0;

  const handleSubmit = async () => {
    if (!hasContent) return;

    setIsSubmitting(true);
    setResult(null);

    const payload: JiraSubmissionPayload = {
      changes,
      manualNotes: description,
      screenshots: screenshots.map((ss) => ({
        dataUrl: ss.annotated || ss.original,
        filename: ss.filename,
      })),
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
          setShowPreview(false);
          setTimeout(onSuccess, 3000);
        }
      }
    } catch (err) {
      setResult({ success: false, error: (err as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Preview mode ──
  if (showPreview) {
    const summary = generatePreviewSummary(changes);

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="qa-section-title" style={{ marginBottom: 0 }}>Ticket Preview</h3>
          <button className="qa-btn qa-btn-ghost" onClick={() => setShowPreview(false)}>
            Close
          </button>
        </div>

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
        >
          {isSubmitting ? 'Submitting to Jira...' : 'Create Jira Issue'}
        </button>
      </div>
    );
  }

  // ── Default view ──
  return (
    <div>
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

      {!hasContent ? (
        <div className="qa-status qa-status-info">
          <span>Capture screenshots, describe the issue, or track CSS changes before submitting.</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            className="qa-btn qa-btn-secondary flex-1 qa-btn-lg"
            onClick={() => setShowPreview(true)}
          >
            Preview
          </button>
          <button
            className="qa-btn qa-btn-success flex-1 qa-btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Create Issue'}
          </button>
        </div>
      )}
    </div>
  );
}

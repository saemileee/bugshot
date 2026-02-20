import { useState, useCallback, useEffect } from 'react';
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
  videoRecordingId?: string | null;
  isPreview?: boolean;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateHtml(
  summary: string,
  changes: CSSChange[],
  description: string,
  screenshotCount: number,
): string {
  const h: string[] = [];
  h.push(`<h2 style="margin:0 0 8px">${esc(summary)}</h2>`);

  if (changes.length > 0) {
    h.push(`<h3 style="margin:12px 0 6px">CSS Changes (${changes.length})</h3>`);
    for (const c of changes) {
      h.push(`<p style="margin:8px 0 4px"><strong><code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc(c.selector)}</code></strong></p>`);

      if (c.description) h.push(`<blockquote style="margin:4px 0;padding:4px 10px;border-left:3px solid #cbd5e1;color:#475569">${esc(c.description)}</blockquote>`);

      if (c.screenshotBefore || c.screenshotAfter) {
        const parts: string[] = [];
        if (c.screenshotBefore) parts.push('As-Is');
        if (c.screenshotAfter) parts.push('To-Be');
        h.push(`<p style="font-size:11px;color:#64748b;margin:4px 0">📎 ${parts.join(' / ')} screenshot attached</p>`);
      }

      const meta = c.properties.filter((p) => SPECIAL_PROPS.has(p.property));
      const styles = c.properties.filter((p) => !SPECIAL_PROPS.has(p.property));

      for (const m of meta) {
        h.push(`<p style="margin:2px 0"><strong>${esc(m.property)}:</strong> <del style="color:#ef4444">${esc(m.asIs)}</del> → <span style="color:#16a34a">${esc(m.toBe)}</span></p>`);
      }

      if (styles.length > 0) {
        h.push('<table style="border-collapse:collapse;width:100%;font-size:12px;margin:6px 0"><thead><tr>');
        h.push('<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">Property</th>');
        h.push('<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">As-Is</th>');
        h.push('<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">To-Be</th>');
        h.push('</tr></thead><tbody>');
        for (const s of styles) {
          h.push(`<tr><td style="border:1px solid #e2e8f0;padding:4px 8px"><code>${esc(s.property)}</code></td>`);
          h.push(`<td style="border:1px solid #e2e8f0;padding:4px 8px;color:#ef4444;text-decoration:line-through">${esc(s.asIs)}</td>`);
          h.push(`<td style="border:1px solid #e2e8f0;padding:4px 8px;color:#16a34a;font-weight:500">${esc(s.toBe)}</td></tr>`);
        }
        h.push('</tbody></table>');
      }
    }
  }

  if (screenshotCount > 0) {
    h.push(`<p style="font-size:12px;color:#64748b;margin:8px 0">📎 ${screenshotCount} screenshot(s) attached</p>`);
  }

  if (description.trim()) {
    h.push(`<h3 style="margin:12px 0 6px">Notes</h3><p style="margin:0;white-space:pre-wrap">${esc(description)}</p>`);
  }

  h.push(`<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0"><p style="font-size:11px;color:#94a3b8;margin:0">Page: <a href="${esc(window.location.href)}" style="color:#3b82f6">${esc(window.location.pathname)}</a> · ${new Date().toLocaleString()}</p>`);
  return h.join('');
}

function generatePlainText(
  summary: string,
  changes: CSSChange[],
  description: string,
): string {
  const lines: string[] = [summary, ''];

  for (const c of changes) {
    lines.push(`[${c.selector}]`);
    if (c.description) lines.push(`  ${c.description}`);
    for (const p of c.properties) {
      lines.push(`  ${p.property}: ${p.asIs} → ${p.toBe}`);
    }
    lines.push('');
  }

  if (description.trim()) lines.push('Notes:', description, '');
  lines.push(window.location.href);
  return lines.join('\n');
}

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
  videoRecordingId,
  isPreview,
}: SubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; issueKey?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editSummary, setEditSummary] = useState(() => generatePreviewSummary(changes));
  const [siteUrl, setSiteUrl] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, (r) => {
      if (r?.siteUrl) setSiteUrl(r.siteUrl);
    });
  }, []);

  const handleCopy = useCallback(async () => {
    const html = generateHtml(editSummary, changes, description, screenshots.length);
    const plain = generatePlainText(editSummary, changes, description);

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editSummary, changes, description, screenshots.length]);

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
      summary: editSummary,
      manualNotes: description,
      screenshots: allScreenshots,
      videoRecordingId: videoRecordingId || undefined,
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

  const issueUrl = siteUrl && result?.issueKey
    ? `https://${siteUrl}/browse/${result.issueKey}`
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ padding: '0 16px', paddingTop: 12 }}>
        <h3 className="qa-section-title" style={{ marginBottom: 0 }}>Ticket Preview</h3>
        <div className="flex items-center gap-1">
          <button
            className={`qa-btn ${copied ? 'qa-btn-success' : 'qa-btn-ghost'}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {onBack && (
            <button className="qa-btn qa-btn-ghost" onClick={onBack}>
              Back
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Summary (editable) */}
        <div className="qa-preview-card">
          <div className="qa-preview-label">Summary</div>
          <input
            className="qa-preview-summary-input"
            type="text"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            spellCheck={false}
          />
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
          <div className={`qa-status ${result.success ? 'qa-status-success' : 'qa-status-error'}`} style={{ marginBottom: 12 }}>
            {result.success ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Created <strong>{result.issueKey}</strong></span>
                {issueUrl && (
                  <a
                    href={issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0369a1', fontSize: 12, wordBreak: 'break-all' }}
                  >
                    {issueUrl}
                  </a>
                )}
              </div>
            ) : (
              <span>Failed: {result.error}</span>
            )}
          </div>
        )}

        {/* Submit */}
        {!result?.success && (
          <button
            className="qa-btn qa-btn-success qa-btn-block qa-btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting || !editSummary.trim()}
            style={{ marginBottom: 16 }}
          >
            {isSubmitting ? 'Submitting to Jira...' : 'Create Jira Issue'}
          </button>
        )}
      </div>
    </div>
  );
}

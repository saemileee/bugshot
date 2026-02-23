import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CSSChange } from '@/shared/types/css-change';
import type { ExtensionMessage, JiraSubmissionPayload } from '@/shared/types/messages';
import type { IntegrationResult, SubmissionPayload, IntegrationId, JiraSubmitOptions } from '@/shared/types/integration';
import type { ScreenshotData } from '../WidgetRoot';
import { STORAGE_KEYS } from '@/shared/constants';
import { SearchableSelect, type SelectOption } from './SearchableSelect';

interface JiraUser { accountId: string; displayName: string; avatarUrl?: string }
interface JiraPriority { id: string; name: string; iconUrl?: string }

interface SubmitPanelProps {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  sendMessage: (msg: ExtensionMessage) => Promise<ExtensionMessage>;
  onSuccess: () => void;
  onBack?: () => void;
  videoRecordingId?: string | null;
  videoDataUrl?: string | null;
  videoMimeType?: string | null;
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
        h.push(`<p style="font-size:11px;color:#64748b;margin:4px 0">${parts.join(' / ')} screenshot attached</p>`);
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
    h.push(`<p style="font-size:12px;color:#64748b;margin:8px 0">${screenshotCount} screenshot(s) attached</p>`);
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

function generatePreviewSummary(changes: CSSChange[], prefix: string): string {
  const title = document.title || window.location.pathname;
  const pre = prefix ? `${prefix} ` : '';
  if (changes.length === 0) return `${pre}${title} - Manual QA note`;
  if (changes.length === 1) {
    const prop = changes[0].properties[0]?.property || 'style';
    return `${pre}${title} - ${prop} change on ${changes[0].selector}`;
  }
  return `${pre}${title} - ${changes.length} CSS changes`;
}

const INTEGRATION_LABELS: Record<IntegrationId, string> = {
  jira: 'Jira',
  github: 'GitHub',
  n8n: 'N8N',
};

export function SubmitPanel({
  screenshots,
  description,
  changes,
  sendMessage,
  onSuccess,
  onBack,
  videoRecordingId,
  videoDataUrl,
  videoMimeType,
  isPreview,
}: SubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<IntegrationResult[] | null>(null);
  const [legacyResult, setLegacyResult] = useState<{ success: boolean; issueKey?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [enabledCount, setEnabledCount] = useState(0);
  const [enabledIntegrations, setEnabledIntegrations] = useState<IntegrationId[]>([]);

  // Jira options state
  const [jiraOptionsOpen, setJiraOptionsOpen] = useState(true);
  const [jiraAssignees, setJiraAssignees] = useState<JiraUser[]>([]);
  const [jiraPriorities, setJiraPriorities] = useState<JiraPriority[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [epicKey, setEpicKey] = useState<string>('');
  const [loadingJiraOptions, setLoadingJiraOptions] = useState(false);

  const loadJiraOptions = useCallback(async (projectKey: string) => {
    setLoadingJiraOptions(true);
    try {
      const [assigneesRes, prioritiesRes] = await Promise.all([
        new Promise<{ success: boolean; data?: JiraUser[] }>((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_JIRA_ASSIGNEES', projectKey }, resolve);
        }),
        new Promise<{ success: boolean; data?: JiraPriority[] }>((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_JIRA_PRIORITIES' }, resolve);
        }),
      ]);
      if (assigneesRes.success && assigneesRes.data) setJiraAssignees(assigneesRes.data);
      if (prioritiesRes.success && prioritiesRes.data) setJiraPriorities(prioritiesRes.data);
    } finally {
      setLoadingJiraOptions(false);
    }
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, (r) => {
      if (r?.siteUrl) setSiteUrl(r.siteUrl);
    });
    // Ask background for enabled integrations (handles legacy Jira migration)
    chrome.runtime.sendMessage({ type: 'GET_ALL_INTEGRATIONS' }, (r) => {
      if (r?.integrations) {
        const enabled = (r.integrations as Array<{ id: IntegrationId; enabled: boolean }>).filter((i) => i.enabled);
        setEnabledCount(enabled.length);
        setEnabledIntegrations(enabled.map((i) => i.id));
      }
    });
    // Load title prefix and generate summary
    chrome.storage.sync.get(STORAGE_KEYS.TITLE_PREFIX, (result) => {
      const prefix = result[STORAGE_KEYS.TITLE_PREFIX] ?? '[BugShot]';
      setEditSummary(generatePreviewSummary(changes, prefix));
    });

    // Load Jira project key for options - check both legacy and new storage
    chrome.storage.sync.get([STORAGE_KEYS.EPIC_CONFIG, STORAGE_KEYS.INTEGRATIONS], (result) => {
      const legacyConfig = result[STORAGE_KEYS.EPIC_CONFIG];
      const integrations = result[STORAGE_KEYS.INTEGRATIONS] as Record<string, { settings?: { projectKey?: string } }> | undefined;
      const jiraIntegration = integrations?.jira;

      // Try legacy config first, then fall back to new integration config
      const projectKey = legacyConfig?.projectKey || jiraIntegration?.settings?.projectKey;

      console.log('[SubmitPanel] EPIC_CONFIG:', legacyConfig);
      console.log('[SubmitPanel] INTEGRATIONS.jira:', jiraIntegration);
      console.log('[SubmitPanel] Resolved projectKey:', projectKey);

      if (projectKey) {
        console.log('[SubmitPanel] Loading Jira options for project:', projectKey);
        loadJiraOptions(projectKey);
      } else {
        console.log('[SubmitPanel] No projectKey configured, skipping Jira options load');
      }
    });

    // Load saved Jira submit options
    chrome.storage.local.get(STORAGE_KEYS.JIRA_SUBMIT_OPTIONS, (result) => {
      const opts = result[STORAGE_KEYS.JIRA_SUBMIT_OPTIONS];
      if (opts) {
        if (opts.assigneeId) setSelectedAssignee(opts.assigneeId);
        if (opts.priorityId) setSelectedPriority(opts.priorityId);
        if (opts.epicKey) setEpicKey(opts.epicKey);
      }
    });
  }, [changes, loadJiraOptions]);

  // Save Jira options when they change
  useEffect(() => {
    if (selectedAssignee || selectedPriority || epicKey) {
      chrome.storage.local.set({
        [STORAGE_KEYS.JIRA_SUBMIT_OPTIONS]: {
          assigneeId: selectedAssignee,
          priorityId: selectedPriority,
          epicKey: epicKey,
        },
      });
    }
  }, [selectedAssignee, selectedPriority, epicKey]);

  const useMultiIntegration = enabledCount > 0;

  // Convert Jira data to SelectOption format
  const assigneeOptions: SelectOption[] = useMemo(() =>
    jiraAssignees.map((u) => ({
      value: u.accountId,
      label: u.displayName,
      avatarUrl: u.avatarUrl,
    })),
    [jiraAssignees]
  );

  const priorityOptions: SelectOption[] = useMemo(() =>
    jiraPriorities.map((p) => ({
      value: p.id,
      label: p.name,
    })),
    [jiraPriorities]
  );


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
    setResults(null);
    setLegacyResult(null);

    // Collect all screenshots
    const allScreenshots: Array<{ dataUrl: string; filename: string }> = screenshots.map((ss) => ({
      dataUrl: ss.annotated || ss.original,
      filename: ss.filename,
    }));

    for (const c of changes) {
      const safeSel = c.selector.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      if (c.screenshotBefore) allScreenshots.push({ dataUrl: c.screenshotBefore, filename: `${safeSel}-as-is.png` });
      if (c.screenshotAfter) allScreenshots.push({ dataUrl: c.screenshotAfter, filename: `${safeSel}-to-be.png` });
    }

    // Build Jira options
    const jiraOptions: JiraSubmitOptions = {};
    if (selectedAssignee) jiraOptions.assigneeId = selectedAssignee;
    if (selectedPriority) jiraOptions.priorityId = selectedPriority;
    if (epicKey.trim()) jiraOptions.epicKey = epicKey.trim();

    if (useMultiIntegration) {
      // Multi-integration path
      const payload: SubmissionPayload = {
        changes,
        summary: editSummary,
        manualNotes: description,
        screenshots: allScreenshots,
        videoRecordingId: videoRecordingId || undefined,
        videoMimeType: videoMimeType || undefined,
        pageUrl: window.location.href,
        pageTitle: document.title,
        jiraOptions: Object.keys(jiraOptions).length > 0 ? jiraOptions : undefined,
      };

      try {
        const response = await sendMessage({ type: 'SUBMIT_TO_INTEGRATIONS', payload });
        if (response.type === 'INTEGRATION_RESULTS') {
          const r = (response as any).results as IntegrationResult[];
          setResults(r);
          if (r.every((res) => res.success)) {
            setTimeout(onSuccess, 3000);
          }
        }
      } catch (err) {
        setResults([{ integrationId: 'jira', success: false, error: (err as Error).message }]);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Legacy Jira-only path
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
          setLegacyResult({ success: response.success, issueKey: response.issueKey, error: response.error });
          if (response.success) setTimeout(onSuccess, 3000);
        }
      } catch (err) {
        setLegacyResult({ success: false, error: (err as Error).message });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isPreview) return null;

  const allSuccess = results?.every((r) => r.success) ?? false;
  const legacyIssueUrl = siteUrl && legacyResult?.issueKey ? `https://${siteUrl}/browse/${legacyResult.issueKey}` : null;

  const submitLabel = useMultiIntegration
    ? (enabledCount === 1
      ? `Submit to ${INTEGRATION_LABELS[enabledIntegrations[0]]}`
      : `Submit to ${enabledCount} Integrations`)
    : 'Create Jira Issue';

  return (
    <div>
      <div className="qa-page-title" style={{ paddingBottom: 0 }}>
        <span className="qa-page-title-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        Preview & Submit
      </div>
      <div className="flex items-center justify-end gap-1" style={{ padding: '8px 16px 12px' }}>
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

        {/* Video Recording */}
        {videoRecordingId && videoDataUrl && (
          <div className="qa-preview-card">
            <div className="qa-preview-label">Screen Recording</div>
            <video
              src={videoDataUrl}
              controls
              playsInline
              style={{ width: '100%', borderRadius: 6, marginTop: 4 }}
            />
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

        {/* Integration Options */}
        {enabledIntegrations.includes('jira') && (
          <div className="qa-preview-card">
            <button
              className="qa-integration-options-header"
              onClick={() => setJiraOptionsOpen(!jiraOptionsOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div className="qa-preview-label" style={{ marginBottom: 0 }}>
                Jira Options
                {(selectedAssignee || selectedPriority || epicKey) && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#3b82f6' }}>
                    ({[selectedAssignee && 'Assignee', selectedPriority && 'Priority', epicKey && 'Epic'].filter(Boolean).join(', ')})
                  </span>
                )}
              </div>
              <svg
                className={`qa-section-chevron ${jiraOptionsOpen ? 'open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {jiraOptionsOpen && (
              <div style={{ marginTop: 12 }}>
                <div className="qa-settings-field" style={{ marginBottom: 8 }}>
                  <label className="qa-settings-label" style={{ fontSize: 11 }}>Assignee</label>
                  <SearchableSelect
                    options={assigneeOptions}
                    value={selectedAssignee}
                    onChange={setSelectedAssignee}
                    placeholder="Search assignee..."
                    emptyLabel="Unassigned"
                    loading={loadingJiraOptions}
                  />
                </div>
                <div className="qa-settings-field" style={{ marginBottom: 8 }}>
                  <label className="qa-settings-label" style={{ fontSize: 11 }}>Priority</label>
                  <SearchableSelect
                    options={priorityOptions}
                    value={selectedPriority}
                    onChange={setSelectedPriority}
                    placeholder="Search priority..."
                    emptyLabel="Default"
                    loading={loadingJiraOptions}
                  />
                </div>
                <div className="qa-settings-field">
                  <label className="qa-settings-label" style={{ fontSize: 11 }}>Epic Key</label>
                  <input
                    className="qa-settings-input"
                    type="text"
                    value={epicKey}
                    onChange={(e) => setEpicKey(e.target.value.toUpperCase())}
                    placeholder="e.g. PROJ-123"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Multi-integration results */}
        {results && (
          <div className="qa-integration-results">
            {results.map((r) => (
              <div key={r.integrationId} className={`qa-integration-result ${r.success ? 'qa-integration-result-ok' : 'qa-integration-result-fail'}`}>
                <span className="qa-integration-result-icon">{r.success ? '✓' : '✗'}</span>
                <div className="qa-integration-result-body">
                  <span>
                    <strong>{INTEGRATION_LABELS[r.integrationId]}</strong>
                    {r.issueKey && `: ${r.issueKey}`}
                    {!r.success && r.error && `: ${r.error}`}
                  </span>
                  {r.url && r.success && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="qa-integration-result-link">
                      {r.url}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legacy Jira result */}
        {legacyResult && (
          <div className={`qa-status ${legacyResult.success ? 'qa-status-success' : 'qa-status-error'}`} style={{ marginBottom: 12 }}>
            {legacyResult.success ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Created <strong>{legacyResult.issueKey}</strong></span>
                {legacyIssueUrl && (
                  <a href={legacyIssueUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1', fontSize: 12, wordBreak: 'break-all' }}>
                    {legacyIssueUrl}
                  </a>
                )}
              </div>
            ) : (
              <span>Failed: {legacyResult.error}</span>
            )}
          </div>
        )}

      </div>

      {/* Fixed Submit button at bottom */}
      {!allSuccess && !legacyResult?.success && (
        <div className="qa-submit-fixed-footer">
          <button
            className="qa-btn qa-btn-primary qa-btn-block qa-btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting || !editSummary.trim()}
          >
            {isSubmitting ? (
              'Submitting...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
                {submitLabel}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

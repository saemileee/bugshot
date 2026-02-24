import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CSSChange } from '@/shared/types/css-change';
import type { JiraSubmissionPayload } from '@/shared/types/messages';
import type { IntegrationResult, SubmissionPayload, IntegrationId, JiraSubmitOptions } from '@/shared/types/integration';
import type { ScreenshotData } from '../WidgetRoot';
import type { SendMessageFn } from '../hooks/useSWMessaging';
import { STORAGE_KEYS } from '@/shared/constants';
import { SearchableSelect, type SelectOption } from './SearchableSelect';
import { cn } from '@/shared/utils/cn';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Eye, Send, ChevronDown, ArrowLeft, Copy, Check, CheckCircle, XCircle } from 'lucide-react';

interface JiraUser { accountId: string; displayName: string; avatarUrl?: string }
interface JiraPriority { id: string; name: string; iconUrl?: string }

interface SubmitPanelProps {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  sendMessage: SendMessageFn;
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
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-500">
          <Eye className="w-3.5 h-3.5" />
        </span>
        Preview & Submit
      </div>
      <div className="flex items-center justify-end gap-1 px-4 pb-3">
        <Button variant={copied ? 'primary' : 'ghost'} size="sm" onClick={handleCopy}>
          {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
        </Button>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-3 h-3" /> Back
          </Button>
        )}
      </div>

      <div className="px-4 space-y-3">
        {/* Summary (editable) */}
        <Card>
          <CardContent className="p-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Summary</Label>
            <input
              className="w-full px-2 py-1.5 text-[13px] font-semibold text-slate-800 border border-gray-200 rounded-md outline-none bg-white transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              type="text"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              spellCheck={false}
            />
          </CardContent>
        </Card>

        {/* CSS Changes table */}
        {changes.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">CSS Changes ({changes.length})</Label>
              {changes.map((change) => {
                const meta = change.properties.filter((p) => SPECIAL_PROPS.has(p.property));
                const styles = change.properties.filter((p) => !SPECIAL_PROPS.has(p.property));

                return (
                  <div key={change.id} className="mb-3 last:mb-0">
                    <code className="block bg-gray-100 text-xs font-mono px-2 py-1 rounded mb-1.5 break-all">{change.selector}</code>

                    {(change.screenshotBefore || change.screenshotAfter) && (
                      <div className="flex gap-2 my-1.5 p-1.5 bg-gray-50 rounded-md">
                        {change.screenshotBefore && (
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs font-semibold text-gray-500 mb-1">As-Is</span>
                            <img className="w-full rounded border border-gray-200" src={change.screenshotBefore} alt="Before" />
                          </div>
                        )}
                        {change.screenshotAfter && (
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs font-semibold text-gray-500 mb-1">To-Be</span>
                            <img className="w-full rounded border border-gray-200" src={change.screenshotAfter} alt="After" />
                          </div>
                        )}
                      </div>
                    )}

                    {change.description && (
                      <div className="px-3 py-2 text-xs text-slate-700 bg-amber-50 border-b border-amber-100 leading-relaxed whitespace-pre-wrap rounded mb-1.5">
                        {change.description}
                      </div>
                    )}

                    {meta.length > 0 && meta.map((m, i) => (
                      <div key={i} className="text-xs py-0.5">
                        <span className="font-semibold">{m.property}:</span>{' '}
                        <span className="text-red-500 line-through">{m.asIs}</span>
                        <span className="text-gray-400 mx-1">&rarr;</span>
                        <span className="text-green-600 font-medium">{m.toBe}</span>
                      </div>
                    ))}

                    {styles.length > 0 && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left text-gray-500 font-medium py-1 px-2 border-b border-gray-200 bg-gray-50">Property</th>
                            <th className="text-left text-gray-500 font-medium py-1 px-2 border-b border-gray-200 bg-gray-50">As-Is</th>
                            <th className="text-left text-gray-500 font-medium py-1 px-2 border-b border-gray-200 bg-gray-50">To-Be</th>
                          </tr>
                        </thead>
                        <tbody>
                          {styles.map((s, i) => (
                            <tr key={i}>
                              <td className="py-1 px-2 border-b border-gray-100 break-all">
                                <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">{s.property}</code>
                                {s.isDesignToken && <span className="text-purple-500 bg-purple-50 border border-purple-200 px-1 py-0.5 rounded text-xs ml-1">token</span>}
                              </td>
                              <td className="py-1 px-2 border-b border-gray-100 text-red-500 line-through break-all">{s.asIs}</td>
                              <td className="py-1 px-2 border-b border-gray-100 text-green-600 font-medium break-all">{s.toBe}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Screenshots ({screenshots.length})</Label>
              <div className="flex gap-2 flex-wrap">
                {screenshots.map((ss, i) => (
                  <img
                    key={i}
                    src={ss.annotated || ss.original}
                    alt={`Screenshot ${i + 1}`}
                    className="w-20 h-14 object-cover rounded border border-gray-200"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Video Recording */}
        {videoRecordingId && videoDataUrl && (
          <Card>
            <CardContent className="p-3">
              <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Screen Recording</Label>
              <video
                src={videoDataUrl}
                controls
                playsInline
                className="w-full rounded-md mt-1"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {description.trim() && (
          <Card>
            <CardContent className="p-3">
              <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Notes</Label>
              <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{description}</div>
            </CardContent>
          </Card>
        )}

        {/* Context */}
        <Card>
          <CardContent className="p-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Context</Label>
            <div className="text-xs text-gray-800 leading-relaxed">
              <div>Page: <a href={window.location.href} className="text-blue-500">{window.location.pathname}</a></div>
              <div>Captured: {new Date().toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        {/* Integration Options */}
        {enabledIntegrations.includes('jira') && (
          <Card>
            <CardContent className="p-3">
              <button
                onClick={() => setJiraOptionsOpen(!jiraOptionsOpen)}
                className="w-full flex items-center justify-between bg-transparent border-none p-0 cursor-pointer text-inherit"
              >
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-0">
                    Jira Options
                  </Label>
                  {(selectedAssignee || selectedPriority || epicKey) && (
                    <span className="text-[11px] text-blue-500">
                      ({[selectedAssignee && 'Assignee', selectedPriority && 'Priority', epicKey && 'Epic'].filter(Boolean).join(', ')})
                    </span>
                  )}
                </div>
                <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', jiraOptionsOpen && 'rotate-180')} />
              </button>

              {jiraOptionsOpen && (
                <div className="mt-3 space-y-2.5">
                  <div>
                    <Label className="text-[11px]">Assignee</Label>
                    <SearchableSelect
                      options={assigneeOptions}
                      value={selectedAssignee}
                      onChange={setSelectedAssignee}
                      placeholder="Search assignee..."
                      emptyLabel="Unassigned"
                      loading={loadingJiraOptions}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Priority</Label>
                    <SearchableSelect
                      options={priorityOptions}
                      value={selectedPriority}
                      onChange={setSelectedPriority}
                      placeholder="Search priority..."
                      emptyLabel="Default"
                      loading={loadingJiraOptions}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Epic Key</Label>
                    <Input
                      type="text"
                      value={epicKey}
                      onChange={(e) => setEpicKey(e.target.value.toUpperCase())}
                      placeholder="e.g. PROJ-123"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Multi-integration results */}
        {results && (
          <div className="flex flex-col gap-1.5 mb-3">
            {results.map((r) => (
              <div
                key={r.integrationId}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-md text-xs',
                  r.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                )}
              >
                <span className="flex-shrink-0 font-bold">
                  {r.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span>
                    <strong>{INTEGRATION_LABELS[r.integrationId]}</strong>
                    {r.issueKey && `: ${r.issueKey}`}
                    {!r.success && r.error && `: ${r.error}`}
                  </span>
                  {r.url && r.success && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 break-all hover:underline">
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
          <div className={cn(
            'flex items-start gap-2 p-2.5 rounded-md text-xs leading-relaxed mb-3',
            legacyResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          )}>
            {legacyResult.success ? (
              <div className="flex flex-col gap-1">
                <span>Created <strong>{legacyResult.issueKey}</strong></span>
                {legacyIssueUrl && (
                  <a href={legacyIssueUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 text-xs break-all hover:underline">
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
        <div className="sticky bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-white via-white to-transparent z-10">
          <Button
            variant="primary"
            size="lg"
            className="w-full min-h-[48px]"
            onClick={handleSubmit}
            disabled={isSubmitting || !editSummary.trim()}
          >
            {isSubmitting ? (
              'Submitting...'
            ) : (
              <>
                <Send className="w-4 h-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

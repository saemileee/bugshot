import { useState, useCallback, useEffect, useMemo } from "react";
import type { CSSChange } from "@/shared/types/css-change";
import type { JiraSubmissionPayload } from "@/shared/types/messages";
import type {
  IntegrationResult,
  SubmissionPayload,
  IntegrationId,
  JiraSubmitOptions,
} from "@/shared/types/integration";
import type { ScreenshotData } from "../WidgetRoot";
import type { SendMessageFn } from "../hooks/useSWMessaging";
import { STORAGE_KEYS } from "@/shared/constants";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";
import { cn } from "@/shared/utils/cn";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Send,
  ArrowLeft,
  Copy,
  Check,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}
interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

interface SubmitPanelProps {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  sendMessage: SendMessageFn;
  onSuccess: () => void;
  onBack?: () => void;
  onGoToSettings?: () => void;
  videoRecordingId?: string | null;
  videoDataUrl?: string | null;
  videoMimeType?: string | null;
  hasConnectedPlatform?: boolean;
  isPreview?: boolean;
}

const SPECIAL_PROPS = new Set(["className", "textContent"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generateHtml(
  summary: string,
  changes: CSSChange[],
  description: string,
  screenshotCount: number
): string {
  const h: string[] = [];
  h.push(`<h2 style="margin:0 0 8px">${esc(summary)}</h2>`);

  if (changes.length > 0) {
    h.push(
      `<h3 style="margin:12px 0 6px">CSS Changes (${changes.length})</h3>`
    );
    for (const c of changes) {
      h.push(
        `<p style="margin:8px 0 4px"><strong><code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc(
          c.selector
        )}</code></strong></p>`
      );

      if (c.description)
        h.push(
          `<blockquote style="margin:4px 0;padding:4px 10px;border-left:3px solid #cbd5e1;color:#475569">${esc(
            c.description
          )}</blockquote>`
        );

      if (c.screenshotBefore || c.screenshotAfter) {
        const parts: string[] = [];
        if (c.screenshotBefore) parts.push("As-Is");
        if (c.screenshotAfter) parts.push("To-Be");
        h.push(
          `<p style="font-size:11px;color:#64748b;margin:4px 0">${parts.join(
            " / "
          )} screenshot attached</p>`
        );
      }

      const meta = c.properties.filter((p) => SPECIAL_PROPS.has(p.property));
      const styles = c.properties.filter((p) => !SPECIAL_PROPS.has(p.property));

      for (const m of meta) {
        h.push(
          `<p style="margin:2px 0"><strong>${esc(
            m.property
          )}:</strong> <del style="color:#ef4444">${esc(
            m.asIs
          )}</del> → <span style="color:#16a34a">${esc(m.toBe)}</span></p>`
        );
      }

      if (styles.length > 0) {
        h.push(
          '<table style="border-collapse:collapse;width:100%;font-size:12px;margin:6px 0"><thead><tr>'
        );
        h.push(
          '<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">Property</th>'
        );
        h.push(
          '<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">As-Is</th>'
        );
        h.push(
          '<th style="border:1px solid #e2e8f0;padding:4px 8px;background:#f8fafc;text-align:left">To-Be</th>'
        );
        h.push("</tr></thead><tbody>");
        for (const s of styles) {
          h.push(
            `<tr><td style="border:1px solid #e2e8f0;padding:4px 8px"><code>${esc(
              s.property
            )}</code></td>`
          );
          h.push(
            `<td style="border:1px solid #e2e8f0;padding:4px 8px;color:#ef4444;text-decoration:line-through">${esc(
              s.asIs
            )}</td>`
          );
          h.push(
            `<td style="border:1px solid #e2e8f0;padding:4px 8px;color:#16a34a;font-weight:500">${esc(
              s.toBe
            )}</td></tr>`
          );
        }
        h.push("</tbody></table>");
      }
    }
  }

  if (screenshotCount > 0) {
    h.push(
      `<p style="font-size:12px;color:#64748b;margin:8px 0">${screenshotCount} screenshot(s) attached</p>`
    );
  }

  if (description.trim()) {
    h.push(
      `<h3 style="margin:12px 0 6px">Notes</h3><p style="margin:0;white-space:pre-wrap">${esc(
        description
      )}</p>`
    );
  }

  h.push(
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0"><p style="font-size:11px;color:#94a3b8;margin:0">Page: <a href="${esc(
      window.location.href
    )}" style="color:#3b82f6">${esc(
      window.location.pathname
    )}</a> · ${new Date().toLocaleString()}</p>`
  );
  return h.join("");
}

function generatePlainText(
  summary: string,
  changes: CSSChange[],
  description: string
): string {
  const lines: string[] = [summary, ""];

  for (const c of changes) {
    lines.push(`[${c.selector}]`);
    if (c.description) lines.push(`  ${c.description}`);
    for (const p of c.properties) {
      lines.push(`  ${p.property}: ${p.asIs} → ${p.toBe}`);
    }
    lines.push("");
  }

  if (description.trim()) lines.push("Notes:", description, "");
  lines.push(window.location.href);
  return lines.join("\n");
}

function generatePreviewSummary(changes: CSSChange[], prefix: string): string {
  const title = document.title || window.location.pathname;
  const pre = prefix ? `${prefix} ` : "";
  if (changes.length === 0) return `${pre}${title} - Manual QA note`;
  if (changes.length === 1) {
    const prop = changes[0].properties[0]?.property || "style";
    return `${pre}${title} - ${prop} change on ${changes[0].selector}`;
  }
  return `${pre}${title} - ${changes.length} CSS changes`;
}

const INTEGRATION_LABELS: Record<IntegrationId, string> = {
  jira: "Jira",
  github: "GitHub",
  n8n: "N8N",
};

export function SubmitPanel({
  screenshots,
  description,
  changes,
  sendMessage,
  onSuccess,
  onBack,
  onGoToSettings,
  videoRecordingId,
  videoDataUrl,
  videoMimeType,
  hasConnectedPlatform = false,
  isPreview,
}: SubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<IntegrationResult[] | null>(null);
  const [legacyResult, setLegacyResult] = useState<{
    success: boolean;
    issueKey?: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [enabledCount, setEnabledCount] = useState(0);
  const [enabledIntegrations, setEnabledIntegrations] = useState<
    IntegrationId[]
  >([]);

  // Jira options state
  const [jiraAssignees, setJiraAssignees] = useState<JiraUser[]>([]);
  const [jiraPriorities, setJiraPriorities] = useState<JiraPriority[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [epicKey, setEpicKey] = useState<string>("");
  const [loadingJiraOptions, setLoadingJiraOptions] = useState(false);

  const loadJiraOptions = useCallback(async (projectKey: string) => {
    setLoadingJiraOptions(true);
    try {
      const [assigneesRes, prioritiesRes] = await Promise.all([
        new Promise<{ success: boolean; data?: JiraUser[] }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "FETCH_JIRA_ASSIGNEES", projectKey },
            resolve
          );
        }),
        new Promise<{ success: boolean; data?: JiraPriority[] }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "FETCH_JIRA_PRIORITIES" },
            resolve
          );
        }),
      ]);
      if (assigneesRes.success && assigneesRes.data)
        setJiraAssignees(assigneesRes.data);
      if (prioritiesRes.success && prioritiesRes.data)
        setJiraPriorities(prioritiesRes.data);
    } finally {
      setLoadingJiraOptions(false);
    }
  }, []);

  // Helper function to refresh integration status
  const refreshIntegrations = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ALL_INTEGRATIONS" }, (r) => {
      if (r?.integrations) {
        const enabled = (
          r.integrations as Array<{ id: IntegrationId; enabled: boolean }>
        ).filter((i) => i.enabled);
        setEnabledCount(enabled.length);
        setEnabledIntegrations(enabled.map((i) => i.id));
      }
    });
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "CHECK_AUTH_STATUS" }, (r) => {
      if (r?.siteUrl) setSiteUrl(r.siteUrl);
    });
    // Ask background for enabled integrations (handles legacy Jira migration)
    refreshIntegrations();
    // Load title prefix and generate summary
    chrome.storage.sync.get(STORAGE_KEYS.TITLE_PREFIX, (result) => {
      const prefix = result[STORAGE_KEYS.TITLE_PREFIX] ?? "[BugShot]";
      setEditSummary(generatePreviewSummary(changes, prefix));
    });

    // Load Jira project key for options - check both legacy and new storage
    chrome.storage.sync.get(
      [STORAGE_KEYS.EPIC_CONFIG, STORAGE_KEYS.INTEGRATIONS],
      (result) => {
        const legacyConfig = result[STORAGE_KEYS.EPIC_CONFIG];
        const integrations = result[STORAGE_KEYS.INTEGRATIONS] as
          | Record<string, { settings?: { projectKey?: string } }>
          | undefined;
        const jiraIntegration = integrations?.jira;

        // Try legacy config first, then fall back to new integration config
        const projectKey =
          legacyConfig?.projectKey || jiraIntegration?.settings?.projectKey;

        console.log("[SubmitPanel] EPIC_CONFIG:", legacyConfig);
        console.log("[SubmitPanel] INTEGRATIONS.jira:", jiraIntegration);
        console.log("[SubmitPanel] Resolved projectKey:", projectKey);

        if (projectKey) {
          console.log(
            "[SubmitPanel] Loading Jira options for project:",
            projectKey
          );
          loadJiraOptions(projectKey);
        } else {
          console.log(
            "[SubmitPanel] No projectKey configured, skipping Jira options load"
          );
        }
      }
    );

    // Load saved Jira submit options
    chrome.storage.local.get(STORAGE_KEYS.JIRA_SUBMIT_OPTIONS, (result) => {
      const opts = result[STORAGE_KEYS.JIRA_SUBMIT_OPTIONS];
      if (opts) {
        if (opts.assigneeId) setSelectedAssignee(opts.assigneeId);
        if (opts.priorityId) setSelectedPriority(opts.priorityId);
        if (opts.epicKey) setEpicKey(opts.epicKey);
      }
    });
  }, [changes, loadJiraOptions, refreshIntegrations]);

  // ── Listen for storage changes (real-time integration updates) ──
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "sync" || areaName === "local") {
        // Refresh integrations when they change
        if (changes[STORAGE_KEYS.INTEGRATIONS] || changes[STORAGE_KEYS.JIRA_CREDENTIALS]) {
          refreshIntegrations();
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refreshIntegrations]);

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
  const assigneeOptions: SelectOption[] = useMemo(
    () =>
      jiraAssignees.map((u) => ({
        value: u.accountId,
        label: u.displayName,
        avatarUrl: u.avatarUrl,
      })),
    [jiraAssignees]
  );

  const priorityOptions: SelectOption[] = useMemo(
    () =>
      jiraPriorities.map((p) => ({
        value: p.id,
        label: p.name,
      })),
    [jiraPriorities]
  );

  const handleCopy = useCallback(async () => {
    const html = generateHtml(
      editSummary,
      changes,
      description,
      screenshots.length
    );
    const plain = generatePlainText(editSummary, changes, description);

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editSummary, changes, description, screenshots.length]);

  const handleSubmit = async () => {
    // Prevent submission if no platform is connected
    if (!hasConnectedPlatform) {
      console.warn("[SubmitPanel] Submit blocked: No connected platforms");
      setResults([
        {
          integrationId: "jira",
          success: false,
          error: "No platforms connected. Please configure integrations in Settings.",
        },
      ]);
      return;
    }

    setIsSubmitting(true);
    setResults(null);
    setLegacyResult(null);

    // Collect all screenshots
    const allScreenshots: Array<{ dataUrl: string; filename: string }> =
      screenshots.map((ss) => ({
        dataUrl: ss.annotated || ss.original,
        filename: ss.filename,
      }));

    for (const c of changes) {
      const safeSel = c.selector.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      if (c.screenshotBefore)
        allScreenshots.push({
          dataUrl: c.screenshotBefore,
          filename: `${safeSel}-as-is.png`,
        });
      if (c.screenshotAfter)
        allScreenshots.push({
          dataUrl: c.screenshotAfter,
          filename: `${safeSel}-to-be.png`,
        });
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
        jiraOptions:
          Object.keys(jiraOptions).length > 0 ? jiraOptions : undefined,
      };

      try {
        const response = await sendMessage({
          type: "SUBMIT_TO_INTEGRATIONS",
          payload,
        });
        if (response.type === "INTEGRATION_RESULTS") {
          const r = (response as any).results as IntegrationResult[];
          setResults(r);
          if (r.every((res) => res.success)) {
            setTimeout(onSuccess, 3000);
          }
        }
      } catch (err) {
        setResults([
          {
            integrationId: "jira",
            success: false,
            error: (err as Error).message,
          },
        ]);
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
        const response = await sendMessage({ type: "SUBMIT_TO_JIRA", payload });
        if (response.type === "JIRA_SUBMIT_RESULT") {
          setLegacyResult({
            success: response.success,
            issueKey: response.issueKey,
            error: response.error,
          });
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
  const legacyIssueUrl =
    siteUrl && legacyResult?.issueKey
      ? `https://${siteUrl}/browse/${legacyResult.issueKey}`
      : null;

  const submitLabel = useMultiIntegration
    ? enabledCount === 1
      ? `Create ${INTEGRATION_LABELS[enabledIntegrations[0]]} Issue`
      : `Create Issue in ${enabledCount} Integrations`
    : "Create Jira Issue";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Issue Summary */}
        <div>
          <h3 className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-2">
            <span className="text-slate-400">[</span>Issue Summary
            <span className="text-slate-400">]</span>
          </h3>
          <input
            className="w-full px-3 py-2.5 text-sm text-slate-800 border border-slate-200 rounded-lg outline-none bg-white transition-colors focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            type="text"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Context */}
        <div>
          <h3 className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-2">
            <span className="text-slate-400">[</span>Context
            <span className="text-slate-400">]</span>
          </h3>
          <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div>
              Page:{" "}
              <a
                href={window.location.href}
                className="text-violet-600 hover:underline"
              >
                {window.location.href}
              </a>
            </div>
            <div className="mt-1">Captured: {new Date().toLocaleString()}</div>
          </div>
        </div>

        {/* CSS Changes */}
        {changes.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <span className="text-slate-400">[</span>CSS Changes
              <span className="text-slate-400">]</span>
              <span className="text-xs font-medium text-violet-600">
                {changes.length}
              </span>
            </h3>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-3">
              {changes.map((change) => {
                const meta = change.properties.filter((p) =>
                  SPECIAL_PROPS.has(p.property)
                );
                const styles = change.properties.filter(
                  (p) => !SPECIAL_PROPS.has(p.property)
                );

                return (
                  <div key={change.id} className="text-xs">
                    <code className="block text-violet-700 font-mono mb-2 break-all">
                      {change.selector}
                    </code>

                    {change.description && (
                      <div className="text-slate-600 leading-relaxed whitespace-pre-wrap mb-2">
                        {change.description}
                      </div>
                    )}

                    {meta.length > 0 &&
                      meta.map((m, i) => (
                        <div key={i} className="py-0.5">
                          <span className="font-medium text-slate-700">
                            {m.property}:
                          </span>{" "}
                          <span className="text-red-500 line-through">
                            {m.asIs}
                          </span>
                          <span className="text-slate-400 mx-1">&rarr;</span>
                          <span className="text-green-600 font-medium">
                            {m.toBe}
                          </span>
                        </div>
                      ))}

                    {styles.length > 0 &&
                      styles.map((s, i) => (
                        <div key={i} className="py-0.5">
                          <span className="font-medium text-slate-700">
                            {s.property}:
                          </span>{" "}
                          <span className="text-red-500 line-through">
                            {s.asIs}
                          </span>
                          <span className="text-slate-400 mx-1">&rarr;</span>
                          <span className="text-green-600 font-medium">
                            {s.toBe}
                          </span>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expected Result (Notes) */}
        {description.trim() && (
          <div>
            <h3 className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-2">
              <span className="text-slate-400">[</span>Expected Result
              <span className="text-slate-400">]</span>
            </h3>
            <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100 whitespace-pre-wrap">
              {description}
            </div>
          </div>
        )}

        {/* Media */}
        {(screenshots.length > 0 || (videoRecordingId && videoDataUrl)) && (
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <span className="text-slate-400">[</span>Media
              <span className="text-slate-400">]</span>
              <span className="text-xs font-medium text-violet-600">
                {screenshots.length + (videoRecordingId ? 1 : 0)}
              </span>
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {screenshots.map((ss, i) => (
                <div
                  key={i}
                  className="aspect-square bg-slate-100 rounded-lg border border-slate-200 overflow-hidden"
                >
                  <img
                    src={ss.annotated || ss.original}
                    alt={`Screenshot ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {videoRecordingId && videoDataUrl && (
                <div className="aspect-square bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative">
                  <video
                    src={videoDataUrl}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-slate-700 ml-0.5"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Copy as Markdown */}
        <Button variant="outline" className="w-full" onClick={handleCopy}>
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "Copied!" : "Copy as Markdown"}
        </Button>

        {/* Jira Settings */}
        {enabledIntegrations.includes("jira") && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5">
                Assignee
              </Label>
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
              <Label className="text-xs font-medium text-slate-700 mb-1.5">
                Priority
              </Label>
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
              <Label className="text-xs font-medium text-slate-700 mb-1.5">
                Parent Epic
              </Label>
              <Input
                type="text"
                value={epicKey}
                onChange={(e) => setEpicKey(e.target.value.toUpperCase())}
                placeholder="e.g. PROJ-123"
                className="border-slate-200"
              />
            </div>
          </div>
        )}

        {/* Multi-integration results */}
        {results && (
          <div className="flex flex-col gap-1.5 mb-3">
            {results.map((r) => (
              <div
                key={r.integrationId}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md text-xs",
                  r.success
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                )}
              >
                <span className="flex-shrink-0 font-bold">
                  {r.success ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span>
                    <strong>{INTEGRATION_LABELS[r.integrationId]}</strong>
                    {r.issueKey && `: ${r.issueKey}`}
                    {!r.success && r.error && `: ${r.error}`}
                  </span>
                  {r.url && r.success && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-700 break-all hover:underline"
                    >
                      {r.url}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.integrationId}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs",
                  r.success
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-red-50 text-red-700 border border-red-100"
                )}
              >
                {r.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium">
                    {INTEGRATION_LABELS[r.integrationId]}
                    {r.issueKey && `: ${r.issueKey}`}
                    {!r.success && r.error && ` - ${r.error}`}
                  </span>
                  {r.url && r.success && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 break-all hover:underline"
                    >
                      {r.url}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {legacyResult && (
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs",
              legacyResult.success
                ? "bg-green-50 text-green-700 border border-green-100"
                : "bg-red-50 text-red-700 border border-red-100"
            )}
          >
            {legacyResult.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <div className="flex flex-col gap-0.5 min-w-0">
              {legacyResult.success ? (
                <>
                  <span className="font-medium">
                    Created {legacyResult.issueKey}
                  </span>
                  {legacyIssueUrl && (
                    <a
                      href={legacyIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 break-all hover:underline"
                    >
                      {legacyIssueUrl}
                    </a>
                  )}
                </>
              ) : (
                <span>Failed: {legacyResult.error}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer with Previous and Submit buttons */}
      {!allSuccess && !legacyResult?.success && (
        <div className="flex-shrink-0 border-t border-slate-100">
          {/* Warning banner if no platform connected */}
          {!hasConnectedPlatform && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
              <svg
                className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1 text-xs text-amber-700">
                <div className="font-medium mb-1">Cannot create issue</div>
                <div className="mb-2">No platforms connected. Configure Jira, GitHub, or N8N to submit issues.</div>
                {onGoToSettings && (
                  <button
                    onClick={onGoToSettings}
                    className="text-amber-800 underline hover:text-amber-900 font-medium"
                  >
                    Open Settings →
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3">
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="w-3 h-3" />
                Previous
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting || !editSummary.trim() || !hasConnectedPlatform}
              title={!hasConnectedPlatform ? "Connect to a platform first" : undefined}
            >
              {isSubmitting ? (
                "Creating..."
              ) : (
                <>
                  {submitLabel}
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

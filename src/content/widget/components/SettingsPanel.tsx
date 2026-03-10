import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS, type DisplayMode } from "@/shared/constants";
import type { EpicConfig } from "@/shared/types/jira-ticket";
import { cn } from "@/shared/utils/cn";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ChevronDown, Check, Eye, EyeOff, PanelRight, Layers } from "lucide-react";

interface JiraProject {
  id: string;
  key: string;
  name: string;
}
interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

function sendMsg(message: object): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (r) => resolve(r ?? {}));
  });
}

// ── Jira Section ──
function JiraSection({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    siteUrl?: string;
  }>({ authenticated: false });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [config, setConfig] = useState<EpicConfig>({
    projectKey: "",
    projectName: "",
    issueType: "Task",
    parentKey: "",
    parentSummary: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: "CHECK_AUTH_STATUS" }).then((r) => {
      const authenticated = !!r.authenticated;
      setAuthStatus({
        authenticated,
        siteUrl: r.siteUrl as string | undefined,
      });
      if (authenticated) {
        setOpen(true);
        loadProjects();
      }
    });
    chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG, (result) => {
      if (result[STORAGE_KEYS.EPIC_CONFIG])
        setConfig((p) => ({ ...p, ...result[STORAGE_KEYS.EPIC_CONFIG] }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setFetchError(null);
    try {
      const res = await sendMsg({ type: "FETCH_JIRA_PROJECTS" });
      if (res.success) setProjects(res.data as JiraProject[]);
      else setFetchError(res.error as string);
    } catch {
      setFetchError("Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadProjectDetails = useCallback(async (projectKey: string) => {
    if (!projectKey) {
      setIssueTypes([]);
      return;
    }
    setLoadingDetails(true);
    setFetchError(null);
    try {
      const res = await sendMsg({ type: "FETCH_JIRA_ISSUE_TYPES", projectKey });
      if (res.success) setIssueTypes(res.data as JiraIssueType[]);
      else setFetchError(res.error as string);
    } catch {
      setFetchError("Failed to load issue types");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus.authenticated && config.projectKey && projects.length > 0)
      loadProjectDetails(config.projectKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus.authenticated, config.projectKey, projects.length]);

  const handleConnect = useCallback(() => {
    if (!siteUrl.trim() || !email.trim() || !apiToken.trim()) {
      setAuthError("All fields are required");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    sendMsg({
      type: "SAVE_JIRA_CREDENTIALS",
      email: email.trim(),
      apiToken: apiToken.trim(),
      siteUrl: siteUrl.trim(),
    }).then((response) => {
      setAuthLoading(false);
      if (response.success) {
        const normalized = siteUrl
          .trim()
          .replace(/^https?:\/\//, "")
          .replace(/\/+$/, "");
        setAuthStatus({ authenticated: true, siteUrl: normalized });
        setApiToken("");
        loadProjects();

        // Also save to integration config
        sendMsg({
          type: "SAVE_INTEGRATION_CONFIG",
          integrationId: "jira",
          credentials: {
            email: email.trim(),
            apiToken: apiToken.trim(),
            siteUrl: normalized,
          },
          settings: config.projectKey
            ? {
                projectKey: config.projectKey,
                issueType: config.issueType,
                parentKey: config.parentKey || "",
              }
            : {},
        });
      } else {
        const errorMsg = (response.error as string) || "Connection failed";
        console.warn("[JiraSection] Connection failed:", errorMsg);
        setAuthError(errorMsg);
      }
    });
  }, [siteUrl, email, apiToken, loadProjects, config]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: "DISCONNECT_JIRA" }).then(() => {
      sendMsg({ type: "DISCONNECT_INTEGRATION", integrationId: "jira" });
      setAuthStatus({ authenticated: false });
      setSiteUrl("");
      setEmail("");
      setApiToken("");
      setProjects([]);
      setIssueTypes([]);
      setConfig({
        projectKey: "",
        projectName: "",
        issueType: "Task",
        parentKey: "",
        parentSummary: "",
      });
    });
  }, []);

  const handleProjectChange = useCallback(
    (key: string) => {
      const proj = projects.find((p) => p.key === key);
      setConfig((prev) => ({
        ...prev,
        projectKey: key,
        projectName: proj?.name || "",
        issueType: "Task",
        parentKey: "",
        parentSummary: "",
      }));
      if (key) loadProjectDetails(key);
    },
    [projects, loadProjectDetails]
  );

  const handleSave = useCallback(() => {
    chrome.storage.sync.set({ [STORAGE_KEYS.EPIC_CONFIG]: config }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
    // Also update Jira integration settings in INTEGRATIONS storage
    if (authStatus.authenticated) {
      chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS, (result) => {
        const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
        if (configs.jira) {
          configs.jira.settings = {
            projectKey: config.projectKey,
            issueType: config.issueType,
          };
          chrome.storage.sync.set({ [STORAGE_KEYS.INTEGRATIONS]: configs });
        }
      });
    }
  }, [config, authStatus]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        className="flex items-center justify-between w-full px-3 py-2.5 border-none bg-slate-50 cursor-pointer font-inherit transition-colors hover:bg-slate-100"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M11.53 2H11.49C10.61 2 9.91 2.7 9.91 3.58C9.91 4.46 10.61 5.16 11.49 5.16H11.53C12.41 5.16 13.11 4.46 13.11 3.58C13.11 2.7 12.41 2 11.53 2Z"
              fill="#2684FF"
            />
            <path
              d="M20.58 12.42L12.47 4.31C12.19 4.03 11.81 4.03 11.53 4.31L3.42 12.42C3.14 12.7 3.14 13.08 3.42 13.36L11.53 21.47C11.81 21.75 12.19 21.75 12.47 21.47L20.58 13.36C20.86 13.08 20.86 12.7 20.58 12.42Z"
              fill="#2684FF"
            />
          </svg>
          <span className="text-xs font-semibold text-slate-800">Jira</span>
          {authStatus.authenticated && (
            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
              Connected
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-gray-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="p-3 border-t border-gray-200">
          {authStatus.authenticated ? (
            <>
              <div className="flex items-center gap-1.5 text-xs p-2 rounded-lg bg-green-50 text-green-600 mb-2">
                <Check className="w-3.5 h-3.5" />
                Connected to {authStatus.siteUrl || "Jira"}
              </div>
              <Button
                variant="ghost"
                className="w-full mb-3"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>

              {fetchError && (
                <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-red-50 text-red-600 mb-2">
                  {fetchError}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadProjects}
                    className="ml-auto px-1.5 text-[11px]"
                  >
                    Retry
                  </Button>
                </div>
              )}

              <div className="mb-2.5">
                <Label>Project</Label>
                {loadingProjects ? (
                  <div className="text-xs text-gray-400 p-1.5 bg-slate-50 rounded-md border border-gray-200">
                    Loading projects...
                  </div>
                ) : (
                  <select
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md outline-none bg-white text-slate-800 cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20width=%2710%27%20height=%276%27%20viewBox=%270%200%2010%206%27%20fill=%27none%27%20xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath%20d=%27M1%201L5%205L9%201%27%20stroke=%27%2394a3b8%27%20stroke-width=%271.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_8px_center] pr-7 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={config.projectKey}
                    onChange={(e) => handleProjectChange(e.target.value)}
                  >
                    <option value="">Select a project</option>
                    {projects.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.key} — {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {config.projectKey && (
                <div className="mb-2.5">
                  <Label>Issue Type</Label>
                  {loadingDetails ? (
                    <div className="text-xs text-gray-400 p-1.5 bg-slate-50 rounded-md border border-gray-200">
                      Loading...
                    </div>
                  ) : (
                    <select
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md outline-none bg-white text-slate-800 cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20width=%2710%27%20height=%276%27%20viewBox=%270%200%2010%206%27%20fill=%27none%27%20xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath%20d=%27M1%201L5%205L9%201%27%20stroke=%27%2394a3b8%27%20stroke-width=%271.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_8px_center] pr-7 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      value={config.issueType}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          issueType: e.target.value,
                        }))
                      }
                    >
                      {issueTypes.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                          {t.subtask ? " (Sub-task)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <Button
                variant="default"
                className="w-full"
                onClick={handleSave}
                disabled={!config.projectKey}
              >
                {saved ? "Saved!" : "Save Settings"}
              </Button>
            </>
          ) : (
            <>
              <div className="mb-2.5">
                <Label>Site URL</Label>
                <Input
                  type="text"
                  placeholder="mycompany.atlassian.net"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                />
              </div>
              <div className="mb-2.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="mb-2.5">
                <Label className="flex items-center justify-between">
                  API Token
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-normal text-blue-500 hover:underline"
                  >
                    Get token
                  </a>
                </Label>
                <div className="flex gap-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="Paste API token"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken((p) => !p)}
                    title={showToken ? "Hide" : "Show"}
                  >
                    {showToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              {authError && (
                <div className="text-xs p-2 rounded-lg bg-red-50 text-red-600 mb-2">
                  {authError}
                </div>
              )}
              <Button
                variant="default"
                className="w-full mt-2"
                onClick={handleConnect}
                disabled={authLoading}
              >
                {authLoading ? "Connecting..." : "Connect"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── GitHub Section ──
function GithubSection() {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [labels, setLabels] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: "CHECK_INTEGRATION_STATUS", integrationId: "github" }).then(
      (r) => {
        if (r.connected) {
          setConnected(true);
          setDisplayName((r.displayName as string) || "");
          setOpen(true);
        }
      }
    );
    // Load saved settings
    chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS, (result) => {
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
      const gh = configs.github;
      if (gh) {
        setOwner(gh.settings?.owner || "");
        setRepo(gh.settings?.repo || "");
        setLabels(gh.settings?.labels || "");
      }
    });
  }, []);

  const handleConnect = useCallback(() => {
    if (!token.trim() || !owner.trim() || !repo.trim()) {
      setError("Token, owner, and repo are required");
      return;
    }
    setLoading(true);
    setError(null);
    sendMsg({
      type: "SAVE_INTEGRATION_CONFIG",
      integrationId: "github",
      credentials: { token: token.trim() },
      settings: {
        owner: owner.trim(),
        repo: repo.trim(),
        labels: labels.trim(),
      },
    }).then((r) => {
      setLoading(false);
      if (r.success) {
        setConnected(true);
        setDisplayName((r.displayName as string) || owner.trim());
        setToken("");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const errorMsg = (r.error as string) || "Connection failed";
        console.warn("[GithubSection] Connection failed:", errorMsg);
        setError(errorMsg);
      }
    });
  }, [token, owner, repo, labels]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: "DISCONNECT_INTEGRATION", integrationId: "github" }).then(
      () => {
        setConnected(false);
        setDisplayName("");
        setToken("");
        setOwner("");
        setRepo("");
        setLabels("");
      }
    );
  }, []);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        className="flex items-center justify-between w-full px-3 py-2.5 border-none bg-slate-50 cursor-pointer font-inherit transition-colors hover:bg-slate-100"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span className="text-xs font-semibold text-slate-800">GitHub</span>
          {connected && (
            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
              Connected
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-gray-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="p-3 border-t border-gray-200">
          {connected ? (
            <>
              <div className="flex items-center gap-1.5 text-xs p-2 rounded-lg bg-green-50 text-green-600 mb-2">
                <Check className="w-3.5 h-3.5" />
                Connected as {displayName}
                {owner && repo && (
                  <span className="opacity-70 ml-1">
                    ({owner}/{repo})
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <div className="mb-2.5">
                <Label className="flex items-center justify-between">
                  Personal Access Token
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-normal text-blue-500 hover:underline"
                  >
                    Create token
                  </a>
                </Label>
                <div className="flex gap-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="ghp_..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken((p) => !p)}
                    title={showToken ? "Hide" : "Show"}
                  >
                    {showToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="mb-2.5">
                <Label>Repository Owner</Label>
                <Input
                  type="text"
                  placeholder="octocat"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>
              <div className="mb-2.5">
                <Label>Repository Name</Label>
                <Input
                  type="text"
                  placeholder="my-project"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
              </div>
              <div className="mb-2.5">
                <Label>
                  Labels{" "}
                  <span className="text-[10px] font-normal text-gray-400">
                    optional, comma-separated
                  </span>
                </Label>
                <Input
                  type="text"
                  placeholder="bugshot, bug"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                />
              </div>
              {error && (
                <div className="text-xs p-2 rounded-lg bg-red-50 text-red-600 mb-2">
                  {error}
                </div>
              )}
              <Button
                variant="default"
                className="w-full mt-2"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? "Connecting..." : saved ? "Saved!" : "Connect"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Webhook Section ──
function WebhookSection() {
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: "CHECK_INTEGRATION_STATUS", integrationId: "webhook" }).then(
      (r) => {
        if (r.connected) {
          setConnected(true);
          setDisplayName((r.displayName as string) || "");
          setOpen(true);
        }
      }
    );
    chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS, (result) => {
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
      const webhook = configs.webhook;
      if (webhook) setWebhookUrl(webhook.credentials?.webhookUrl || "");
    });
  }, []);

  const handleConnect = useCallback(() => {
    if (!webhookUrl.trim()) {
      setError("Webhook URL is required");
      return;
    }
    setLoading(true);
    setError(null);
    sendMsg({
      type: "SAVE_INTEGRATION_CONFIG",
      integrationId: "webhook",
      credentials: { webhookUrl: webhookUrl.trim() },
      settings: {},
    }).then((r) => {
      setLoading(false);
      if (r.success) {
        setConnected(true);
        setDisplayName((r.displayName as string) || "");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const errorMsg = (r.error as string) || "Verification failed";
        console.warn("[WebhookSection] Connection failed:", errorMsg);
        setError(errorMsg);
      }
    });
  }, [webhookUrl]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: "DISCONNECT_INTEGRATION", integrationId: "webhook" }).then(
      () => {
        setConnected(false);
        setDisplayName("");
        setWebhookUrl("");
      }
    );
  }, []);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        className="flex items-center justify-between w-full px-3 py-2.5 border-none bg-slate-50 cursor-pointer font-inherit transition-colors hover:bg-slate-100"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="4" fill="#6366f1" />
            <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-xs font-semibold text-slate-800">Webhook</span>
          {connected && (
            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
              Connected
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-gray-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="p-3 border-t border-gray-200">
          {connected ? (
            <>
              <div className="flex items-center gap-1.5 text-xs p-2 rounded-lg bg-green-50 text-green-600 mb-2">
                <Check className="w-3.5 h-3.5" />
                Connected to {displayName || "Webhook"}
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <div className="text-[10px] text-gray-500 mb-2">
                Works with Zapier, Make, n8n, or any custom endpoint
              </div>
              <div className="mb-2.5">
                <Label>Webhook URL</Label>
                <Input
                  type="url"
                  placeholder="https://hooks.example.com/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
              {error && (
                <div className="text-xs p-2 rounded-lg bg-red-50 text-red-600 mb-2">
                  {error}
                </div>
              )}
              <Button
                variant="default"
                className="w-full mt-2"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? "Verifying..." : saved ? "Verified!" : "Connect"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Settings Panel ──
export function SettingsPanel() {
  const [recent, setRecent] = useState<
    Array<{ key: string; summary: string; createdAt: number }>
  >([]);
  const [titlePrefix, setTitlePrefix] = useState("[BugShot]");
  const [prefixSaved, setPrefixSaved] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("widget");

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS, (result) => {
      if (result[STORAGE_KEYS.RECENT_SUBMISSIONS])
        setRecent(result[STORAGE_KEYS.RECENT_SUBMISSIONS].slice(0, 5));
    });
    chrome.storage.sync.get(STORAGE_KEYS.TITLE_PREFIX, (result) => {
      if (result[STORAGE_KEYS.TITLE_PREFIX] !== undefined)
        setTitlePrefix(result[STORAGE_KEYS.TITLE_PREFIX]);
    });
    chrome.storage.local.get(STORAGE_KEYS.DISPLAY_MODE, (result) => {
      if (result[STORAGE_KEYS.DISPLAY_MODE])
        setDisplayMode(result[STORAGE_KEYS.DISPLAY_MODE]);
    });
  }, []);

  const handlePrefixSave = useCallback(() => {
    chrome.storage.sync.set(
      { [STORAGE_KEYS.TITLE_PREFIX]: titlePrefix },
      () => {
        setPrefixSaved(true);
        setTimeout(() => setPrefixSaved(false), 2000);
      }
    );
  }, [titlePrefix]);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    chrome.storage.local.set({ [STORAGE_KEYS.DISPLAY_MODE]: mode });
  }, []);

  return (
    <div className="py-1">
      <section className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">
          General
        </h3>

        {/* Display Mode Toggle */}
        <div className="mb-3">
          <Label>Display Mode</Label>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => handleDisplayModeChange("widget")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                displayMode === "widget"
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              <Layers className="w-4 h-4" />
              Widget
            </button>
            <button
              onClick={() => handleDisplayModeChange("panel")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                displayMode === "panel"
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              <PanelRight className="w-4 h-4" />
              Side Panel
            </button>
          </div>
          <div className="text-[11px] text-gray-400 mt-1.5">
            {displayMode === "widget"
              ? "Floating widget on page (current)"
              : "Browser side panel - click extension icon to open"}
          </div>
        </div>

        <div className="mb-2.5">
          <Label>Title Prefix</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="[BugShot]"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              className="flex-1"
            />
            <Button variant="secondary" onClick={handlePrefixSave}>
              {prefixSaved ? "Saved!" : "Save"}
            </Button>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Example: {titlePrefix} Page Title - bug description
          </div>
        </div>
      </section>

      <section className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
          Integrations
        </h3>
        <div className="text-xs text-gray-500 mb-2.5">
          Connect at least one platform to create issues
        </div>
        <div className="flex flex-col gap-2">
          <JiraSection defaultOpen />
          <GithubSection />
          <WebhookSection />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="px-4 py-3">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">
            Recent Issues
          </h3>
          <div className="flex flex-col gap-1.5">
            {recent.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <code className="font-mono text-[11px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  {item.key}
                </code>
                <span className="text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                  {item.summary}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

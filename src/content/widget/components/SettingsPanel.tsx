import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';
import type { EpicConfig } from '@/shared/types/jira-ticket';

interface JiraProject { id: string; key: string; name: string }
interface JiraIssueType { id: string; name: string; subtask: boolean }
interface JiraSearchResult { key: string; summary: string; issueType: string; status: string }

function sendMsg(message: object): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (r) => resolve(r ?? {}));
  });
}

export function SettingsPanel() {
  // ── Auth ──
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    siteUrl?: string;
  }>({ authenticated: false });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Credential form ──
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  // ── Dynamic Jira data ──
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Parent issue search ──
  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<JiraSearchResult[]>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const parentFieldRef = useRef<HTMLDivElement>(null);

  // ── Config ──
  const [config, setConfig] = useState<EpicConfig>({
    projectKey: '',
    projectName: '',
    issueType: 'Task',
    parentKey: '',
    parentSummary: '',
  });
  const [saved, setSaved] = useState(false);

  // ── Recent ──
  const [recent, setRecent] = useState<Array<{ key: string; summary: string; createdAt: number }>>([]);

  // ── Load on mount ──
  useEffect(() => {
    sendMsg({ type: 'CHECK_AUTH_STATUS' }).then((r) => {
      const authenticated = !!r.authenticated;
      const sUrl = r.siteUrl as string | undefined;
      setAuthStatus({ authenticated, siteUrl: sUrl });
      if (authenticated) loadProjects();
    });

    chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG, (result) => {
      if (result[STORAGE_KEYS.EPIC_CONFIG]) {
        setConfig((prev) => ({ ...prev, ...result[STORAGE_KEYS.EPIC_CONFIG] }));
      }
    });

    chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS, (result) => {
      if (result[STORAGE_KEYS.RECENT_SUBMISSIONS]) {
        setRecent(result[STORAGE_KEYS.RECENT_SUBMISSIONS].slice(0, 5));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close parent dropdown on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (parentFieldRef.current && !parentFieldRef.current.contains(e.target as Node)) {
        setParentDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Load projects ──
  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setFetchError(null);
    try {
      const res = await sendMsg({ type: 'FETCH_JIRA_PROJECTS' });
      if (res.success) setProjects(res.data as JiraProject[]);
      else setFetchError(res.error as string);
    } catch {
      setFetchError('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // ── Load issue types for a project ──
  const loadProjectDetails = useCallback(async (projectKey: string) => {
    if (!projectKey) { setIssueTypes([]); return; }
    setLoadingDetails(true);
    setFetchError(null);
    try {
      const res = await sendMsg({ type: 'FETCH_JIRA_ISSUE_TYPES', projectKey });
      if (res.success) setIssueTypes(res.data as JiraIssueType[]);
      else setFetchError(res.error as string);
    } catch {
      setFetchError('Failed to load issue types');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // ── On saved config's project → load details ──
  useEffect(() => {
    if (authStatus.authenticated && config.projectKey && projects.length > 0) {
      loadProjectDetails(config.projectKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus.authenticated, config.projectKey, projects.length]);

  // ── Debounced parent issue search ──
  const handleParentSearch = useCallback((query: string) => {
    setParentQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim() || !config.projectKey) {
      setParentResults([]);
      setParentDropdownOpen(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setParentSearching(true);
      try {
        const res = await sendMsg({
          type: 'SEARCH_JIRA_ISSUES',
          projectKey: config.projectKey,
          query: query.trim(),
        });
        if (res.success) {
          setParentResults(res.data as JiraSearchResult[]);
          setParentDropdownOpen(true);
        }
      } finally {
        setParentSearching(false);
      }
    }, 400);
  }, [config.projectKey]);

  // ── Determine if selected issue type is a sub-task ──
  const selectedType = issueTypes.find((t) => t.name === config.issueType);
  const isSubtask = selectedType?.subtask ?? false;

  // ── Auth handlers ──
  const handleConnect = useCallback(() => {
    if (!siteUrl.trim() || !email.trim() || !apiToken.trim()) {
      setAuthError('All fields are required');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    sendMsg({
      type: 'SAVE_JIRA_CREDENTIALS',
      email: email.trim(),
      apiToken: apiToken.trim(),
      siteUrl: siteUrl.trim(),
    }).then((response) => {
      setAuthLoading(false);
      if (response.success) {
        setAuthStatus({
          authenticated: true,
          siteUrl: siteUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
        });
        setApiToken('');
        loadProjects();
      } else {
        setAuthError((response.error as string) || 'Connection failed');
      }
    });
  }, [siteUrl, email, apiToken, loadProjects]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: 'DISCONNECT_JIRA' }).then(() => {
      setAuthStatus({ authenticated: false });
      setSiteUrl('');
      setEmail('');
      setApiToken('');
      setProjects([]);
      setIssueTypes([]);
      setConfig({
        projectKey: '',
        projectName: '',
        issueType: 'Task',
        parentKey: '',
        parentSummary: '',
          });
    });
  }, []);

  // ── Project selection ──
  const handleProjectChange = useCallback((key: string) => {
    const proj = projects.find((p) => p.key === key);
    setConfig((prev) => ({
      ...prev,
      projectKey: key,
      projectName: proj?.name || '',
      issueType: 'Task',
      parentKey: '',
      parentSummary: '',
    }));
    setParentQuery('');
    setParentResults([]);
    if (key) loadProjectDetails(key);
  }, [projects, loadProjectDetails]);

  // ── Parent issue selection ──
  const handleSelectParent = useCallback((issue: JiraSearchResult) => {
    setConfig((prev) => ({
      ...prev,
      parentKey: issue.key,
      parentSummary: issue.summary,
    }));
    setParentQuery('');
    setParentDropdownOpen(false);
    setParentResults([]);
  }, []);

  const handleClearParent = useCallback(() => {
    setConfig((prev) => ({ ...prev, parentKey: '', parentSummary: '' }));
  }, []);

  // ── Save ──
  const handleSave = useCallback(() => {
    chrome.storage.sync.set({ [STORAGE_KEYS.EPIC_CONFIG]: config }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [config]);

  return (
    <div className="qa-settings">
      {/* ── Jira Connection ── */}
      <section className="qa-settings-section">
        <h3 className="qa-settings-heading">Jira Connection</h3>
        {authStatus.authenticated ? (
          <>
            <div className="qa-settings-status qa-settings-status-ok">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Connected to {authStatus.siteUrl || 'Jira'}
            </div>
            <button
              className="qa-btn qa-btn-ghost qa-btn-block"
              onClick={handleDisconnect}
              style={{ marginTop: 8 }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div className="qa-settings-field">
              <label className="qa-settings-label">Site URL</label>
              <input
                className="qa-settings-input"
                type="text"
                placeholder="mycompany.atlassian.net"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="qa-settings-field">
              <label className="qa-settings-label">Email</label>
              <input
                className="qa-settings-input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="qa-settings-field">
              <label className="qa-settings-label">
                API Token
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="qa-settings-link"
                >
                  Get token
                </a>
              </label>
              <div className="qa-settings-token-row">
                <input
                  className="qa-settings-input"
                  type={showToken ? 'text' : 'password'}
                  placeholder="Paste API token"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  spellCheck={false}
                />
                <button
                  className="qa-btn qa-btn-ghost qa-settings-token-toggle"
                  onClick={() => setShowToken((p) => !p)}
                  title={showToken ? 'Hide' : 'Show'}
                >
                  {showToken ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {authError && (
              <div className="qa-settings-status qa-settings-status-error">
                {authError}
              </div>
            )}

            <button
              className="qa-btn qa-btn-primary qa-btn-block"
              onClick={handleConnect}
              disabled={authLoading}
              style={{ marginTop: 8 }}
            >
              {authLoading ? 'Connecting...' : 'Connect'}
            </button>
          </>
        )}
      </section>

      {/* ── Issue Settings (only when connected) ── */}
      {authStatus.authenticated && (
        <section className="qa-settings-section">
          <h3 className="qa-settings-heading">Issue Settings</h3>

          {fetchError && (
            <div className="qa-settings-status qa-settings-status-error" style={{ marginBottom: 8 }}>
              {fetchError}
              <button
                className="qa-btn qa-btn-ghost"
                onClick={loadProjects}
                style={{ marginLeft: 'auto', padding: '0 6px', fontSize: 11 }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Project */}
          <div className="qa-settings-field">
            <label className="qa-settings-label">Project</label>
            {loadingProjects ? (
              <div className="qa-settings-loading">Loading projects...</div>
            ) : (
              <select
                className="qa-settings-input"
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

          {/* Issue Type */}
          {config.projectKey && (
            <div className="qa-settings-field">
              <label className="qa-settings-label">Issue Type</label>
              {loadingDetails ? (
                <div className="qa-settings-loading">Loading...</div>
              ) : (
                <select
                  className="qa-settings-input"
                  value={config.issueType}
                  onChange={(e) => setConfig((prev) => ({ ...prev, issueType: e.target.value }))}
                >
                  {issueTypes.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}{t.subtask ? ' (Sub-task)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {isSubtask && !config.parentKey && (
                <div className="qa-settings-field-hint qa-settings-field-hint-warn">
                  Select a parent issue below
                </div>
              )}
            </div>
          )}

          {/* Parent Issue */}
          {config.projectKey && (
            <div className="qa-settings-field" ref={parentFieldRef}>
              <label className="qa-settings-label">
                Parent Issue
                <span className="qa-settings-hint">
                  {isSubtask ? 'required' : 'optional'}
                </span>
              </label>

              {config.parentKey ? (
                <div className="qa-settings-parent-chip">
                  <div className="qa-settings-parent-chip-info">
                    <code className="qa-settings-parent-chip-key">{config.parentKey}</code>
                    <span className="qa-settings-parent-chip-summary">{config.parentSummary}</span>
                  </div>
                  <button
                    className="qa-btn qa-btn-ghost qa-settings-parent-chip-remove"
                    onClick={handleClearParent}
                    title="Remove"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="qa-settings-search-wrap">
                  <input
                    className="qa-settings-input"
                    type="text"
                    placeholder="Search by key or summary..."
                    value={parentQuery}
                    onChange={(e) => handleParentSearch(e.target.value)}
                    onFocus={() => { if (parentResults.length > 0) setParentDropdownOpen(true); }}
                    spellCheck={false}
                  />
                  {parentSearching && (
                    <span className="qa-settings-search-spinner" />
                  )}
                  {parentDropdownOpen && parentResults.length > 0 && (
                    <div className="qa-settings-search-dropdown">
                      {parentResults.map((issue) => (
                        <button
                          key={issue.key}
                          className="qa-settings-search-item"
                          onClick={() => handleSelectParent(issue)}
                        >
                          <span className="qa-settings-search-item-key">{issue.key}</span>
                          <span className="qa-settings-search-item-summary">{issue.summary}</span>
                          <span className="qa-settings-search-item-meta">
                            {issue.issueType} · {issue.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {parentDropdownOpen && !parentSearching && parentResults.length === 0 && parentQuery.trim() && (
                    <div className="qa-settings-search-dropdown">
                      <div className="qa-settings-search-empty">No results</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            className={`qa-btn ${saved ? 'qa-btn-success' : 'qa-btn-primary'} qa-btn-block`}
            onClick={handleSave}
            disabled={!config.projectKey}
          >
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </section>
      )}

      {/* ── Recent Submissions ── */}
      {recent.length > 0 && (
        <section className="qa-settings-section">
          <h3 className="qa-settings-heading">Recent Issues</h3>
          <div className="qa-settings-recent">
            {recent.map((item, i) => (
              <div key={i} className="qa-settings-recent-item">
                <code className="qa-settings-recent-key">{item.key}</code>
                <span className="qa-settings-recent-summary">{item.summary}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

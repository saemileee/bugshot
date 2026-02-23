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

// ── Jira Section ──
function JiraSection({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; siteUrl?: string }>({ authenticated: false });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<JiraSearchResult[]>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const parentFieldRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState<EpicConfig>({
    projectKey: '', projectName: '', issueType: 'Task', parentKey: '', parentSummary: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: 'CHECK_AUTH_STATUS' }).then((r) => {
      const authenticated = !!r.authenticated;
      setAuthStatus({ authenticated, siteUrl: r.siteUrl as string | undefined });
      if (authenticated) { setOpen(true); loadProjects(); }
    });
    chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG, (result) => {
      if (result[STORAGE_KEYS.EPIC_CONFIG]) setConfig((p) => ({ ...p, ...result[STORAGE_KEYS.EPIC_CONFIG] }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (parentFieldRef.current && !parentFieldRef.current.contains(e.target as Node)) setParentDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true); setFetchError(null);
    try {
      const res = await sendMsg({ type: 'FETCH_JIRA_PROJECTS' });
      if (res.success) setProjects(res.data as JiraProject[]);
      else setFetchError(res.error as string);
    } catch { setFetchError('Failed to load projects'); }
    finally { setLoadingProjects(false); }
  }, []);

  const loadProjectDetails = useCallback(async (projectKey: string) => {
    if (!projectKey) { setIssueTypes([]); return; }
    setLoadingDetails(true); setFetchError(null);
    try {
      const res = await sendMsg({ type: 'FETCH_JIRA_ISSUE_TYPES', projectKey });
      if (res.success) setIssueTypes(res.data as JiraIssueType[]);
      else setFetchError(res.error as string);
    } catch { setFetchError('Failed to load issue types'); }
    finally { setLoadingDetails(false); }
  }, []);

  useEffect(() => {
    if (authStatus.authenticated && config.projectKey && projects.length > 0) loadProjectDetails(config.projectKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus.authenticated, config.projectKey, projects.length]);

  const handleParentSearch = useCallback((query: string) => {
    setParentQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || !config.projectKey) { setParentResults([]); setParentDropdownOpen(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      setParentSearching(true);
      try {
        const res = await sendMsg({ type: 'SEARCH_JIRA_ISSUES', projectKey: config.projectKey, query: query.trim() });
        if (res.success) { setParentResults(res.data as JiraSearchResult[]); setParentDropdownOpen(true); }
      } finally { setParentSearching(false); }
    }, 400);
  }, [config.projectKey]);

  const selectedType = issueTypes.find((t) => t.name === config.issueType);
  const isSubtask = selectedType?.subtask ?? false;

  const handleConnect = useCallback(() => {
    if (!siteUrl.trim() || !email.trim() || !apiToken.trim()) { setAuthError('All fields are required'); return; }
    setAuthLoading(true); setAuthError(null);
    sendMsg({ type: 'SAVE_JIRA_CREDENTIALS', email: email.trim(), apiToken: apiToken.trim(), siteUrl: siteUrl.trim() }).then((response) => {
      setAuthLoading(false);
      if (response.success) {
        const normalized = siteUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        setAuthStatus({ authenticated: true, siteUrl: normalized });
        setApiToken('');
        loadProjects();

        // Also save to integration config
        sendMsg({
          type: 'SAVE_INTEGRATION_CONFIG',
          integrationId: 'jira',
          credentials: { email: email.trim(), apiToken: apiToken.trim(), siteUrl: normalized },
          settings: config.projectKey ? { projectKey: config.projectKey, issueType: config.issueType, parentKey: config.parentKey || '' } : {},
        });
      } else {
        setAuthError((response.error as string) || 'Connection failed');
      }
    });
  }, [siteUrl, email, apiToken, loadProjects, config]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: 'DISCONNECT_JIRA' }).then(() => {
      sendMsg({ type: 'DISCONNECT_INTEGRATION', integrationId: 'jira' });
      setAuthStatus({ authenticated: false });
      setSiteUrl(''); setEmail(''); setApiToken('');
      setProjects([]); setIssueTypes([]);
      setConfig({ projectKey: '', projectName: '', issueType: 'Task', parentKey: '', parentSummary: '' });
    });
  }, []);

  const handleProjectChange = useCallback((key: string) => {
    const proj = projects.find((p) => p.key === key);
    setConfig((prev) => ({ ...prev, projectKey: key, projectName: proj?.name || '', issueType: 'Task', parentKey: '', parentSummary: '' }));
    setParentQuery(''); setParentResults([]);
    if (key) loadProjectDetails(key);
  }, [projects, loadProjectDetails]);

  const handleSelectParent = useCallback((issue: JiraSearchResult) => {
    setConfig((prev) => ({ ...prev, parentKey: issue.key, parentSummary: issue.summary }));
    setParentQuery(''); setParentDropdownOpen(false); setParentResults([]);
  }, []);

  const handleClearParent = useCallback(() => {
    setConfig((prev) => ({ ...prev, parentKey: '', parentSummary: '' }));
  }, []);

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
            parentKey: config.parentKey || '',
          };
          chrome.storage.sync.set({ [STORAGE_KEYS.INTEGRATIONS]: configs });
        }
      });
    }
  }, [config, authStatus]);

  return (
    <div className="qa-integration-card">
      <button className="qa-integration-header" onClick={() => setOpen(!open)}>
        <div className="qa-integration-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M11.53 2H11.49C10.61 2 9.91 2.7 9.91 3.58C9.91 4.46 10.61 5.16 11.49 5.16H11.53C12.41 5.16 13.11 4.46 13.11 3.58C13.11 2.7 12.41 2 11.53 2Z" fill="#2684FF"/>
            <path d="M20.58 12.42L12.47 4.31C12.19 4.03 11.81 4.03 11.53 4.31L3.42 12.42C3.14 12.7 3.14 13.08 3.42 13.36L11.53 21.47C11.81 21.75 12.19 21.75 12.47 21.47L20.58 13.36C20.86 13.08 20.86 12.7 20.58 12.42Z" fill="#2684FF"/>
          </svg>
          <span className="qa-integration-name">Jira</span>
          {authStatus.authenticated && <span className="qa-integration-badge-ok">Connected</span>}
        </div>
        <svg className={`qa-section-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div className="qa-integration-body">
          {authStatus.authenticated ? (
            <>
              <div className="qa-settings-status qa-settings-status-ok">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                Connected to {authStatus.siteUrl || 'Jira'}
              </div>
              <button className="qa-btn qa-btn-ghost qa-btn-block" onClick={handleDisconnect} style={{ marginTop: 8 }}>Disconnect</button>

              {fetchError && (
                <div className="qa-settings-status qa-settings-status-error" style={{ marginBottom: 8 }}>
                  {fetchError}
                  <button className="qa-btn qa-btn-ghost" onClick={loadProjects} style={{ marginLeft: 'auto', padding: '0 6px', fontSize: 11 }}>Retry</button>
                </div>
              )}

              <div className="qa-settings-field">
                <label className="qa-settings-label">Project</label>
                {loadingProjects ? <div className="qa-settings-loading">Loading projects...</div> : (
                  <select className="qa-settings-input" value={config.projectKey} onChange={(e) => handleProjectChange(e.target.value)}>
                    <option value="">Select a project</option>
                    {projects.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
                  </select>
                )}
              </div>

              {config.projectKey && (
                <div className="qa-settings-field">
                  <label className="qa-settings-label">Issue Type</label>
                  {loadingDetails ? <div className="qa-settings-loading">Loading...</div> : (
                    <select className="qa-settings-input" value={config.issueType} onChange={(e) => setConfig((prev) => ({ ...prev, issueType: e.target.value }))}>
                      {issueTypes.map((t) => <option key={t.id} value={t.name}>{t.name}{t.subtask ? ' (Sub-task)' : ''}</option>)}
                    </select>
                  )}
                  {isSubtask && !config.parentKey && <div className="qa-settings-field-hint qa-settings-field-hint-warn">Select a parent issue below</div>}
                </div>
              )}

              {config.projectKey && (
                <div className="qa-settings-field" ref={parentFieldRef}>
                  <label className="qa-settings-label">
                    Parent Issue <span className="qa-settings-hint">{isSubtask ? 'required' : 'optional'}</span>
                  </label>
                  {config.parentKey ? (
                    <div className="qa-settings-parent-chip">
                      <div className="qa-settings-parent-chip-info">
                        <code className="qa-settings-parent-chip-key">{config.parentKey}</code>
                        <span className="qa-settings-parent-chip-summary">{config.parentSummary}</span>
                      </div>
                      <button className="qa-btn qa-btn-ghost qa-settings-parent-chip-remove" onClick={handleClearParent} title="Remove">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="qa-settings-search-wrap">
                      <input className="qa-settings-input" type="text" placeholder="Search by key or summary..." value={parentQuery} onChange={(e) => handleParentSearch(e.target.value)} onFocus={() => { if (parentResults.length > 0) setParentDropdownOpen(true); }} spellCheck={false} />
                      {parentSearching && <span className="qa-settings-search-spinner" />}
                      {parentDropdownOpen && parentResults.length > 0 && (
                        <div className="qa-settings-search-dropdown">
                          {parentResults.map((issue) => (
                            <button key={issue.key} className="qa-settings-search-item" onClick={() => handleSelectParent(issue)}>
                              <span className="qa-settings-search-item-key">{issue.key}</span>
                              <span className="qa-settings-search-item-summary">{issue.summary}</span>
                              <span className="qa-settings-search-item-meta">{issue.issueType} · {issue.status}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {parentDropdownOpen && !parentSearching && parentResults.length === 0 && parentQuery.trim() && (
                        <div className="qa-settings-search-dropdown"><div className="qa-settings-search-empty">No results</div></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button className={`qa-btn ${saved ? 'qa-btn-success' : 'qa-btn-primary'} qa-btn-block`} onClick={handleSave} disabled={!config.projectKey}>
                {saved ? 'Saved!' : 'Save Settings'}
              </button>
            </>
          ) : (
            <>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Site URL</label>
                <input className="qa-settings-input" type="text" placeholder="mycompany.atlassian.net" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} spellCheck={false} />
              </div>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Email</label>
                <input className="qa-settings-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} spellCheck={false} />
              </div>
              <div className="qa-settings-field">
                <label className="qa-settings-label">
                  API Token
                  <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="qa-settings-link">Get token</a>
                </label>
                <div className="qa-settings-token-row">
                  <input className="qa-settings-input" type={showToken ? 'text' : 'password'} placeholder="Paste API token" value={apiToken} onChange={(e) => setApiToken(e.target.value)} spellCheck={false} />
                  <button className="qa-btn qa-btn-ghost qa-settings-token-toggle" onClick={() => setShowToken((p) => !p)} title={showToken ? 'Hide' : 'Show'}>
                    {showToken ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>
              {authError && <div className="qa-settings-status qa-settings-status-error">{authError}</div>}
              <button className="qa-btn qa-btn-primary qa-btn-block" onClick={handleConnect} disabled={authLoading} style={{ marginTop: 8 }}>
                {authLoading ? 'Connecting...' : 'Connect'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── GitHub Section ──
function GithubSection() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [labels, setLabels] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: 'CHECK_INTEGRATION_STATUS', integrationId: 'github' }).then((r) => {
      if (r.connected) { setConnected(true); setDisplayName(r.displayName as string || ''); setOpen(true); }
    });
    // Load saved settings
    chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS, (result) => {
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
      const gh = configs.github;
      if (gh) {
        setOwner(gh.settings?.owner || '');
        setRepo(gh.settings?.repo || '');
        setLabels(gh.settings?.labels || '');
      }
    });
  }, []);

  const handleConnect = useCallback(() => {
    if (!token.trim() || !owner.trim() || !repo.trim()) { setError('Token, owner, and repo are required'); return; }
    setLoading(true); setError(null);
    sendMsg({
      type: 'SAVE_INTEGRATION_CONFIG',
      integrationId: 'github',
      credentials: { token: token.trim() },
      settings: { owner: owner.trim(), repo: repo.trim(), labels: labels.trim() },
    }).then((r) => {
      setLoading(false);
      if (r.success) {
        setConnected(true);
        setDisplayName(r.displayName as string || owner.trim());
        setToken('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(r.error as string || 'Connection failed');
      }
    });
  }, [token, owner, repo, labels]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: 'DISCONNECT_INTEGRATION', integrationId: 'github' }).then(() => {
      setConnected(false); setDisplayName(''); setToken(''); setOwner(''); setRepo(''); setLabels('');
    });
  }, []);

  return (
    <div className="qa-integration-card">
      <button className="qa-integration-header" onClick={() => setOpen(!open)}>
        <div className="qa-integration-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span className="qa-integration-name">GitHub</span>
          {connected && <span className="qa-integration-badge-ok">Connected</span>}
        </div>
        <svg className={`qa-section-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div className="qa-integration-body">
          {connected ? (
            <>
              <div className="qa-settings-status qa-settings-status-ok">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                Connected as {displayName}
                {owner && repo && <span style={{ marginLeft: 4, opacity: 0.7 }}>({owner}/{repo})</span>}
              </div>
              <button className="qa-btn qa-btn-ghost qa-btn-block" onClick={handleDisconnect} style={{ marginTop: 8 }}>Disconnect</button>
            </>
          ) : (
            <>
              <div className="qa-settings-field">
                <label className="qa-settings-label">
                  Personal Access Token
                  <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="qa-settings-link">Create token</a>
                </label>
                <div className="qa-settings-token-row">
                  <input className="qa-settings-input" type={showToken ? 'text' : 'password'} placeholder="ghp_..." value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false} />
                  <button className="qa-btn qa-btn-ghost qa-settings-token-toggle" onClick={() => setShowToken((p) => !p)} title={showToken ? 'Hide' : 'Show'}>
                    {showToken ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Repository Owner</label>
                <input className="qa-settings-input" type="text" placeholder="octocat" value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} />
              </div>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Repository Name</label>
                <input className="qa-settings-input" type="text" placeholder="my-project" value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} />
              </div>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Labels <span className="qa-settings-hint">optional, comma-separated</span></label>
                <input className="qa-settings-input" type="text" placeholder="bugshot, bug" value={labels} onChange={(e) => setLabels(e.target.value)} spellCheck={false} />
              </div>
              {error && <div className="qa-settings-status qa-settings-status-error">{error}</div>}
              <button className="qa-btn qa-btn-primary qa-btn-block" onClick={handleConnect} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Connecting...' : saved ? 'Saved!' : 'Connect'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── N8N Section ──
function N8nSection() {
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMsg({ type: 'CHECK_INTEGRATION_STATUS', integrationId: 'n8n' }).then((r) => {
      if (r.connected) { setConnected(true); setDisplayName(r.displayName as string || ''); setOpen(true); }
    });
    chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS, (result) => {
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
      const n8n = configs.n8n;
      if (n8n) setWebhookUrl(n8n.credentials?.webhookUrl || '');
    });
  }, []);

  const handleConnect = useCallback(() => {
    if (!webhookUrl.trim()) { setError('Webhook URL is required'); return; }
    setLoading(true); setError(null);
    sendMsg({
      type: 'SAVE_INTEGRATION_CONFIG',
      integrationId: 'n8n',
      credentials: { webhookUrl: webhookUrl.trim() },
      settings: {},
    }).then((r) => {
      setLoading(false);
      if (r.success) {
        setConnected(true);
        setDisplayName(r.displayName as string || '');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(r.error as string || 'Verification failed');
      }
    });
  }, [webhookUrl]);

  const handleDisconnect = useCallback(() => {
    sendMsg({ type: 'DISCONNECT_INTEGRATION', integrationId: 'n8n' }).then(() => {
      setConnected(false); setDisplayName(''); setWebhookUrl('');
    });
  }, []);

  return (
    <div className="qa-integration-card">
      <button className="qa-integration-header" onClick={() => setOpen(!open)}>
        <div className="qa-integration-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="4" fill="#EA4B71"/>
            <text x="4" y="17" fill="white" fontSize="12" fontWeight="bold">n8n</text>
          </svg>
          <span className="qa-integration-name">N8N</span>
          {connected && <span className="qa-integration-badge-ok">Connected</span>}
        </div>
        <svg className={`qa-section-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div className="qa-integration-body">
          {connected ? (
            <>
              <div className="qa-settings-status qa-settings-status-ok">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                Connected to {displayName || 'N8N'}
              </div>
              <button className="qa-btn qa-btn-ghost qa-btn-block" onClick={handleDisconnect} style={{ marginTop: 8 }}>Disconnect</button>
            </>
          ) : (
            <>
              <div className="qa-settings-field">
                <label className="qa-settings-label">Webhook URL</label>
                <input className="qa-settings-input" type="url" placeholder="https://your-n8n.app/webhook/..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} spellCheck={false} />
              </div>
              {error && <div className="qa-settings-status qa-settings-status-error">{error}</div>}
              <button className="qa-btn qa-btn-primary qa-btn-block" onClick={handleConnect} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Verifying...' : saved ? 'Verified!' : 'Connect'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Settings Panel ──
export function SettingsPanel() {
  const [recent, setRecent] = useState<Array<{ key: string; summary: string; createdAt: number }>>([]);
  const [titlePrefix, setTitlePrefix] = useState('[BugShot]');
  const [prefixSaved, setPrefixSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS, (result) => {
      if (result[STORAGE_KEYS.RECENT_SUBMISSIONS]) setRecent(result[STORAGE_KEYS.RECENT_SUBMISSIONS].slice(0, 5));
    });
    chrome.storage.sync.get(STORAGE_KEYS.TITLE_PREFIX, (result) => {
      if (result[STORAGE_KEYS.TITLE_PREFIX] !== undefined) setTitlePrefix(result[STORAGE_KEYS.TITLE_PREFIX]);
    });
  }, []);

  const handlePrefixSave = useCallback(() => {
    chrome.storage.sync.set({ [STORAGE_KEYS.TITLE_PREFIX]: titlePrefix }, () => {
      setPrefixSaved(true);
      setTimeout(() => setPrefixSaved(false), 2000);
    });
  }, [titlePrefix]);

  return (
    <div className="qa-settings">
      <section className="qa-settings-section">
        <h3 className="qa-settings-heading">General</h3>
        <div className="qa-settings-field">
          <label className="qa-settings-label">Title Prefix (말머리)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="qa-settings-input"
              type="text"
              placeholder="[BugShot]"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              spellCheck={false}
              style={{ flex: 1 }}
            />
            <button
              className={`qa-btn ${prefixSaved ? 'qa-btn-success' : 'qa-btn-primary'}`}
              onClick={handlePrefixSave}
              style={{ whiteSpace: 'nowrap' }}
            >
              {prefixSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
          <div className="qa-settings-field-hint">Example: {titlePrefix} Page Title - bug description</div>
        </div>
      </section>

      <section className="qa-settings-section">
        <h3 className="qa-settings-heading">Integrations</h3>
        <div className="qa-integrations-list">
          <JiraSection defaultOpen />
          <GithubSection />
          <N8nSection />
        </div>
      </section>

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

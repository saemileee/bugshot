import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';
import type { EpicConfig } from '@/shared/types/jira-ticket';

export function SettingsPanel() {
  // ── Auth state ──
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    cloudName?: string;
  }>({ authenticated: false });
  const [authLoading, setAuthLoading] = useState(false);

  // ── Epic config ──
  const [config, setConfig] = useState<EpicConfig>({
    epicKey: '',
    projectKey: '',
    issueType: 'Task',
    defaultLabels: ['design-qa'],
  });
  const [saved, setSaved] = useState(false);

  // ── Recent submissions ──
  const [recent, setRecent] = useState<Array<{ key: string; summary: string; createdAt: number }>>([]);

  // Load all settings on mount
  useEffect(() => {
    // Auth status
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, (response) => {
      if (response) setAuthStatus(response);
    });

    // Epic config
    chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG, (result) => {
      if (result[STORAGE_KEYS.EPIC_CONFIG]) {
        setConfig(result[STORAGE_KEYS.EPIC_CONFIG]);
      }
    });

    // Recent submissions
    chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS, (result) => {
      if (result[STORAGE_KEYS.RECENT_SUBMISSIONS]) {
        setRecent(result[STORAGE_KEYS.RECENT_SUBMISSIONS].slice(0, 5));
      }
    });
  }, []);

  const handleConnect = useCallback(() => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'INITIATE_AUTH' }, (response) => {
      setAuthLoading(false);
      if (response?.success) {
        setAuthStatus({
          authenticated: true,
          cloudName: response.cloudName,
        });
      }
    });
  }, []);

  const handleSave = useCallback(() => {
    chrome.storage.sync.set({ [STORAGE_KEYS.EPIC_CONFIG]: config }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [config]);

  return (
    <div className="qa-settings">
      {/* ── Connection ── */}
      <section className="qa-settings-section">
        <h3 className="qa-settings-heading">Jira Connection</h3>
        {authStatus.authenticated ? (
          <div className="qa-settings-status qa-settings-status-ok">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Connected to {authStatus.cloudName || 'Jira Cloud'}
          </div>
        ) : (
          <>
            <div className="qa-settings-status qa-settings-status-off">
              Not connected
            </div>
            <button
              className="qa-btn qa-btn-primary qa-btn-block"
              onClick={handleConnect}
              disabled={authLoading}
              style={{ marginTop: 8 }}
            >
              {authLoading ? 'Connecting...' : 'Connect to Jira'}
            </button>
          </>
        )}
      </section>

      {/* ── Issue Settings ── */}
      <section className="qa-settings-section">
        <h3 className="qa-settings-heading">Issue Settings</h3>

        <div className="qa-settings-field">
          <label className="qa-settings-label">Project Key</label>
          <input
            className="qa-settings-input"
            type="text"
            placeholder="e.g., PROJ"
            value={config.projectKey}
            onChange={(e) => setConfig({ ...config, projectKey: e.target.value })}
            spellCheck={false}
          />
        </div>

        <div className="qa-settings-field">
          <label className="qa-settings-label">Epic Key (optional)</label>
          <input
            className="qa-settings-input"
            type="text"
            placeholder="e.g., PROJ-42"
            value={config.epicKey}
            onChange={(e) => setConfig({ ...config, epicKey: e.target.value })}
            spellCheck={false}
          />
        </div>

        <div className="qa-settings-field">
          <label className="qa-settings-label">Issue Type</label>
          <select
            className="qa-settings-input"
            value={config.issueType}
            onChange={(e) => setConfig({ ...config, issueType: e.target.value })}
          >
            <option value="Task">Task</option>
            <option value="Bug">Bug</option>
            <option value="Story">Story</option>
            <option value="Sub-task">Sub-task</option>
          </select>
        </div>

        <button
          className={`qa-btn ${saved ? 'qa-btn-success' : 'qa-btn-primary'} qa-btn-block`}
          onClick={handleSave}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </section>

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

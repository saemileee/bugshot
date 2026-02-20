import { useEffect, useState } from 'react';

export function ConnectionStatus() {
  const [status, setStatus] = useState<{
    authenticated: boolean;
    cloudName?: string;
  }>({ authenticated: false });

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, (response) => {
      if (response) {
        setStatus(response);
      }
    });
  }, []);

  return (
    <div className="section">
      <h2>Connection</h2>
      {status.authenticated ? (
        <span className="status-badge status-connected">
          Connected to {status.cloudName || 'Jira Cloud'}
        </span>
      ) : (
        <span className="status-badge status-disconnected">
          Not connected
        </span>
      )}
    </div>
  );
}

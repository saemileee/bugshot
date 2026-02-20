import { useState } from 'react';

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'INITIATE_AUTH' }, (response) => {
      setLoading(false);
      if (response?.success) {
        window.location.reload();
      }
    });
  };

  return (
    <div className="section">
      <button
        className="btn btn-primary"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? 'Connecting...' : 'Connect to Jira'}
      </button>
    </div>
  );
}

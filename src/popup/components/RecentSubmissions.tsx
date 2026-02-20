import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';

interface RecentItem {
  key: string;
  summary: string;
  createdAt: number;
}

export function RecentSubmissions() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.RECENT_SUBMISSIONS, (result) => {
      setItems(result[STORAGE_KEYS.RECENT_SUBMISSIONS] || []);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="section">
      <h2>Recent Submissions</h2>
      <div className="recent-list">
        {items.slice(0, 5).map((item) => (
          <div key={item.key} className="recent-item">
            <span className="issue-key">{item.key}</span>
            <span className="issue-summary">{item.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

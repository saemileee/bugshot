import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';
import type { EpicConfig as EpicConfigType } from '@/shared/types/jira-ticket';

export function EpicConfig() {
  const [config, setConfig] = useState<EpicConfigType>({
    parentKey: '',
    projectKey: '',
    issueType: 'Task',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEYS.EPIC_CONFIG, (result) => {
      if (result[STORAGE_KEYS.EPIC_CONFIG]) {
        setConfig(result[STORAGE_KEYS.EPIC_CONFIG]);
      }
    });
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set({ [STORAGE_KEYS.EPIC_CONFIG]: config }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="settings-panel">
      <h2>Epic Configuration</h2>

      <div className="form-group">
        <label>Project Key</label>
        <input
          type="text"
          placeholder="e.g., PROJ"
          value={config.projectKey}
          onChange={(e) => setConfig({ ...config, projectKey: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>Parent Issue Key</label>
        <input
          type="text"
          placeholder="e.g., PROJ-42"
          value={config.parentKey}
          onChange={(e) => setConfig({ ...config, parentKey: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>Issue Type</label>
        <select
          value={config.issueType}
          onChange={(e) => setConfig({ ...config, issueType: e.target.value })}
        >
          <option value="Task">Task</option>
          <option value="Bug">Bug</option>
          <option value="Story">Story</option>
          <option value="Sub-task">Sub-task</option>
        </select>
      </div>

      <button className="btn btn-primary" onClick={handleSave}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

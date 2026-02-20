import { createRoot } from 'react-dom/client';
import { useState, useCallback } from 'react';
import { ChangeList } from './components/ChangeList';
import { BatchPreview } from './components/BatchPreview';
import { EpicConfig } from './components/EpicConfig';
import { useCSSTracking } from './hooks/useCSSTracking';
import { useChangeStore } from './hooks/useChangeStore';
import { usePanelMessaging } from './hooks/usePanelMessaging';
import './styles/panel.css';

function App() {
  const {
    captureBeforeSnapshot,
    captureAfterSnapshot,
    isCapturing,
    status,
    resetStatus,
  } = useCSSTracking();

  const {
    changes,
    addChange,
    removeChange,
    removeProperty,
    clearChanges,
    batchMode,
    toggleBatchMode,
  } = useChangeStore();

  const { submitToJira, syncChangesToWidget, isSubmitting, submitResult } = usePanelMessaging();
  const [activeTab, setActiveTab] = useState<'changes' | 'batch' | 'settings'>('changes');

  const handleAfterSnapshot = useCallback(async () => {
    const change = await captureAfterSnapshot();
    if (change) {
      addChange(change);
      syncChangesToWidget([...changes, change]);
    }
  }, [captureAfterSnapshot, addChange, syncChangesToWidget, changes]);

  const handleSubmitSingle = useCallback(async (changeId: string) => {
    const change = changes.find((c) => c.id === changeId);
    if (!change) return;
    await submitToJira([change], '');
  }, [changes, submitToJira]);

  const handleSubmitBatch = useCallback(async (notes: string) => {
    await submitToJira(changes, notes);
  }, [changes, submitToJira]);

  return (
    <div className="panel-container">
      <header className="panel-header">
        <h1>Design QA Helper</h1>
        <div className="tab-bar">
          <button
            className={`tab ${activeTab === 'changes' ? 'active' : ''}`}
            onClick={() => setActiveTab('changes')}
          >
            Changes ({changes.length})
          </button>
          <button
            className={`tab ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            Batch
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Submit result toast */}
      {submitResult && (
        <div className={`panel-toast ${submitResult.success ? 'toast-success' : 'toast-error'}`}>
          {submitResult.success
            ? `Created ${submitResult.issueKey}`
            : `Error: ${submitResult.error}`}
        </div>
      )}

      {activeTab === 'changes' && (
        <main className="panel-main">
          {/* Step-by-step guide */}
          <div className="capture-flow">
            <div className="capture-step">
              <div className={`step-number ${status.state === 'before_captured' || status.state === 'success' ? 'step-done' : ''}`}>1</div>
              <div className="step-content">
                <button
                  className="btn btn-primary"
                  onClick={captureBeforeSnapshot}
                  disabled={isCapturing}
                >
                  Before
                </button>
                <span className="step-hint">Elements에서 요소 선택 후 클릭</span>
              </div>
            </div>

            <div className="capture-step-arrow">&rarr;</div>

            <div className="capture-step">
              <div className="step-number step-mid">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <span className="step-hint">DevTools에서 CSS 수정</span>
            </div>

            <div className="capture-step-arrow">&rarr;</div>

            <div className="capture-step">
              <div className={`step-number ${status.state === 'success' ? 'step-done' : ''}`}>2</div>
              <div className="step-content">
                <button
                  className="btn btn-success"
                  onClick={handleAfterSnapshot}
                  disabled={isCapturing || status.state === 'idle'}
                >
                  After
                </button>
                <span className="step-hint">변경 후 클릭하여 캡처</span>
              </div>
            </div>

            <label className="batch-toggle">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={toggleBatchMode}
              />
              Batch
            </label>
          </div>

          {/* Status feedback */}
          {status.state === 'before_captured' && (
            <div className="status-bar status-info">
              <strong>Before captured:</strong> <code>{status.selector}</code>
              <br />
              <span>이제 Elements 패널에서 CSS 값을 수정한 후 "2. After"를 클릭하세요.</span>
            </div>
          )}
          {status.state === 'error' && (
            <div className="status-bar status-error">
              {status.message}
              <button className="status-dismiss" onClick={resetStatus}>&times;</button>
            </div>
          )}
          {status.state === 'no_diff' && (
            <div className="status-bar status-warn">
              변경된 CSS 속성이 없습니다. Elements 패널에서 값을 수정했는지 확인하세요.
              <button className="status-dismiss" onClick={resetStatus}>&times;</button>
            </div>
          )}
          {status.state === 'success' && (
            <div className="status-bar status-success">
              {status.change.properties.length}개 속성 변경이 캡처되었습니다!
              <button className="status-dismiss" onClick={resetStatus}>&times;</button>
            </div>
          )}

          <ChangeList
            changes={changes}
            onRemove={removeChange}
            onClear={clearChanges}
            onSubmitSingle={handleSubmitSingle}
            isSubmitting={isSubmitting}
          />
        </main>
      )}

      {activeTab === 'batch' && (
        <main className="panel-main">
          <BatchPreview
            changes={changes}
            onRemoveChange={removeChange}
            onRemoveProperty={removeProperty}
            onSubmitBatch={handleSubmitBatch}
            isSubmitting={isSubmitting}
          />
        </main>
      )}

      {activeTab === 'settings' && <EpicConfig />}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

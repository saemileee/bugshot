import { useState, useCallback, useEffect, useRef } from 'react';
import { Settings, Camera, Video, MousePointer2, Square, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { SettingsPanel } from '@/content/widget/components/SettingsPanel';
import { ChangesSummary } from '@/content/widget/components/ChangesSummary';
import { ManualDescription } from '@/content/widget/components/ManualDescription';
import { InlineScreenshotEditor } from '@/content/widget/components/InlineScreenshotEditor';
import { SubmitPanel } from '@/content/widget/components/SubmitPanel';
import { Button } from '@/content/widget/components/ui/button';
import { useSWMessaging } from '@/content/widget/hooks/useSWMessaging';
import { STORAGE_KEYS } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/types/messages';
import type { CSSChange } from '@/shared/types/css-change';

type Tab = 'capture' | 'settings';

interface ScreenshotData {
  original: string;
  annotated?: string;
  filename: string;
  description?: string;
}

interface PendingElement {
  selector: string;
  screenshotBefore?: string;
}

export function SidePanelRoot() {
  const [activeTab, setActiveTab] = useState<Tab>('capture');
  const [showPreview, setShowPreview] = useState(false);

  // Data state
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [description, setDescription] = useState('');
  const [changes, setChanges] = useState<CSSChange[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingDataUrl, setRecordingDataUrl] = useState<string | null>(null);
  const [recordingSize, setRecordingSize] = useState<number | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);

  // Editing mode state (after element is picked)
  const [pendingElement, setPendingElement] = useState<PendingElement | null>(null);
  const [editNote, setEditNote] = useState('');

  // Status state
  const [isRecording, setIsRecording] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ progress: number; message: string } | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [hasConnectedPlatform, setHasConnectedPlatform] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  const recordingIdRef = useRef<string | null>(null);
  recordingIdRef.current = recordingId;

  // Port message handler
  const handlePortMessage = useCallback((msg: ExtensionMessage) => {
    if (msg.type === 'RECORDING_COMPLETE') {
      const oldRecordingId = recordingIdRef.current;
      if (oldRecordingId && oldRecordingId !== msg.recordingId) {
        chrome.runtime.sendMessage({
          type: 'DELETE_RECORDING',
          recordingId: oldRecordingId,
        }).catch(() => { /* ignore */ });
      }

      setRecordingId(msg.recordingId);
      setRecordingDataUrl(msg.dataUrl ?? null);
      setRecordingSize(msg.size ?? null);
      setRecordingMimeType(msg.mimeType ?? null);
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
    }
    if (msg.type === 'RECORDING_ERROR') {
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
      setRecordError(msg.error);
    }
    if (msg.type === 'CONVERSION_PROGRESS') {
      if (msg.stage === 'loading' || msg.stage === 'converting') {
        setIsConverting(true);
        setConversionProgress({ progress: msg.progress, message: msg.message });
      } else if (msg.stage === 'error') {
        setIsConverting(false);
        setConversionProgress(null);
      }
    }
    // Handle messages from content script (via side panel bridge)
    if (msg.type === 'ELEMENT_PICKED') {
      setIsPicking(false);
      if ('cssChange' in msg && msg.cssChange) {
        const change = msg.cssChange as Partial<CSSChange>;
        // Enter editing mode instead of immediately adding the change
        setPendingElement({
          selector: change.selector || 'element',
          screenshotBefore: undefined, // Will be captured separately
        });
      }
    }
    if (msg.type === 'PICKING_CANCELLED') {
      setIsPicking(false);
    }
    if (msg.type === 'SCREENSHOT_CAPTURED') {
      if ('dataUrl' in msg && msg.dataUrl) {
        const filename = `screenshot-${Date.now()}.png`;
        setScreenshots(prev => [...prev, { original: msg.dataUrl as string, filename }]);
        setScreenshotError(null);
      }
      setIsCapturing(false);
    }
  }, []);

  const { sendMessage } = useSWMessaging(handlePortMessage);

  // Get current tab ID
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        setCurrentTabId(tabs[0].id);
      }
    });

    // Listen for tab changes
    const handleActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setCurrentTabId(activeInfo.tabId);
    };
    chrome.tabs.onActivated.addListener(handleActivated);
    return () => chrome.tabs.onActivated.removeListener(handleActivated);
  }, []);

  // Check platform connection status
  const checkPlatformStatus = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS);
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};
      const hasConnected = Object.values(configs).some(
        (config: any) => config?.enabled === true
      );
      setHasConnectedPlatform(hasConnected);
    } catch (error) {
      console.warn('[SidePanel] Failed to read integrations:', error);
      setHasConnectedPlatform(false);
    }
    setCheckingAuth(false);
  }, []);

  useEffect(() => {
    checkPlatformStatus();
  }, [checkPlatformStatus]);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'sync' || areaName === 'local') {
        if (changes['integrations'] || changes['jiraCredentials']) {
          checkPlatformStatus();
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [checkPlatformStatus]);

  // Check recording status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
      if (response?.isRecording) {
        setIsRecording(true);
      }
    });
  }, []);

  // Send message to content script
  const sendToContentScript = useCallback(async (message: any) => {
    if (!currentTabId) return;
    try {
      await chrome.tabs.sendMessage(currentTabId, message);
    } catch (error) {
      console.warn('[SidePanel] Failed to send message to content script:', error);
    }
  }, [currentTabId]);

  // Actions
  const handlePickElement = useCallback(() => {
    setIsPicking(true);
    setPendingElement(null);
    setEditNote('');
    sendToContentScript({ type: 'START_PICKING' });
  }, [sendToContentScript]);

  const handleScreenshot = useCallback(async () => {
    setIsCapturing(true);
    setScreenshotError(null);
    try {
      const response = await sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: currentTabId ?? 0 });
      if (response?.dataUrl) {
        const filename = `screenshot-${Date.now()}.png`;
        setScreenshots(prev => [...prev, { original: response.dataUrl!, filename }]);
      } else {
        setScreenshotError('Failed to capture screenshot. Please try again.');
      }
    } catch (error) {
      console.error('[SidePanel] Screenshot failed:', error);
      setScreenshotError('Failed to capture screenshot. Please try again.');
    }
    setIsCapturing(false);
  }, [sendMessage, currentTabId]);

  const handleRegionScreenshot = useCallback(() => {
    setScreenshotError(null);
    sendToContentScript({ type: 'START_REGION_SELECT' });
  }, [sendToContentScript]);

  const handleRecordToggle = useCallback(async () => {
    setRecordError(null);
    try {
      if (isRecording) {
        setIsRecording(false);
        await sendMessage({ type: 'STOP_RECORDING' });
      } else {
        const response = await sendMessage({
          type: 'START_RECORDING',
          tabId: currentTabId ?? 0,
        });
        if (response && 'error' in response) {
          setRecordError((response as { error: string }).error);
        } else {
          setIsRecording(true);
        }
      }
    } catch (err) {
      const msg = (err as Error).message || 'Recording failed';
      setRecordError(msg);
      setIsRecording(false);
    }
  }, [isRecording, sendMessage, currentTabId]);

  // Confirm pending element as a CSS change
  const handleConfirmElement = useCallback(() => {
    if (!pendingElement) return;

    const change: CSSChange = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      selector: pendingElement.selector,
      elementDescription: pendingElement.selector,
      url: '', // Will be filled by content script or on submit
      properties: [],
      description: editNote.trim() || undefined,
      screenshotBefore: pendingElement.screenshotBefore,
      status: 'pending',
    };

    setChanges(prev => [...prev, change]);
    setPendingElement(null);
    setEditNote('');
  }, [pendingElement, editNote]);

  // Cancel pending element editing
  const handleCancelElement = useCallback(() => {
    setPendingElement(null);
    setEditNote('');
  }, []);

  const handleClearRecording = useCallback(() => {
    if (recordingId) {
      sendMessage({ type: 'DELETE_RECORDING', recordingId } as any);
    }
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
  }, [recordingId, sendMessage]);

  const handleClearAll = useCallback(() => {
    if (recordingId) {
      sendMessage({ type: 'DELETE_RECORDING', recordingId } as any);
    }
    setScreenshots([]);
    setDescription('');
    setChanges([]);
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
    setIsConverting(false);
    setConversionProgress(null);
    setShowPreview(false);
    setPendingElement(null);
    setEditNote('');
    setScreenshotError(null);
  }, [recordingId, sendMessage]);

  const handleRemoveChange = useCallback((id: string) => {
    setChanges(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleScreenshotUpdated = useCallback((index: number, data: ScreenshotData) => {
    setScreenshots(prev => {
      const u = [...prev];
      u[index] = data;
      return u;
    });
  }, []);

  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    setScreenshots([]);
    setDescription('');
    setChanges([]);
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
    setIsConverting(false);
    setConversionProgress(null);
    setShowPreview(false);
    setPendingElement(null);
    setEditNote('');
  }, []);

  const isEditing = !!pendingElement;
  const hasContent = screenshots.length > 0 || !!description.trim() || changes.length > 0 || !!recordingId;

  // Footer content based on state
  const footerContent = (() => {
    if (activeTab !== 'capture' || showPreview) return null;

    // Editing mode footer
    if (isEditing) {
      return (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex flex-col gap-3">
            <textarea
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 resize-none outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Describe what should change..."
              spellCheck={false}
              rows={2}
            />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={handleCancelElement}>
                <ArrowLeft className="w-3 h-3" />
                Cancel
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={handleConfirmElement}
              >
                Add Issue
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Normal mode footer (with content)
    if (hasContent) {
      if (!hasConnectedPlatform && !checkingAuth) {
        return (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 text-amber-700 text-xs border border-amber-200">
                <div className="flex-1">
                  <div className="font-medium mb-1">No platform connected</div>
                  <div>Connect to Jira, GitHub, or Webhook in Settings.</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="text-gray-500 hover:text-red-500" onClick={handleClearAll}>
                  Clear All
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setActiveTab('settings')}>
                  Open Settings
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-2">
            <Button variant="ghost" className="text-gray-500 hover:text-red-500" onClick={handleClearAll}>
              Clear All
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowPreview(true)}
              disabled={checkingAuth}
            >
              {checkingAuth ? 'Checking...' : 'Review Issue'}
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    return null;
  })();

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <img src={chrome.runtime.getURL('src/assets/icons/icon-32.png')} alt="BugShot" className="w-6 h-6" />
          <span className="font-semibold text-slate-800">BugShot</span>
        </div>
        <button
          onClick={() => setActiveTab(activeTab === 'settings' ? 'capture' : 'settings')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-violet-100 text-violet-600'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Toolbar */}
      {activeTab === 'capture' && !showPreview && !isEditing && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={handlePickElement}
            disabled={isPicking}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isPicking
                ? 'bg-violet-100 text-violet-600'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
            title="Pick Element"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            <span>Pick</span>
          </button>
          <button
            onClick={handleScreenshot}
            disabled={isCapturing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            title="Full Page Screenshot"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Full</span>
          </button>
          <button
            onClick={handleRegionScreenshot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            title="Region Screenshot"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Region</span>
          </button>
          <button
            onClick={handleRecordToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isRecording
                ? 'bg-red-100 text-red-600'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{isRecording ? 'Stop' : 'Record'}</span>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'settings' ? (
          <SettingsPanel />
        ) : showPreview ? (
          <SubmitPanel
            screenshots={screenshots}
            description={description}
            changes={changes}
            sendMessage={sendMessage}
            onSuccess={handleSubmitSuccess}
            onBack={() => setShowPreview(false)}
            onGoToSettings={() => {
              setShowPreview(false);
              setActiveTab('settings');
            }}
            videoRecordingId={recordingId}
            videoDataUrl={recordingDataUrl}
            videoMimeType={recordingMimeType}
            hasConnectedPlatform={hasConnectedPlatform}
            isPreview
          />
        ) : (
          <>
            {/* Status messages */}
            {recordError && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100">
                <span className="flex-1">Recording error: {recordError}</span>
                <button onClick={() => setRecordError(null)} className="p-1 hover:bg-red-100 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {screenshotError && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 text-xs border-b border-amber-100">
                <span className="flex-1">{screenshotError}</span>
                <button onClick={() => setScreenshotError(null)} className="p-1 hover:bg-amber-100 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-opacity" />
                <span>Recording in progress...</span>
              </div>
            )}
            {isConverting && conversionProgress && (
              <div className="px-4 py-2 bg-blue-50 text-blue-700 text-xs border-b border-blue-100">
                <div className="mb-1">{conversionProgress.message}</div>
                <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${conversionProgress.progress}%` }}
                  />
                </div>
              </div>
            )}
            {isPicking && (
              <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 text-xs border-b border-violet-100">
                <MousePointer2 className="w-3.5 h-3.5" />
                <span>Click on an element in the page to select it...</span>
                <button
                  onClick={() => {
                    setIsPicking(false);
                    sendToContentScript({ type: 'CANCEL_PICKING' });
                  }}
                  className="ml-auto text-violet-500 hover:text-violet-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Editing mode indicator */}
            {isEditing && (
              <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-violet-600 font-medium">Selected:</span>
                  <code className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-mono text-[11px]">
                    {pendingElement?.selector}
                  </code>
                </div>
              </div>
            )}

            {/* CSS Changes */}
            <div className="px-4 py-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                <span className="text-slate-400">[</span>CSS Changes
                <span className="text-slate-400">]</span>
                {changes.length > 0 && (
                  <span className="text-xs font-medium text-violet-600">{changes.length}</span>
                )}
              </h3>
              <ChangesSummary
                changes={changes}
                captureStatus={isEditing && pendingElement
                  ? { state: 'before_captured' as const, selector: pendingElement.selector }
                  : { state: 'idle' as const }
                }
                onRemoveChange={handleRemoveChange}
              />
            </div>

            {/* Media */}
            <div className="px-4 py-4 border-t border-slate-100">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                <span className="text-slate-400">[</span>Media
                <span className="text-slate-400">]</span>
                {(screenshots.length > 0 || recordingId) && (
                  <span className="text-xs font-medium text-violet-600">
                    {screenshots.length + (recordingId ? 1 : 0)}
                  </span>
                )}
              </h3>
              <div className="flex flex-col gap-3">
                {/* Video */}
                {recordingId && !isRecording && recordingDataUrl && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-700">
                        Video
                        {recordingSize != null && (
                          <span className="ml-1.5 text-[10px] text-gray-400">
                            {recordingSize < 1_000_000
                              ? `${Math.round(recordingSize / 1024)}KB`
                              : `${(recordingSize / 1_000_000).toFixed(1)}MB`}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={handleClearRecording}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <video
                      className="w-full block"
                      src={recordingDataUrl}
                      controls
                      playsInline
                    />
                  </div>
                )}

                {/* Screenshots */}
                {screenshots.map((ss, i) => (
                  <InlineScreenshotEditor
                    key={i}
                    screenshot={ss}
                    index={i}
                    onUpdate={handleScreenshotUpdated}
                    onRemove={handleRemoveScreenshot}
                  />
                ))}

                {/* Empty state */}
                {!recordingId && screenshots.length === 0 && !isRecording && !isConverting && (
                  <div className="text-center py-6 text-gray-400 text-xs">
                    Use toolbar to capture screenshots or record video
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="px-4 py-4 border-t border-slate-100">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                <span className="text-slate-400">[</span>Notes
                <span className="text-slate-400">]</span>
              </h3>
              <ManualDescription
                description={description}
                onDescriptionChange={setDescription}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {footerContent}
    </div>
  );
}

/**
 * CaptureView - Shared capture/editing view component
 * Used by both widget and side panel
 */

import { StyleEditor } from '@/content/widget/components/StyleEditor';
import { ElementBreadcrumb } from '@/content/widget/components/ElementBreadcrumb';
import {
  RecordingAlert,
  PickingAlert,
  ConvertingAlert,
  ErrorAlert,
  WarningAlert,
} from '@/shared/components/StatusAlert';
import {
  CSSChangesSection,
  MediaSection,
  NotesSection,
} from '@/shared/components/BugReportSections';
import type { CSSChange } from '@/shared/types/css-change';
import type { ScreenshotData } from '@/shared/hooks/useBugReportState';
import type { BreadcrumbData, ElementSelectorType } from '@/shared/types/element-info';
import type { CaptureStatus } from '@/content/widget/hooks/useContentCSSTracking';
import type { CDPStyleResult } from '@/shared/types/messages';

// ============================================================================
// Types
// ============================================================================

export interface PendingElementInfo {
  selector: string;
  screenshotBefore?: string;
  className: string;
  textContent: string;
  cdpStyles: CDPStyleResult | null;
  computedStyles: Array<{ name: string; value: string }>;
  pageTokens: Array<{ name: string; value: string }>;
  breadcrumbData?: BreadcrumbData;
  // For widget mode: reference to actual DOM element for local operations
  element?: Element;
}

export interface CaptureViewProps {
  variant: 'widget' | 'panel';

  // Editing state - both modes use pendingElement
  isEditing: boolean;
  pendingElement?: PendingElementInfo | null;

  // Status alerts
  isRecording: boolean;
  isPicking: boolean;
  isConverting: boolean;
  conversionProgress: { progress: number; message: string } | null;
  recordError: string | null;
  screenshotError: string | null;

  // Picking cancel handler
  onCancelPicking?: () => void;

  // Breadcrumb handlers - unified interface
  // Widget: uses element reference from pendingElement.element
  // Panel: uses index-based messaging
  onBreadcrumbSelect?: (type: ElementSelectorType, index: number) => void;
  onBreadcrumbHover?: (type: ElementSelectorType, index: number) => void;
  onBreadcrumbHoverEnd?: () => void;

  // Style change handler (for editing mode)
  onStyleChange?: (change: { type: 'class' | 'text' | 'style'; property?: string; value: string }) => void;

  // Normal mode: data
  changes: CSSChange[];
  screenshots: ScreenshotData[];
  description: string;
  recordingId: string | null;
  recordingDataUrl: string | null;
  recordingSize: number | null;

  // Normal mode: capture status
  captureStatus?: CaptureStatus;

  // Normal mode: handlers
  onRemoveChange: (id: string) => void;
  onUpdateScreenshot: (index: number, data: ScreenshotData) => void;
  onRemoveScreenshot: (index: number) => void;
  onClearRecording: () => void;
  onDescriptionChange: (text: string) => void;
  onDismissRecordError?: () => void;
  onDismissScreenshotError?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CaptureView({
  variant,
  isEditing,
  pendingElement,

  // Status
  isRecording,
  isPicking,
  isConverting,
  conversionProgress,
  recordError,
  screenshotError,
  onCancelPicking,

  // Breadcrumb - unified handlers
  onBreadcrumbSelect,
  onBreadcrumbHover,
  onBreadcrumbHoverEnd,

  // Style editor
  onStyleChange,

  // Normal mode data
  changes,
  screenshots,
  description,
  recordingId,
  recordingDataUrl,
  recordingSize,
  captureStatus,

  // Handlers
  onRemoveChange,
  onUpdateScreenshot,
  onRemoveScreenshot,
  onClearRecording,
  onDescriptionChange,
  onDismissRecordError,
  onDismissScreenshotError,
}: CaptureViewProps) {
  const isRemoteMode = variant === 'panel';

  return (
    <>
      {/* Status alerts */}
      {recordError && (
        <ErrorAlert
          message={`Recording error: ${recordError}`}
          onDismiss={onDismissRecordError}
        />
      )}
      {screenshotError && (
        <WarningAlert
          message={screenshotError}
          onDismiss={onDismissScreenshotError}
        />
      )}
      {isRecording && <RecordingAlert />}
      {isConverting && conversionProgress && (
        <ConvertingAlert
          progress={conversionProgress.progress}
          message={conversionProgress.message}
        />
      )}
      {isPicking && onCancelPicking && (
        <PickingAlert onCancel={onCancelPicking} />
      )}

      {/* Editing mode */}
      {isEditing && pendingElement && (
        <>
          {/* Breadcrumb navigation */}
          <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
            {pendingElement.breadcrumbData ? (
              <ElementBreadcrumb
                mode="remote"
                breadcrumbData={pendingElement.breadcrumbData}
                onSelectByIndex={onBreadcrumbSelect!}
                onHoverByIndex={onBreadcrumbHover!}
                onHoverEnd={onBreadcrumbHoverEnd!}
              />
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-violet-600 font-medium">Selected:</span>
                <code className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-mono text-[11px]">
                  {pendingElement.selector}
                </code>
              </div>
            )}
          </div>

          {/* Style Editor */}
          <StyleEditor
            remoteMode={isRemoteMode}
            initialClassName={pendingElement.className}
            initialTextContent={pendingElement.textContent}
            initialCdpStyles={pendingElement.cdpStyles}
            initialComputedStyles={pendingElement.computedStyles}
            pageTokens={pendingElement.pageTokens}
            onRemoteChange={onStyleChange}
            element={pendingElement.element}
          />
        </>
      )}

      {/* Normal mode sections */}
      {!isEditing && (
        <>
          <CSSChangesSection
            changes={changes}
            captureStatus={captureStatus ?? { state: 'idle' as const }}
            onRemoveChange={onRemoveChange}
          />
          <MediaSection
            screenshots={screenshots}
            recordingId={recordingId}
            recordingDataUrl={recordingDataUrl}
            recordingSize={recordingSize}
            isRecording={isRecording}
            isConverting={isConverting}
            conversionProgress={conversionProgress}
            recordError={recordError}
            onUpdateScreenshot={onUpdateScreenshot}
            onRemoveScreenshot={onRemoveScreenshot}
            onClearRecording={onClearRecording}
            onDismissError={onDismissRecordError}
          />
          <NotesSection
            description={description}
            onDescriptionChange={onDescriptionChange}
          />
        </>
      )}
    </>
  );
}

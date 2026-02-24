import type { CSSChange, CSSPropertyChange } from '@/shared/types/css-change';
import type { CaptureStatus } from '../hooks/useContentCSSTracking';
import { Trash2 } from 'lucide-react';

interface ChangesViewProps {
  changes: CSSChange[];
  captureStatus: CaptureStatus;
  onRemoveChange: (id: string) => void;
}

const SPECIAL_PROPS = new Set(['className', 'textContent']);

function classifyProps(props: CSSPropertyChange[]) {
  const meta: CSSPropertyChange[] = [];
  const tokens: CSSPropertyChange[] = [];
  const styles: CSSPropertyChange[] = [];
  for (const p of props) {
    if (SPECIAL_PROPS.has(p.property)) meta.push(p);
    else if (p.property.startsWith('--')) tokens.push(p);
    else styles.push(p);
  }
  return { meta, tokens, styles };
}

export function ChangesSummary({
  changes,
  captureStatus,
  onRemoveChange,
}: ChangesViewProps) {
  return (
    <div>
      {/* ── Brief status (only errors/warnings) ── */}
      {captureStatus.state === 'error' && (
        <div className="flex items-start gap-2 p-2.5 rounded-md text-xs leading-relaxed bg-red-50 text-red-700">
          {captureStatus.message}
        </div>
      )}
      {captureStatus.state === 'no_diff' && (
        <div className="flex items-start gap-2 p-2.5 rounded-md text-xs leading-relaxed bg-amber-50 text-amber-700">
          No CSS changes. You can still save with a description.
        </div>
      )}
      {captureStatus.state === 'success' && (
        <div className="flex items-start gap-2 p-2.5 rounded-md text-xs leading-relaxed bg-green-50 text-green-700">
          {captureStatus.change.properties.length} change(s) captured!
        </div>
      )}

      {/* ── Empty state ── */}
      {changes.length === 0 && captureStatus.state === 'idle' && (
        <div className="text-center py-3 text-gray-400 text-xs">
          Pick an element from toolbar to edit styles
        </div>
      )}

      {/* ── Change list ── */}
      {changes.length > 0 && (
        <div>
          {changes.map((change) => {
            const { meta, tokens, styles } = classifyProps(change.properties);
            return (
              <div key={change.id} className="border border-gray-200 rounded-md mb-3 overflow-hidden">
                <div className="flex items-center px-3 py-2 bg-gray-50 border-b border-gray-100 gap-2">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap scrollbar-none">{change.selector}</code>
                  <button
                    className="inline-flex items-center justify-center gap-1 px-2 py-1 border-none rounded text-[11px] font-medium text-gray-400 bg-transparent cursor-pointer transition-all hover:text-red-500 hover:bg-red-50"
                    onClick={() => onRemoveChange(change.id)}
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* As-Is / To-Be screenshots */}
                {(change.screenshotBefore || change.screenshotAfter) && (
                  <div className="flex gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    {change.screenshotBefore && (
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-gray-500 mb-1">As-Is</span>
                        <img className="w-full rounded border border-gray-200" src={change.screenshotBefore} alt="Before" />
                      </div>
                    )}
                    {change.screenshotAfter && (
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-gray-500 mb-1">To-Be</span>
                        <img className="w-full rounded border border-gray-200" src={change.screenshotAfter} alt="After" />
                      </div>
                    )}
                  </div>
                )}

                {/* Description note */}
                {change.description && (
                  <div className="px-3 py-2 text-xs text-slate-700 bg-amber-50 border-b border-amber-100 leading-relaxed whitespace-pre-wrap">
                    {change.description}
                  </div>
                )}

                {meta.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs">
                    <span className="font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-xs flex-shrink-0">{m.property}</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded break-all bg-red-50 text-red-600">{m.asIs}</span>
                    <span className="text-gray-400 flex-shrink-0">&rarr;</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded break-all bg-green-50 text-green-600">{m.toBe}</span>
                  </div>
                ))}

                {tokens.length > 0 && (
                  <div className="px-3 py-2">
                    <div className="text-xs font-bold text-purple-600 mb-1.5 uppercase tracking-wider">Tokens</div>
                    {tokens.map((t, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs py-1.5 border-b border-gray-100 last:border-0">
                        <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono text-xs">{t.property}</code>
                        <span className="text-red-500 line-through break-all">{t.asIs}</span>
                        <span className="text-gray-400 mx-1">&rarr;</span>
                        <span className="text-green-600 font-medium break-all">{t.toBe}</span>
                      </div>
                    ))}
                  </div>
                )}

                {styles.length > 0 && (
                  <div className="px-3 py-2">
                    {(meta.length > 0 || tokens.length > 0) && (
                      <div className="text-xs font-bold text-purple-600 mb-1.5 uppercase tracking-wider">Styles</div>
                    )}
                    {styles.map((s, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs py-1.5 border-b border-gray-100 last:border-0">
                        <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">{s.property}</code>
                        {s.isDesignToken && <span className="text-purple-500 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded text-xs">token</span>}
                        <span className="text-red-500 line-through break-all">{s.asIs}</span>
                        <span className="text-gray-400 mx-1">&rarr;</span>
                        <span className="text-green-600 font-medium break-all">{s.toBe}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                  {new Date(change.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

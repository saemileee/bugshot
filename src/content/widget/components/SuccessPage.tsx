import { CheckCircle, ExternalLink } from 'lucide-react';
import type { IntegrationResult, IntegrationId } from '@/shared/types/integration';
import { Button } from './ui/button';

interface SuccessPageProps {
  results: IntegrationResult[];
  onClose: () => void;
}

const INTEGRATION_LABELS: Record<IntegrationId, string> = {
  jira: 'Jira',
  github: 'GitHub',
  webhook: 'Webhook',
};

export function SuccessPage({ results, onClose }: SuccessPageProps) {
  const successResults = results.filter((r) => r.success);

  return (
    <div className="flex flex-col h-full">
      {/* Success Header */}
      <div className="px-6 py-8 text-center bg-gradient-to-b from-green-50 to-white border-b border-green-100">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Issues Created Successfully!
        </h2>
        <p className="text-sm text-slate-600">
          {successResults.length === 1
            ? '1 issue has been created'
            : `${successResults.length} issues have been created`}
        </p>
      </div>

      {/* Issue List */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-3">
          {successResults.map((result, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                      {INTEGRATION_LABELS[result.integrationId]}
                    </span>
                    {result.issueKey && (
                      <code className="text-sm font-mono text-slate-700 font-semibold">
                        {result.issueKey}
                      </code>
                    )}
                  </div>
                  {result.url && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-violet-600 hover:text-violet-700 hover:underline flex items-center gap-1 mt-2"
                    >
                      <span className="truncate">{result.url}</span>
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  )}
                </div>
                {result.url && (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0"
                  >
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
        <Button onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </div>
  );
}

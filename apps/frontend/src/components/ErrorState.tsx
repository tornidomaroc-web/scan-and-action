import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

// Error state restyled onto the semantic danger (red) tokens. The default title
// and retry label now come from i18n (they were hardcoded English, which leaked
// onto every locale for callers that did not pass a title, e.g. Search/Queue).
export const ErrorState: React.FC<ErrorStateProps> = ({ title, message, onRetry }) => {
  const s = useStrings();
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-danger/30 bg-danger-tint p-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-danger/15 text-danger">
        <AlertTriangle size={22} />
      </div>
      <h3 className="text-section font-semibold text-danger-text">{title ?? s.somethingWrong}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-secondary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-btn border border-line bg-surface-raised px-4 py-2 text-sm font-semibold text-ink shadow-card transition-colors hover:bg-surface-alt"
        >
          <RefreshCcw size={15} />
          {s.tryAgain}
        </button>
      )}
    </div>
  );
};

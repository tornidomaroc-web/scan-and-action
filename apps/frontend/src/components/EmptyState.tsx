import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

// Neutral empty state restyled onto the --sa-* tokens. Symmetric (centered), so
// it reads correctly in both LTR and RTL without any mirroring.
export const EmptyState: React.FC<EmptyStateProps> = ({ message, description, icon, children }) => {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-surface-muted text-ink-faint">
        {icon || <Inbox size={26} />}
      </div>
      <h3 className="text-section font-semibold text-ink">{message}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>}
      {children}
    </div>
  );
};

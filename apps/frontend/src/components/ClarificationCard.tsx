import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

// Clarification prompt, restyled onto the semantic warning (amber) tokens. The
// title is i18n so FR/AR read correctly; the flex/gap layout mirrors in RTL.
export const ClarificationCard = ({ message }: { message: string }) => {
  const s = useStrings();
  return (
    <div className="flex items-start gap-4 rounded-card border border-warning/30 bg-warning-tint p-5 shadow-card">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn bg-warning/15 text-warning-text">
        <HelpCircle size={20} />
      </div>
      <div className="flex-1">
        <h3 className="text-section font-semibold text-warning-text">{s.clarificationNeeded}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{message}</p>
      </div>
    </div>
  );
};

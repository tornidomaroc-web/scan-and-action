import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

type Props = {
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
};

// Rule-engine decision banner, restyled onto the --sa-* tokens. This is the
// audit DECISION vocabulary (Approved / Needs review / Flagged) and is kept
// visually distinct from the document lifecycle status: a large tinted banner
// with an icon, never the small status dot. All copy comes from i18n (all three
// locales), so it no longer falls back to hardcoded English for FLAGGED/APPROVED.
export const DecisionBanner: React.FC<Props> = ({ decision, reason }) => {
  const s = useStrings();
  if (!decision) return null;

  const config = {
    FLAGGED: {
      tint: 'bg-danger-tint border-danger/30 text-danger-text',
      icon: <AlertTriangle size={20} />,
      title: s.statusFlagged,
      subtitle: s.decisionFlaggedDesc,
    },
    NEEDS_REVIEW: {
      tint: 'bg-warning-tint border-warning/30 text-warning-text',
      icon: <AlertTriangle size={20} />,
      title: s.needsReviewTitle,
      subtitle: s.expenseAttention,
    },
    APPROVED: {
      tint: 'bg-success-tint border-success/30 text-success-text',
      icon: <CheckCircle size={20} />,
      title: s.statusApproved,
      subtitle: s.decisionApprovedDesc,
    },
  };

  const current = config[decision];
  if (!current) return null;

  return (
    <div className={`mb-8 rounded-card border p-5 text-start ${current.tint}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0">{current.icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-section font-semibold">{current.title}</h3>
          <p className="mt-0.5 text-sm opacity-90">{current.subtitle}</p>
          {reason && (
            <div className="mt-3 border-t border-current/15 pt-3">
              <p className="text-label font-semibold opacity-70">{s.findingsRationale}</p>
              <p className="mt-1 text-sm leading-relaxed opacity-90"><bdi>{reason}</bdi></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';

type Props = {
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
  // The DOCUMENT LIFECYCLE status, which answers a different question from the
  // decision and can legitimately disagree with it. Optional so existing call
  // sites keep compiling; when absent the copy stays scoped but unqualified.
  status?: string | null;
};

// The rule engine emits a FINITE, known set of reasons (ruleEngineService) and
// persists them joined with ", ". They arrive here as raw English, so an Arabic
// user was reading "Missing amount". Map each known part to its translated
// label, keep any unknown part verbatim (never fabricate a translation), and
// rejoin with the locale-appropriate list separator.
const REASON_LABEL_KEY: Record<string, string> = {
  'Amount exceeds threshold': 'reasonAmountExceedsThreshold',
  'High food expense': 'reasonHighFoodExpense',
  'Missing amount': 'reasonMissingAmount',
  'Possible duplicate expense': 'reasonPossibleDuplicateExpense',
};

export const translateDecisionReasons = (
  reason: string,
  s: Record<string, string>,
  language: string
): string => {
  const separator = language === 'ar' ? '، ' : ', ';
  return reason
    .split(', ')
    .map((part) => {
      const key = REASON_LABEL_KEY[part.trim()];
      return (key && s[key]) || part.trim();
    })
    .join(separator);
};

// Rule-engine decision banner, restyled onto the --sa-* tokens. This is the
// audit DECISION vocabulary (Approved / Needs review / Flagged) and is kept
// visually distinct from the document lifecycle status: a large tinted banner
// with an icon, never the small status dot. All copy comes from i18n (all three
// locales), so it no longer falls back to hardcoded English for FLAGGED/APPROVED.
// ── WHAT "APPROVED" IS ENTITLED TO SAY ──────────────────────────────────────
// The subtitle used to read "No issues detected." It is not a finding about the
// document; it is the absence of a rule firing, and the rule engine
// (ruleEngineService.ts) tests exactly four things:
//
//   A  amount > 500                                      -> NEEDS_REVIEW
//   B  food merchant/summary AND amount > 50             -> FLAGGED
//   C  amount missing entirely                           -> NEEDS_REVIEW
//   D  same merchant + same amount on another document   -> FLAGGED
//
// All four turn on the amount. NONE of them checks whether the merchant, the
// date, the total or the currency were read CORRECTLY — so "no issues detected"
// claims a verification that never happened.
//
// It gets worse when the document is still NEEDS_REVIEW. Those are two
// different questions with two different answers, and both can be true at once:
// the decision asks "did an expense rule fire?", the status asks "was the
// extraction confident enough to skip review?" (persistence.ts isWeak). On the
// canary c176c0d5 — amount 84.80, under every threshold, no rule fired, but the
// extraction was weak — a green "Approved / No issues detected" sat beside
// "Needs review" with nothing explaining how both could hold. A user reading
// that has to decide which one is lying.
//
// So the APPROVED subtitle is scoped in both cases, and when the document still
// needs review it says so rather than leaving the reader to reconcile it. The
// tint and icon are untouched: this change is about what the screen SAYS.
const NEEDS_REVIEW_STATUS = 'NEEDS_REVIEW';

export const DecisionBanner: React.FC<Props> = ({ decision, reason, status }) => {
  const s = useStrings();
  const { language } = useLanguage();
  if (!decision) return null;

  const approvedSubtitle =
    String(status || '').toUpperCase() === NEEDS_REVIEW_STATUS
      ? s.decisionApprovedNeedsReviewDesc
      : s.decisionApprovedDesc;

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
      subtitle: approvedSubtitle,
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
              <p className="mt-1 text-sm leading-relaxed opacity-90"><bdi>{translateDecisionReasons(reason, s as any, language)}</bdi></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

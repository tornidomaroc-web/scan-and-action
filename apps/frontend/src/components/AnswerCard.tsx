import React from 'react';
import { Sparkles, Clock } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

// AI answer card, restyled onto the --sa-* token system (calm indigo, sentence
// case, token radii + quiet elevation). Renders ONLY the backend answer text —
// no fabricated comparison copy. All labels come from i18n so FR/AR read
// correctly. Layout is flex-based (gap, logical margins), so it mirrors in RTL.
export const AnswerCard = ({ text, meta }: { text: string; meta?: any }) => {
  const s = useStrings();
  return (
    <div className="rounded-card border border-line bg-surface-raised p-6 shadow-card lg:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn bg-accent-tint text-accent">
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{s.executiveSummary}</span>
              <span className="rounded-pill bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent-text">
                {s.aiInsight}
              </span>
            </div>
            {meta && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
                <Clock size={12} />
                {s.msProcessing.replace('{ms}', String(meta.executionTimeMs))}
              </span>
            )}
          </div>

          <p className="mt-4 text-lg leading-relaxed text-ink lg:text-xl">{text}</p>

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px w-8 flex-shrink-0 rounded-pill bg-line" />
            <span className="text-xs font-medium text-ink-muted">{s.synthesizedFrom}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

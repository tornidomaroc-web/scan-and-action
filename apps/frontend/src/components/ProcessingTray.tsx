import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, FileText, X, ChevronRight } from 'lucide-react';
import { useProcessing, ProcessingJob } from '../contexts/ProcessingContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCount } from '../lib/formatNumber';
import { useBackDismiss } from '../native/useBackDismiss';
import { sheetClass } from './ui/Panel';

const statusIcon = (job: ProcessingJob) => {
  switch (job.status) {
    case 'PROCESSING':
      return <Loader2 size={18} className="animate-spin text-accent" />;
    case 'COMPLETED':
      return <CheckCircle size={18} className="text-success" />;
    case 'NEEDS_REVIEW':
      return <AlertCircle size={18} className="text-warning" />;
    default:
      return <AlertCircle size={18} className="text-danger" />;
  }
};

// Status chip above the mobile tab bar + the tray sheet it opens.
export const ProcessingTray: React.FC = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { jobs, processingCount, clearSettled } = useProcessing();
  const [open, setOpen] = useState(false);
  // On a pushed receipt screen the chip has no place: the shell draws no tab
  // bar there (Layout.tsx), the screen's own fixed Approve / Reject bar takes
  // the bottom, and on the owner's iPhone (build 15, 2026-10-04) the chip at
  // `bottom-24` sat across both buttons: 34 px of safe area lifted the bar
  // into the chip's 96 px, an 18 px overlap over the buttons' inner halves.
  // The screen itself carries the state the chip would show (the reading
  // state, one status), so nothing is lost; the chip returns with the list.
  const onDetail = /^\/documents\//.test(useLocation().pathname);

  // Android back button closes the tray sheet before navigating (no-op on web).
  useBackDismiss(open, () => setOpen(false));

  if (jobs.length === 0 || onDetail) return null;

  // Once nothing is in flight the chip names the OUTCOME, not the end of the
  // wait: "Processing complete" above a document that needs review told the
  // person the opposite of what the row inside says (board, Step 3). A failure
  // outranks a review, which outranks a clean finish.
  const outcome = jobs.some((j) => j.status === 'FAILED') ? 'failed'
    : jobs.some((j) => j.status === 'NEEDS_REVIEW') ? 'review'
    : 'done';
  const chipLabel =
    processingCount > 0 ? s.processingChip.replace('{n}', formatCount(processingCount, language))
    : outcome === 'failed' ? s.processingFailedChip
    : outcome === 'review' ? s.processingNeedsReviewChip
    : s.processingDone;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="processing-chip"
        data-processing-outcome={processingCount > 0 ? 'processing' : outcome}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:bottom-8 md:translate-x-0 z-tray min-h-[44px] flex items-center gap-2 px-5 py-2.5 rounded-pill bg-surface-raised text-ink text-sm font-semibold shadow-raised ring-1 ring-line transition-all active:scale-95 active:shadow-pressed motion-reduce:transition-none"
      >
        {processingCount > 0 ? (
          <Loader2 size={16} className="animate-spin text-accent" aria-hidden="true" />
        ) : outcome === 'failed' ? (
          <AlertCircle size={16} className="text-danger" aria-hidden="true" />
        ) : outcome === 'review' ? (
          <AlertCircle size={16} className="text-warning" aria-hidden="true" />
        ) : (
          <CheckCircle size={16} className="text-success" aria-hidden="true" />
        )}
        {chipLabel}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-tray-panel bg-overlay backdrop-blur-sm flex items-end md:items-center md:justify-center" onClick={() => setOpen(false)}>
            <div
              className={`w-full md:max-w-md ${sheetClass} rounded-t-panel md:rounded-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300`}
              onClick={(e) => e.stopPropagation()}
              data-testid="processing-tray"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-section font-semibold text-ink">{s.processingTitle}</h3>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink rounded-pill transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {jobs.map((job) => {
                  const openable = job.status === 'COMPLETED' || job.status === 'NEEDS_REVIEW';
                  return (
                    <div
                      key={job.documentId}
                      role={openable ? 'button' : undefined}
                      onClick={
                        openable
                          ? () => {
                              setOpen(false);
                              navigate(`/documents/${job.documentId}`);
                            }
                          : undefined
                      }
                      className={`p-3 rounded-card bg-surface-raised shadow-card ring-1 ring-line ${
                        openable ? 'cursor-pointer hover:ring-accent' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 flex-shrink-0 rounded-tile bg-surface-muted flex items-center justify-center">
                          <FileText size={16} className="text-ink-secondary" aria-hidden="true" />
                        </div>
                        {/* dir="auto" ON the truncating box (no isolate child): without
                            it the box inherits the document direction, so in Arabic a
                            Latin filename truncates from its LEADING (identifying) end
                            and the user cannot tell which document is processing. */}
                        <p dir="auto" className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{job.fileName}</p>
                        {statusIcon(job)}
                        {/* Reading-direction icon: `rtl:-scale-x-100`, the same idiom
                            every other chevron in the app carries. It sits in the
                            SAME row as the dir="auto" filename above and was missed
                            when that attribute landed (#142). */}
                        {openable && <ChevronRight size={16} className="text-ink-muted flex-shrink-0 rtl:-scale-x-100" aria-hidden="true" />}
                      </div>
                      {job.status === 'PROCESSING' && (
                        <div
                          data-testid="job-progress"
                          className="progress-indeterminate h-1 mt-2.5 rounded-pill bg-surface-muted"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {processingCount > 0 && (
                <p className="mt-4 text-xs font-medium text-ink-secondary text-center leading-relaxed">
                  {s.processingHint}
                </p>
              )}

              {jobs.some((j) => j.status !== 'PROCESSING') && (
                <button
                  onClick={() => {
                    clearSettled();
                    if (processingCount === 0) setOpen(false);
                  }}
                  className="w-full mt-4 min-h-[44px] rounded-pill bg-surface-muted text-ink text-sm font-semibold transition-colors hover:bg-surface-alt active:scale-[0.99]"
                >
                  {s.clearDone}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

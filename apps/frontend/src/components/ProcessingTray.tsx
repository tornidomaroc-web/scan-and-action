import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, FileText, X, ChevronRight } from 'lucide-react';
import { useProcessing, ProcessingJob } from '../contexts/ProcessingContext';
import { useStrings } from '../i18n/useStrings';

const statusIcon = (job: ProcessingJob) => {
  switch (job.status) {
    case 'PROCESSING':
      return <Loader2 size={18} className="animate-spin text-blue-500" />;
    case 'COMPLETED':
      return <CheckCircle size={18} className="text-emerald-500" />;
    case 'NEEDS_REVIEW':
      return <AlertCircle size={18} className="text-amber-500" />;
    default:
      return <AlertCircle size={18} className="text-red-500" />;
  }
};

// Status chip above the mobile tab bar + the tray sheet it opens.
export const ProcessingTray: React.FC = () => {
  const s = useStrings();
  const navigate = useNavigate();
  const { jobs, processingCount, clearSettled } = useProcessing();
  const [open, setOpen] = useState(false);

  if (jobs.length === 0) return null;

  const chipLabel =
    processingCount > 0 ? s.processingChip.replace('{n}', processingCount.toString()) : s.processingDone;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="processing-chip"
        className="fixed bottom-24 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:bottom-8 md:translate-x-0 z-[70] min-h-[44px] flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 dark:bg-slate-800 text-white text-xs font-black uppercase tracking-wider shadow-2xl shadow-slate-900/30 border border-slate-700 transition-all active:scale-95"
      >
        {processingCount > 0 ? (
          <Loader2 size={16} className="animate-spin text-blue-400" />
        ) : (
          <CheckCircle size={16} className="text-emerald-400" />
        )}
        {chipLabel}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9000] bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center md:justify-center" onClick={() => setOpen(false)}>
            <div
              className="w-full md:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t md:border border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom duration-300"
              onClick={(e) => e.stopPropagation()}
              data-testid="processing-tray"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{s.processingTitle}</h3>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-colors"
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
                      className={`flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 ${
                        openable ? 'cursor-pointer hover:border-blue-400' : ''
                      }`}
                    >
                      <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                        <FileText size={16} className="text-slate-400" />
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{job.fileName}</p>
                      {statusIcon(job)}
                      {openable && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {jobs.some((j) => j.status !== 'PROCESSING') && (
                <button
                  onClick={() => {
                    clearSettled();
                    if (processingCount === 0) setOpen(false);
                  }}
                  className="w-full mt-4 min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:border-slate-400 transition-colors"
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

import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CheckCircle, XCircle, FileText, ChevronRight, Filter, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { documentService } from '../services/documentService';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ReviewBadge } from '../components/SharedComponents';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';

export const ReviewQueueScreen = ({ t, rtl }: any) => {
  const s = useStrings();
  const navigate = useNavigate();
  const { onSuccess } = useOutletContext<{ onSuccess: () => void }>();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { showToast } = useToast();

  const fetchQueue = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await documentService.getReviewQueue();
      setDocs(data);
    } catch (err: any) {
      setErrorMsg('We encountered an issue retrieving your review queue. Please try again or check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    if (actioningId) return; // Prevent double-clicks
    
    setActioningId(id);
    try {
      // Approve = COMPLETED
      // Reject = REJECTED
      const newStatus = action === 'approve' ? 'COMPLETED' : 'REJECTED';
      
      await documentService.updateStatus(id, newStatus);
      
      // Only remove from UI after successful backend update
      setDocs(prev => prev.filter(d => d.id !== id));
      
      if (action === 'approve') {
        showToast('Document approved and intelligence verified.', 'success');
      } else {
        showToast('Document marked as rejected.', 'info');
      }
      
      // Refresh Dashboard stats
      onSuccess();
    } catch (error) {
      console.error('[ReviewQueue] Action failed:', error);
      showToast('We couldn\'t update this review item. Please try again.', 'error');
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500">
        <div className="mb-8 flex items-end justify-between">
           <div>
             <div className="h-10 w-64 skeleton mb-3 rounded-lg dark:bg-slate-800" />
             <div className="h-5 w-80 skeleton rounded-md dark:bg-slate-800" />
           </div>
           <div className="h-10 w-32 skeleton rounded-full dark:bg-slate-800" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card h-24 skeleton border-none dark:bg-slate-800" style={{ borderRadius: '24px' }} />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg) return <ErrorState message={errorMsg} onRetry={fetchQueue} />;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">{s.queue}</h1>
          <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{s.validationQueue}</p>
        </div>
        <button className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-2.5 rounded-full text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
           <SlidersHorizontal size={16} />
           {s.filters}
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="card py-24 bg-white dark:bg-slate-800 border-dashed border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center rounded-[32px]">
          <EmptyState 
            message={s.allCaughtUp} 
            description="You've reviewed all pending documents. Great work today."
            icon={<div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 rounded-3xl flex items-center justify-center mb-0 shadow-lg shadow-emerald-100 dark:shadow-none"><CheckCircle size={40} /></div>}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-[32px] overflow-hidden shadow-2xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
          <table className="saas-table">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700/50">
                <th className="group px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.documentSource}</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.processingStatus}</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.aiConfidence}</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.extractedDate}</th>
                <th className="px-6 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.quickActions}</th>
              </tr>
            </thead>
            <tbody className="dark:divide-slate-700">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-700/40 transition-all group">
                  <td className="pl-10 py-6">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mr-5 shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                        <FileText size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 dark:text-slate-100 truncate text-base mb-0.5">{doc.originalFileName || doc.name}</p>
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{doc.type || 'Invoice'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {s.pendingReviewStatus}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <ReviewBadge confidence={doc.overallConfidence || 0.92} status={doc.status} />
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {doc.date ? new Date(doc.date).toLocaleDateString() : s.recently}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-6 group-hover:translate-x-0 duration-300">
                        <button 
                          onClick={() => handleAction(doc.id, 'approve')}
                          className="p-2.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-2xl transition-all hover:scale-110 active:scale-90"
                          title="Approve"
                        >
                          <CheckCircle size={24} strokeWidth={2.5} />
                        </button>
                        <button 
                          onClick={() => handleAction(doc.id, 'reject')}
                          className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all hover:scale-110 active:scale-90"
                          title="Reject"
                        >
                          <XCircle size={24} strokeWidth={2.5} />
                        </button>
                      </div>
                      <button 
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
                      >
                        {s.deepReview}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

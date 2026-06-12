import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle, XCircle, FileText } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { ReviewBadge } from '../components/SharedComponents';
import { DecisionBanner } from '../components/DecisionBanner';
import { FixActionPanel } from '../components/FixActionPanel';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';

export const DocumentDetailScreen = () => {
  const s = useStrings();
  const fieldLabel = (key: string): string => {
    const map: Record<string, string> = {
      TRANSACTION_DATE: s.transactionDate,
      TOTAL_AMOUNT: s.totalAmount,
      decision: s.decisionField,
      decision_reason: s.decisionReason,
    };
    return map[key] || key;
  };
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!documentId) return <ErrorState title={s.errorTitle} message="Missing document ID" />;
  const { showToast } = useToast();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [actioning, setActioning] = useState(false);

  // Same review actions as the queue, surfaced here so a mobile user who
  // tapped through to the detail can resolve the document in place.
  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (actioning) return;
    setActioning(true);
    try {
      await documentService.updateStatus(documentId!, action === 'approve' ? 'COMPLETED' : 'REJECTED');
      showToast(
        action === 'approve' ? 'Document approved and intelligence verified.' : 'Document marked as rejected.',
        action === 'approve' ? 'success' : 'info'
      );
      navigate('/queue');
    } catch (error) {
      console.error('[DocumentDetail] Review action failed:', error);
      showToast("We couldn't update this review item. Please try again.", 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    documentService
      .getDocumentDetail(documentId!)
      .then(setDoc)
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    handleRefresh();
  }, [documentId]);

  const DocumentDetailSkeleton = () => (
    <div className="max-w-[1000px] mx-auto animate-in fade-in duration-500">
      <div className="h-6 w-32 skeleton mb-8 rounded dark:bg-slate-800" />
      <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-100 dark:border-slate-800 shadow-xl">
        <div className="flex justify-between items-start mb-8">
          <div className="space-y-3">
            <div className="h-10 w-64 skeleton rounded-lg dark:bg-slate-800" />
            <div className="h-4 w-40 skeleton rounded dark:bg-slate-800" />
          </div>
          <div className="h-10 w-32 skeleton rounded-full dark:bg-slate-800" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[1,2,3,4].map(i => <div key={i} className="h-16 skeleton rounded-xl dark:bg-slate-800" />)}
        </div>
        <div className="h-[400px] skeleton rounded-2xl dark:bg-slate-800 mb-10" />
        <div className="h-32 skeleton rounded-2xl dark:bg-slate-800" />
      </div>
    </div>
  );

  if (loading) return <DocumentDetailSkeleton />;

  if (errorMsg) return <div className="max-w-[1000px] mx-auto py-12"><ErrorState title={s.errorTitle} message={errorMsg} onRetry={() => window.location.reload()} /></div>;
  if (!doc) return <div className="max-w-[1000px] mx-auto py-12"><ErrorState title={s.errorTitle} message={s.docNotFound} /></div>;

  const isImageFile = typeof doc.signedFileUrl === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.originalFileName || '');
  const isPdfFile = typeof doc.signedFileUrl === 'string' && /\.pdf$/i.test(doc.originalFileName || '');

  const decisionFact = doc.facts?.find((f: any) => f.key === 'decision');
  const reasonFact = doc.facts?.find((f: any) => f.key === 'decision_reason');
  const decision = decisionFact?.valueString || null;
  const reason = reasonFact?.valueString || undefined;

  return (
    <div className="max-w-[1000px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <button 
        onClick={() => navigate(-1)} 
        className="group flex items-center gap-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-black text-xs uppercase tracking-widest mb-10 transition-all active:scale-95"
      >
        <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm group-hover:border-blue-500 transition-colors">
          <ChevronLeft size={18} strokeWidth={3} />
        </div>
        {s.backToSearch || 'Back to Workspace'}
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-[40px] p-5 md:p-10 border border-slate-100 dark:border-slate-800 shadow-2xl shadow-slate-200/40 dark:shadow-none">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-10">
          <div className="min-w-0">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-3 leading-tight truncate max-w-full">
              {doc.originalFileName || `Document ${doc.id}`}
            </h1>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                <FileText size={18} strokeWidth={2.5} />
              </div>
              <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">
                {s.verifiedExtraction}
              </p>
            </div>
          </div>
          <div className="max-w-[200px] truncate flex-shrink-0">
            <ReviewBadge confidence={doc.overallConfidence} status={doc.status} />
          </div>
        </div>

        <DecisionBanner decision={decision} reason={reason} />

        <FixActionPanel 
          documentId={doc.id} 
          decision={decision} 
          reason={reason} 
          onSuccess={handleRefresh} 
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: s.status, value: doc.status.replace('_', ' '), color: 'text-blue-600' },
            { label: s.type, value: doc.documentType || 'General', color: 'text-slate-600 dark:text-slate-300' },
            { label: s.date, value: new Date(doc.uploadedAt).toLocaleDateString(), color: 'text-slate-600 dark:text-slate-300' },
            { label: s.docLanguage, value: doc.detectedLanguage?.toUpperCase() || 'EN', color: 'text-slate-600 dark:text-slate-300' },
          ].map((item, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 overflow-hidden">
              <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 truncate">{item.label}</span>
              <span className={`text-sm font-black uppercase tracking-tight truncate block ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {doc.signedFileUrl && (
          <div className="mb-12">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-5 italic ml-1">{s.sourceVisualization}</h3>
            <div className="rounded-3xl overflow-hidden border-2 border-slate-100 dark:border-slate-800 shadow-2xl bg-slate-50 dark:bg-slate-800">
              {isImageFile ? (
                <img
                  src={doc.signedFileUrl}
                  alt={doc.originalFileName || 'Document source'}
                  className="w-full h-auto max-h-[800px] object-contain mx-auto transition-transform duration-700 hover:scale-[1.02]"
                />
              ) : isPdfFile ? (
                <iframe
                  src={doc.signedFileUrl}
                  title={doc.originalFileName || 'PDF source'}
                  className="w-full h-[700px] border-none"
                />
              ) : (
                <div className="p-20 text-center">
                   <div className="w-20 h-20 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                      <FileText size={40} className="text-blue-500" />
                   </div>
                   <p className="text-lg font-black text-slate-900 dark:text-white mb-6">Preview unavailable for this format.</p>
                   <a href={doc.signedFileUrl} target="_blank" rel="noreferrer" className="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20">
                     Open Original Source
                   </a>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-blue-600 dark:bg-blue-600/10 p-8 rounded-[32px] text-white dark:text-slate-100 mb-12 border-l-8 border-blue-400 dark:border-blue-500 shadow-xl shadow-blue-600/10 dark:shadow-none">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200 dark:text-blue-400 mb-4 opacity-80">{s.aiSynthesis}</h4>
          <p className="text-base font-bold leading-relaxed opacity-90">{doc.summary}</p>
        </div>

        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8 flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 dark:shadow-none">
                <CheckCircle size={22} strokeWidth={2.5} />
             </div>
             {s.extractedFacts}
          </h3>
          
          {doc.facts && doc.facts.length > 0 ? (
            <>
            {/* Mobile: stacked label/value rows — the 3-column table clips
                at phone widths. */}
            <div className="md:hidden bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm divide-y divide-slate-50 dark:divide-slate-800">
              {doc.facts.map((fact: any, i: number) => (
                <div key={i} className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{fieldLabel(fact.key)}</span>
                    <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
                      fact.confidence > 0.9
                        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800'
                        : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800'
                    }`}>
                      {Math.round(fact.confidence * 100)}% {s.match}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">
                    {fact.valueString || fact.valueNumber || String(fact.valueDate)} {fact.currency || ''}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden md:block bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.factLabel}</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.dataValue}</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.precision}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {doc.facts.map((fact: any, i: number) => (
                    <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-5 font-black text-slate-900 dark:text-slate-100 text-sm group-hover:text-blue-600 transition-colors">{fieldLabel(fact.key)}</td>
                      <td className="px-8 py-5 font-bold text-slate-600 dark:text-slate-300 text-sm">
                        {fact.valueString || fact.valueNumber || String(fact.valueDate)} {fact.currency || ''}
                      </td>
                      <td className="px-8 py-5">
                         <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black border ${
                           fact.confidence > 0.9 
                             ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800' 
                             : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800'
                         }`}>
                            {Math.round(fact.confidence * 100)}% {s.match}
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 font-bold italic">
               {s.noFacts}
            </div>
          )}
        </div>

        <div className="mt-16 pt-10 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6 ml-1">{s.graphRelationships}</h3>
          {doc.entities && doc.entities.length > 0 ? (
            <div className="flex gap-3 flex-wrap">
              {doc.entities.map((ent: any, i: number) => (
                <div key={i} className="group flex items-center gap-3 bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 shadow-sm transition-all hover:scale-105">
                  <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors uppercase italic">{ent.role}</span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight">{ent.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm font-bold italic ml-1">{s.noEntities}</p>
          )}
        </div>
      </div>

      {/* Sticky review actions: bottom-20 clears the mobile tab bar;
          md:bottom-6 sits above the viewport edge on desktop. */}
      {doc.status === 'NEEDS_REVIEW' && (
        <div className="sticky bottom-20 md:bottom-6 z-40 mt-8">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-slate-900/10 p-3 flex gap-3">
            <button
              onClick={() => handleReviewAction('approve')}
              disabled={actioning}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle size={18} strokeWidth={2.5} />
              {s.approve}
            </button>
            <button
              onClick={() => handleReviewAction('reject')}
              disabled={actioning}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-red-600/20"
            >
              <XCircle size={18} strokeWidth={2.5} />
              {s.reject}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle, FileText } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { ReviewBadge } from '../components/SharedComponents';
import { DecisionBanner } from '../components/DecisionBanner';
import { FixActionPanel } from '../components/FixActionPanel';

export const DocumentDetailScreen = ({
  t,
}: {
  t: any;
}) => {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!documentId) return <ErrorState title={t.errorTitle} message="Missing document ID" />;
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

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

  if (errorMsg) return <div className="max-w-[1000px] mx-auto py-12"><ErrorState title={t.errorTitle} message={errorMsg} onRetry={() => window.location.reload()} /></div>;
  if (!doc) return <div className="max-w-[1000px] mx-auto py-12"><ErrorState title={t.errorTitle} message={t.docNotFound} /></div>;

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
        {t.backToSearch || 'Back to Workspace'}
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-100 dark:border-slate-800 shadow-2xl shadow-slate-200/40 dark:shadow-none">
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-3 leading-tight">
              {doc.originalFileName || `Document ${doc.id}`}
            </h1>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                <FileText size={18} strokeWidth={2.5} />
              </div>
              <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">
                Verified AI Intelligence Extraction
              </p>
            </div>
          </div>
          <ReviewBadge confidence={doc.overallConfidence} status={doc.status} />
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
            { label: t.status, value: doc.status.replace('_', ' '), color: 'text-blue-600' },
            { label: t.type, value: doc.documentType || 'General', color: 'text-slate-600 dark:text-slate-300' },
            { label: t.date, value: new Date(doc.uploadedAt).toLocaleDateString(), color: 'text-slate-600 dark:text-slate-300' },
            { label: t.docLanguage, value: doc.detectedLanguage?.toUpperCase() || 'EN', color: 'text-slate-600 dark:text-slate-300' },
          ].map((item, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
              <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{item.label}</span>
              <span className={`text-sm font-black uppercase tracking-tight ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {doc.signedFileUrl && (
          <div className="mb-12">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-5 italic ml-1">Source Visualization</h3>
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
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200 dark:text-blue-400 mb-4 opacity-80">AI Synthesis</h4>
          <p className="text-base font-bold leading-relaxed opacity-90">{doc.summary}</p>
        </div>

        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8 flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 dark:shadow-none">
                <CheckCircle size={22} strokeWidth={2.5} />
             </div>
             {t.extractedFacts || 'Extracted Intelligence'}
          </h3>
          
          {doc.facts && doc.facts.length > 0 ? (
            <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.key || 'Fact Label'}</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.value || 'Data Value'}</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.confidence || 'Precision'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {doc.facts.map((fact: any, i: number) => (
                    <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-5 font-black text-slate-900 dark:text-slate-100 text-sm group-hover:text-blue-600 transition-colors">{fact.key}</td>
                      <td className="px-8 py-5 font-bold text-slate-600 dark:text-slate-300 text-sm">
                        {fact.valueString || fact.valueNumber || String(fact.valueDate)} {fact.currency || ''}
                      </td>
                      <td className="px-8 py-5">
                         <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black border ${
                           fact.confidence > 0.9 
                             ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800' 
                             : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800'
                         }`}>
                            {Math.round(fact.confidence * 100)}% Match
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 font-bold italic">
               {t.noFacts || 'No structured data identified.'}
            </div>
          )}
        </div>

        <div className="mt-16 pt-10 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6 ml-1">Graph Relationships</h3>
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
            <p className="text-slate-400 text-sm font-bold italic ml-1">{t.noEntities || 'No linked entities found.'}</p>
          )}
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File, CheckCircle, AlertCircle, Loader2, Clock } from 'lucide-react';
import { uploadDocument } from '../services/uploadService';
import { documentService } from '../services/documentService';
import { useToast } from '../contexts/ToastContext';
import { PaywallModal } from './PaywallModal';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  plan?: 'FREE' | 'PRO';
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess, plan }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'partial'>('idle');
  const [results, setResults] = useState<{ success: number; total: number }>({ success: 0, total: 0 });
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [showPaywall, setShowPaywall] = useState(false);
  // docStatus tracks async processing state per file name: PROCESSING | COMPLETED | NEEDS_REVIEW | FAILED
  const [docStatus, setDocStatus] = useState<Record<string, string>>({});
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const { showToast } = useToast();

  // Polls a single document until it leaves PROCESSING (or 90s timeout)
  const startPolling = (fileName: string, documentId: string) => {
    const startTime = Date.now();
    const TIMEOUT_MS = 90_000;
    const INTERVAL_MS = 3_000;

    setDocStatus(prev => ({ ...prev, [fileName]: 'PROCESSING' }));

    const timer = setInterval(async () => {
      try {
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(timer);
          setDocStatus(prev => ({ ...prev, [fileName]: 'FAILED' }));
          return;
        }
        const doc = await documentService.getDocumentDetail(documentId);
        const s: string = doc.status ?? 'PROCESSING';
        setDocStatus(prev => ({ ...prev, [fileName]: s }));
        if (s !== 'PROCESSING') {
          clearInterval(timer);
          delete pollTimers.current[fileName];
          if (s === 'COMPLETED' || s === 'NEEDS_REVIEW') {
            // Refresh dashboard data once processing is confirmed
            onSuccess?.();
          }
        }
      } catch {
        clearInterval(timer);
        setDocStatus(prev => ({ ...prev, [fileName]: 'FAILED' }));
      }
    }, INTERVAL_MS);

    pollTimers.current[fileName] = timer;
  };

  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setUploading(false);
      setProgress(0);
      setStatus('idle');
      setResults({ success: 0, total: 0 });
      setFileErrors({});
      setShowPaywall(false);
      setDocStatus({});
    } else {
      // Clear all poll timers when modal closes
      Object.values(pollTimers.current).forEach(clearInterval);
      pollTimers.current = {};
    }
  }, [isOpen]);

  const addFiles = (newFiles: FileList | File[]) => {
    const incomingFiles = Array.from(newFiles);
    const totalPotentialCount = files.length + incomingFiles.length;

    // -----------------------------------------------------------------------
    // FIX-06/07 — TRI-STATE GATING: Strictly limit FREE to 1 file per batch
    // -----------------------------------------------------------------------
    if (totalPotentialCount > 1) {
      if (plan === 'FREE') {
        setShowPaywall(true);
        return; // Reject ALL incoming files for better UX clarity
      }
      
      if (plan === undefined) {
        showToast('Verifying account status...', 'info');
        return; // Reject until plan is confirmed (Neutral behavior)
      }
    }

    const validFiles = incomingFiles.filter(newFile => {
      return !files.some(f => f.name === newFile.name && f.size === newFile.size && f.lastModified === newFile.lastModified);
    });
    
    if (validFiles.length < incomingFiles.length) {
      showToast('Duplicate files ignored', 'info');
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const fileName = files[index]?.name;
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (fileName) {
      setFileErrors(prev => {
        const next = { ...prev };
        delete next[fileName];
        return next;
      });
    }
  };

  const startUpload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setStatus('idle');
    setProgress(0);
    setFileErrors({});

    let successCount = 0;
    const totalCount = files.length;
    const successfulFileIndices: number[] = [];

    try {
      for (let i = 0; i < totalCount; i++) {
        const currentFile = files[i];
        try {
          const result = await uploadDocument(currentFile);
          successCount++;
          successfulFileIndices.push(i);
          // If backend returned async PROCESSING status, begin polling
          if (result?.documentId && result?.status === 'PROCESSING') {
            startPolling(currentFile.name, result.documentId);
          }
        } catch (err: any) {
          console.error(`Failed to upload ${currentFile.name}:`, err);
          const errorMessage = err.message || 'Processing failed';
          setFileErrors(prev => ({ ...prev, [currentFile.name]: errorMessage }));
          showToast(`${currentFile.name}: ${errorMessage}`, 'error');

          // Trigger Paywall if error is multi-document validation AND user is not PRO
          if (errorMessage === 'Please upload a single document per image' && plan !== 'PRO') {
            setShowPaywall(true);
          }
        }
        setProgress(Math.round(((i + 1) / totalCount) * 100));
      }

      setResults({ success: successCount, total: totalCount });

      if (successfulFileIndices.length > 0) {
        setFiles(prev => prev.filter((_, idx) => !successfulFileIndices.includes(idx)));
      }

      if (successCount === totalCount) {
        setStatus('success');
        showToast(`Uploaded ${totalCount} document${totalCount > 1 ? 's' : ''}. Processing in background...`, 'success');
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 2000);
      } else if (successCount > 0) {
        setStatus('partial');
        showToast(`Uploaded ${successCount}/${totalCount} documents. Some failed.`, 'info');
        if (onSuccess) onSuccess();
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
      showToast('Batch processing interrupted.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const resetToIdle = () => {
    setStatus('idle');
    setProgress(0);
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex justify-center items-center bg-gray-900/80 dark:bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[560px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Upload Documents</h2>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-1">Select one or more files for AI extraction.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all mb-6 ${
              isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]' 
                : 'border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-gray-400 dark:hover:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              accept=".pdf,.png,.jpg,.jpeg"
            />
            
            <div className="relative z-0 pointer-events-none flex flex-col items-center">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center mb-4 shadow-sm border border-gray-200 dark:border-slate-700">
                <Upload size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Drop files or <span className="text-blue-600 dark:text-blue-400 underline pointer-events-auto">browse</span>
              </h3>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Supports PDF, PNG, JPG up to 10MB per file
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-[240px] overflow-y-auto pr-2 space-y-2">
                {files.map((f, idx) => {
                  const ds = docStatus[f.name];
                  const hasError = !!fileErrors[f.name];
                  const isProcessing = ds === 'PROCESSING';
                  const isCompleted = ds === 'COMPLETED' || ds === 'NEEDS_REVIEW';
                  const isFailed = ds === 'FAILED';
                  return (
                  <div key={`${f.name}-${idx}`} className={`p-3 rounded-lg border flex flex-col gap-2 shadow-sm transition-colors ${
                    hasError || isFailed ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
                    : isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm border flex-shrink-0 ${
                          hasError || isFailed ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/40'
                          : isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/40'
                          : 'bg-white dark:bg-slate-700 border-gray-100 dark:border-slate-600'
                        }`}>
                          {hasError || isFailed ? (
                            <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
                          ) : isCompleted ? (
                            <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                          ) : isProcessing ? (
                            <Loader2 size={20} className="animate-spin text-blue-600 dark:text-blue-400" />
                          ) : (
                            <File size={20} className="text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${
                            hasError || isFailed ? 'text-red-900 dark:text-red-200'
                            : isCompleted ? 'text-emerald-900 dark:text-emerald-100'
                            : 'text-gray-900 dark:text-slate-100'
                          }`}>{f.name}</p>
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">
                            {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type.split('/')[1]?.toUpperCase() || 'FILE'}
                            {isProcessing && <span className="ml-1 text-blue-500">• Analysing…</span>}
                            {ds === 'NEEDS_REVIEW' && <span className="ml-1 text-amber-500">• Needs Review</span>}
                            {ds === 'COMPLETED' && <span className="ml-1 text-emerald-500">• Done</span>}
                            {isFailed && <span className="ml-1 text-red-500">• Failed</span>}
                          </p>
                        </div>
                      </div>
                      {!uploading && !isProcessing && (
                        <button
                          onClick={() => removeFile(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          aria-label="Remove file"
                        >
                          <X size={16} />
                        </button>
                      )}
                      {isProcessing && <Clock size={14} className="text-blue-400 flex-shrink-0" />}
                    </div>
                    {(hasError || isFailed) && (
                      <p className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/20 px-2 py-1 rounded">
                        {fileErrors[f.name] || 'AI extraction failed. Please try again.'}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>

              {uploading || status !== 'idle' ? (
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white mb-2">
                    <span className="flex items-center gap-2">
                      {status === 'success' ? (
                        <><CheckCircle size={18} className="text-emerald-600"/> Success</>
                      ) : status === 'partial' ? (
                        <><AlertCircle size={18} className="text-amber-600"/> Partial Success ({results.success}/{results.total})</>
                      ) : status === 'error' ? (
                        <><AlertCircle size={18} className="text-red-600"/> Requirements Missing</>
                      ) : (
                        <><Loader2 size={18} className="animate-spin text-blue-600"/> Ingesting...</>
                      )}
                    </span>
                    {uploading && <span className="text-gray-500 dark:text-slate-400 font-black">{progress}%</span>}
                  </div>

                  {uploading && (
                    <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden border border-gray-200/50 dark:border-slate-700/50 mb-6">
                      <div 
                        className={`h-full transition-all duration-500 ease-out ${status === 'error' ? 'bg-red-500' : 'bg-blue-600 dark:bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {!uploading && status !== 'idle' && (
                    <div className="space-y-4">
                      {status === 'success' ? (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-2xl p-6 text-center">
                           <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-emerald-100 dark:border-emerald-800">
                             <CheckCircle size={24} className="text-emerald-500" />
                           </div>
                           <h3 className="text-xl font-black text-emerald-900 dark:text-emerald-100 mb-1 tracking-tight">Verified</h3>
                           <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                             Document intelligence extracted successfully.
                           </p>
                           <p className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-4 animate-pulse uppercase tracking-widest">
                             Closing...
                           </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={onClose}
                            className="btn-secondary py-3 text-sm font-black dark:bg-slate-800"
                          >
                            Close Modal
                          </button>
                          <button
                            onClick={resetToIdle}
                            className="btn-primary py-3 text-sm font-black bg-slate-900 dark:bg-blue-600"
                          >
                            Manage Files
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <button
                    onClick={onClose}
                    className="w-full btn-secondary py-3 text-base font-black dark:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startUpload}
                    className="w-full btn-primary py-3 text-base font-black"
                  >
                    Start Extraction ({files.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
    </div>,
    document.body
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File as FileIcon, CheckCircle, AlertCircle, Loader2, Camera } from 'lucide-react';
import { uploadDocument } from '../services/uploadService';
import { useToast } from '../contexts/ToastContext';
import { useProcessing } from '../contexts/ProcessingContext';
import { preprocessImage } from '../lib/imagePreprocess';
import { PaywallModal } from './PaywallModal';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { isNativePlatform } from '../native/shell';
import { translateUploadError } from '../lib/uploadErrors';
import { formatFileMeta } from '../lib/formatFileMeta';
import { useBackDismiss } from '../native/useBackDismiss';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  plan?: 'FREE' | 'PRO';
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess, plan }) => {
  const s = useStrings();
  const { language } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'partial'>('idle');
  const [results, setResults] = useState<{ success: number; total: number }>({ success: 0, total: 0 });
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [showPaywall, setShowPaywall] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToast();
  // Processing now lives at app level: uploads hand off to the tray and the
  // modal can close freely (no more 90s hostage-taking while polling).
  const { trackUpload } = useProcessing();

  // Android hardware back closes this modal before it can minimize the app or
  // navigate the screen underneath: UploadModal is mounted in the app shell and
  // opens over /dashboard, a HOME_ROUTE, so without this the back button hits
  // App.minimizeApp() (see NativeBackButton). Bare `isOpen`, NOT `!uploading` —
  // the scrim (:onClick={onClose}) and header X are unguarded and the modal is
  // deliberately dismissable mid-upload (the app-level tray owns the in-flight
  // upload, per the note above), so back must match. No-op on web.
  useBackDismiss(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setUploading(false);
      setProgress(0);
      setStatus('idle');
      setResults({ success: 0, total: 0 });
      setFileErrors({});
      setShowPaywall(false);
    }
  }, [isOpen]);

  const addFiles = async (newFiles: FileList | File[]) => {
    let incomingFiles = Array.from(newFiles);

    // Phase 2: Apply light contrast enhancement to images
    incomingFiles = await Promise.all(incomingFiles.map(f => preprocessImage(f)));

    const totalPotentialCount = files.length + incomingFiles.length;

    // -----------------------------------------------------------------------
    // FIX-06/07 — TRI-STATE GATING: Strictly limit FREE to 1 file per batch
    // -----------------------------------------------------------------------
    if (totalPotentialCount > 1) {
      if (plan === 'FREE') {
        if (isNativePlatform()) {
          // Native: pure status, NO upsell/paywall (anti-steering).
          showToast(s.freePlanSingleDoc, 'info');
        } else {
          setShowPaywall(true);
        }
        return; // Reject ALL incoming files for better UX clarity
      }

      if (plan === undefined) {
        showToast(s.verifyingAccount, 'info');
        return; // Reject until plan is confirmed (Neutral behavior)
      }
    }

    const validFiles = incomingFiles.filter(newFile => {
      return !files.some(f => f.name === newFile.name && f.size === newFile.size && f.lastModified === newFile.lastModified);
    });

    if (validFiles.length < incomingFiles.length) {
      showToast(s.duplicatesIgnored, 'info');
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
          // Async processing is tracked app-wide now: the tray polls by
          // documentId and survives this modal closing.
          if (result?.documentId) {
            trackUpload(result.documentId, currentFile.name);
          }
        } catch (err: any) {
          console.error(`Failed to upload ${currentFile.name}:`, err);
          // The RAW API code stays in state — the gating below keys off it. It
          // becomes words only at the render site, via translateUploadError.
          const errorCode = err.message || '';
          setFileErrors(prev => ({ ...prev, [currentFile.name]: errorCode }));

          const isLimit = errorCode === 'LIMIT_REACHED';
          if (isLimit && plan !== 'PRO') {
            if (isNativePlatform()) {
              // Native: pure status, NO upsell/paywall (anti-steering).
              showToast(s.freePlanLimitReached, 'info');
            } else {
              // Web: legitimate sell surface — surface the error and open the paywall.
              showToast(`${currentFile.name}: ${translateUploadError(errorCode, s)}`, 'error');
              setShowPaywall(true);
            }
          } else {
            // Every other failure (incl. DAILY_LIMIT_REACHED, which PRO users hit)
            // is translated too — the raw enum must never reach the user.
            showToast(`${currentFile.name}: ${translateUploadError(errorCode, s)}`, 'error');
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
        showToast(s.uploadedProcessing, 'success');
        if (onSuccess) onSuccess();
      } else if (successCount > 0) {
        setStatus('partial');
        showToast(s.uploadedPartialResult, 'info');
        if (onSuccess) onSuccess();
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
      showToast(s.batchInterrupted, 'error');
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
      className="fixed inset-0 z-modal flex justify-center items-center bg-overlay backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-surface-raised rounded-card shadow-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="text-title-lg font-semibold text-ink tracking-tight">
              {status === 'idle' ? s.upload :
               status === 'success' ? s.uploadSuccess :
               status === 'partial' ? s.uploadPartial : s.uploadError}
            </h2>
            <p className="text-sm font-medium text-ink-secondary mt-1">
              {status === 'idle' ? s.uploadSubtitleIdle :
               status === 'success' ? s.uploadSubtitleSuccess :
               s.uploadSubtitleReview}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-pill transition-colors text-ink-muted hover:text-ink hover:bg-surface-muted"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          {/* Mobile-First Camera Action: Always available */}
          {!uploading && status === 'idle' && (
            <div className="mb-6">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full bg-accent hover:bg-accent-hover text-white py-4 rounded-btn font-semibold shadow-card flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              >
                <Camera size={24} />
                {s.scanWithCamera}
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          <div
            className={`relative border-2 border-dashed rounded-card p-8 text-center transition-all mb-6 ${
              isDragging
                ? 'border-accent bg-accent-tint scale-[1.02]'
                : 'border-line bg-surface-muted hover:border-line-strong'
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
              <div className="w-12 h-12 bg-surface-raised rounded-btn flex items-center justify-center mb-4 shadow-card border border-line">
                <Upload size={24} className="text-accent" />
              </div>
              <h3 className="text-section font-semibold text-ink mb-1">
                {s.dropFiles} <span className="text-accent underline pointer-events-auto">{s.browse}</span>
              </h3>
              <p className="text-label font-medium text-ink-tertiary">
                {s.supportedFormats}
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-[240px] overflow-y-auto pe-2 space-y-2">
                {files.map((f, idx) => {
                  const hasError = !!fileErrors[f.name];
                  return (
                  <div key={`${f.name}-${idx}`} className={`p-3 rounded-card border flex flex-col gap-2 shadow-card transition-colors ${
                    hasError ? 'bg-danger-tint border-danger/30'
                    : 'bg-surface-alt border-line'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-btn flex items-center justify-center shadow-card border flex-shrink-0 ${
                          hasError ? 'bg-danger/15 border-danger/30'
                          : 'bg-surface-raised border-line'
                        }`}>
                          {hasError ? (
                            <AlertCircle size={20} className="text-danger" />
                          ) : (
                            <FileIcon size={20} className="text-accent" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className={`text-sm font-semibold truncate ${
                            hasError ? 'text-danger-text' : 'text-ink'
                          }`}>{f.name}</p>
                          <p dir="auto" className="text-label font-semibold text-ink-muted mt-0.5">
                            {formatFileMeta(f, s, language)}
                          </p>
                        </div>
                      </div>
                      {!uploading && (
                        <button
                          onClick={() => removeFile(idx)}
                          className="p-1.5 text-ink-muted hover:text-danger hover:bg-surface-muted rounded-btn transition-colors"
                          aria-label="Remove file"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    {hasError && (
                      <p className="text-label font-semibold text-danger-text bg-danger-tint px-2 py-1 rounded-btn">
                        {translateUploadError(fileErrors[f.name], s)}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>

              {uploading || status !== 'idle' ? (
                <div className="space-y-4 pt-4 border-t border-line">
                  <div className="flex justify-between text-sm font-semibold text-ink mb-2">
                    <span className="flex items-center gap-2">
                       {status === 'success' ? (
                        <><CheckCircle size={18} className="text-success"/> {s.uploadSuccess}</>
                      ) : status === 'partial' ? (
                        <><AlertCircle size={18} className="text-warning"/> {s.uploadPartial} <bdi>({results.success}/{results.total})</bdi></>
                      ) : status === 'error' ? (
                        <><AlertCircle size={18} className="text-danger"/> {s.uploadError}</>
                      ) : (
                        <><Loader2 size={18} className="animate-spin text-accent"/> {s.uploading}</>
                      )}
                    </span>
                    {uploading && <span className="text-ink-muted font-semibold">{progress}%</span>}
                  </div>

                  {uploading && (
                    <div className="h-3 w-full bg-surface-muted rounded-pill overflow-hidden border border-line mb-6">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${status === 'error' ? 'bg-danger' : 'bg-accent'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {!uploading && status !== 'idle' && (
                    <div className="space-y-4">
                      {status === 'success' ? (
                        <div className="bg-success-tint border border-success/30 rounded-card p-6 text-center">
                           <div className="w-12 h-12 bg-surface-raised rounded-pill flex items-center justify-center mx-auto mb-3 shadow-card border border-success/30">
                             <CheckCircle size={24} className="text-success" />
                           </div>
                           <h3 className="text-section font-semibold text-success-text mb-1">{s.uploadedTitle}</h3>
                           <p className="text-sm font-medium text-ink-secondary">
                             {s.uploadBackgroundNote}
                           </p>

                           <div className="grid grid-cols-2 gap-4 mt-6">
                             <button
                               onClick={onClose}
                               className="py-3 text-sm font-semibold rounded-btn border-2 border-line text-ink-secondary hover:border-line-strong transition-colors"
                             >
                               {s.done}
                             </button>
                             <button
                               onClick={resetToIdle}
                               className="py-3 text-sm font-semibold rounded-btn bg-accent hover:bg-accent-hover text-white shadow-card transition-colors"
                             >
                               {s.manageFiles}
                             </button>
                           </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={onClose}
                            className="py-3 text-sm font-semibold rounded-btn border-2 border-line text-ink-secondary hover:border-line-strong transition-colors"
                          >
                            {s.close}
                          </button>
                          <button
                            onClick={resetToIdle}
                            className="py-3 text-sm font-semibold rounded-btn bg-accent hover:bg-accent-hover text-white transition-colors"
                          >
                            {s.manageFiles}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line">
                  <button
                    onClick={onClose}
                    className="w-full py-3 text-base font-semibold rounded-btn border-2 border-line text-ink-secondary hover:border-line-strong transition-colors"
                  >
                    {s.cancel}
                  </button>
                  <button
                    onClick={startUpload}
                    data-testid="start-extraction"
                    className="w-full py-3 text-base font-semibold rounded-btn bg-accent hover:bg-accent-hover text-white transition-colors"
                  >
                    {s.startExtraction.replace('{n}', String(files.length))}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <PaywallModal isOpen={showPaywall} onClose={() => {
        setShowPaywall(false);
        onSuccess?.();
      }} />
    </div>,
    document.body
  );
};

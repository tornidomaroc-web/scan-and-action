import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FileText, FolderOpen, Loader2, X } from 'lucide-react';
import { uploadDocument } from '../services/uploadService';
import { preprocessImage } from '../lib/imagePreprocess';
import { useProcessing } from '../contexts/ProcessingContext';
import { useToast } from '../contexts/ToastContext';
import { PaywallModal } from './PaywallModal';
import { useStrings } from '../i18n/useStrings';

export interface CaptureSheetHandle {
  open: () => void;
}

interface CaptureSheetProps {
  plan?: 'FREE' | 'PRO';
}

// Mobile capture: every scan entry point opens a source chooser (Take Photo /
// Choose File), so existing gallery photos and PDFs are uploadable alongside
// live camera capture. The confirm sheet only appears once a file exists.
export const CaptureSheet = forwardRef<CaptureSheetHandle, CaptureSheetProps>(({ plan }, ref) => {
  const s = useStrings();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { trackUpload } = useProcessing();
  const { showToast } = useToast();

  useImperativeHandle(ref, () => ({
    open: () => setChooserOpen(true),
  }));

  const releasePreview = () => {
    if (previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    releasePreview();
    setFile(picked);
    // <img> can't render PDFs — those get an icon + filename instead.
    setPreviewUrl(
      picked.type.startsWith('image/') && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(picked)
        : ''
    );
  };

  const close = () => {
    releasePreview();
    setPreviewUrl('');
    setFile(null);
  };

  // Back to the source chooser, so a wrong pick can switch source too.
  const handleRetake = () => {
    close();
    setChooserOpen(true);
  };

  const handleExtract = async () => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const processed = await preprocessImage(file);
      const result = await uploadDocument(processed);
      if (result?.documentId) {
        // Hand off to the app-level tray and free the user immediately.
        trackUpload(result.documentId, file.name);
      }
      showToast('Uploaded. Processing in background...', 'success');
      close();
    } catch (err: any) {
      const errorMessage = err.message || 'Processing failed';
      showToast(`${file.name}: ${errorMessage}`, 'error');

      // Trigger Paywall if error is multi-document validation OR limit reached AND user is not PRO
      if ((errorMessage === 'Please upload a single document per image' || errorMessage === 'LIMIT_REACHED') && plan !== 'PRO') {
        setShowPaywall(true);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        data-testid="capture-input"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
        data-testid="file-input"
      />

      {chooserOpen &&
        createPortal(
          <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end" onClick={() => setChooserOpen(false)}>
            <div
              className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-slate-700"
              onClick={(e) => e.stopPropagation()}
              data-testid="source-chooser"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{s.addDocument}</h3>
                <button
                  onClick={() => setChooserOpen(false)}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setChooserOpen(false);
                    cameraInputRef.current?.click();
                  }}
                  className="w-full min-h-[56px] flex items-center gap-4 p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
                >
                  <Camera size={22} strokeWidth={2.5} />
                  {s.takePhoto}
                </button>
                <button
                  onClick={() => {
                    setChooserOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full min-h-[56px] flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-black text-sm uppercase tracking-wider hover:border-blue-500 transition-colors active:scale-[0.98]"
                >
                  <FolderOpen size={22} strokeWidth={2.5} />
                  {s.chooseFile}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {file &&
        createPortal(
          <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end" onClick={uploading ? undefined : close}>
            <div
              className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-slate-700"
              onClick={(e) => e.stopPropagation()}
              data-testid="capture-sheet"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Camera size={20} className="text-blue-500" />
                  {s.scanWithCamera}
                </h3>
                <button
                  onClick={close}
                  disabled={uploading}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-colors disabled:opacity-40"
                >
                  <X size={20} />
                </button>
              </div>

              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="w-full max-h-[50vh] object-contain rounded-2xl bg-slate-100 dark:bg-slate-800 mb-5"
                />
              ) : (
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 mb-5">
                  <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    <FileText size={22} className="text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRetake}
                  disabled={uploading}
                  className="flex-1 min-h-[48px] rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-black text-sm uppercase tracking-wider transition-colors hover:border-slate-400 disabled:opacity-40"
                >
                  {s.retake}
                </button>
                <button
                  onClick={handleExtract}
                  disabled={uploading}
                  className="flex-1 min-h-[48px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  {uploading ? s.uploading : s.extract}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
});

CaptureSheet.displayName = 'CaptureSheet';

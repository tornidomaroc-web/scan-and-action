import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FileText, FolderOpen, Loader2, X } from 'lucide-react';
import { uploadDocument } from '../services/uploadService';
import { preprocessImage } from '../lib/imagePreprocess';
import { useProcessing } from '../contexts/ProcessingContext';
import { useToast } from '../contexts/ToastContext';
import { PaywallModal } from './PaywallModal';
import { useStrings } from '../i18n/useStrings';
import { ensureCameraPermission } from '../native/camera';
import { useBackDismiss } from '../native/useBackDismiss';
import { isNativePlatform } from '../native/shell';
import { translateUploadError } from '../lib/uploadErrors';

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

  // Android back button dismisses an open sheet before navigating (no-op on web).
  // Arrows defer reading the handlers so this stays above their declarations.
  useBackDismiss(chooserOpen, () => setChooserOpen(false));
  useBackDismiss(!!file && !uploading, () => close());

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
      // Raw API code; it becomes words only via translateUploadError (which never
      // renders the backend `message` field — see that module's header).
      const errorCode = err.message || '';
      const isLimit = errorCode === 'LIMIT_REACHED';
      const isMultiDoc = errorCode === 'Please upload a single document per image';

      if ((isLimit || isMultiDoc) && plan !== 'PRO') {
        if (isNativePlatform()) {
          // Native: pure status, NO upsell/paywall (anti-steering). Show a neutral
          // limit message instead of the raw error code or a "Go PRO" prompt.
          showToast(isLimit ? s.freePlanLimitReached : s.freePlanSingleDoc, 'info');
        } else {
          // Web: legitimate sell surface — surface the error and open the paywall.
          showToast(`${file.name}: ${translateUploadError(errorCode, s)}`, 'error');
          setShowPaywall(true);
        }
      } else {
        // Includes DAILY_LIMIT_REACHED, which PRO users hit.
        showToast(`${file.name}: ${translateUploadError(errorCode, s)}`, 'error');
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
          <div className="fixed inset-0 z-modal bg-overlay backdrop-blur-sm flex items-end" onClick={() => setChooserOpen(false)}>
            <div
              className="w-full bg-surface-raised rounded-t-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300 border-t border-line"
              onClick={(e) => e.stopPropagation()}
              data-testid="source-chooser"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-section font-semibold text-ink">{s.addDocument}</h3>
                <button
                  onClick={() => setChooserOpen(false)}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink rounded-pill transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={async () => {
                    // Native: ensure CAMERA is granted before the <input capture>
                    // fires ACTION_IMAGE_CAPTURE (which fails on a declared-but-
                    // ungranted permission). If denied, keep the chooser open so
                    // "Choose File" still works. No-op on web.
                    const ok = await ensureCameraPermission();
                    if (!ok) {
                      showToast(s.cameraPermissionDenied, 'error');
                      return;
                    }
                    setChooserOpen(false);
                    cameraInputRef.current?.click();
                  }}
                  className="w-full min-h-[56px] flex items-center gap-4 p-4 rounded-btn bg-accent hover:bg-accent-hover text-white font-semibold text-section shadow-card transition-all active:scale-[0.98]"
                >
                  <Camera size={22} strokeWidth={2.5} />
                  {s.takePhoto}
                </button>
                <button
                  onClick={() => {
                    setChooserOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full min-h-[56px] flex items-center gap-4 p-4 rounded-btn border-2 border-line text-ink-secondary font-semibold text-section hover:border-accent transition-colors active:scale-[0.98]"
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
          <div className="fixed inset-0 z-modal bg-overlay backdrop-blur-sm flex items-end" onClick={uploading ? undefined : close}>
            <div
              className="w-full bg-surface-raised rounded-t-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300 border-t border-line"
              onClick={(e) => e.stopPropagation()}
              data-testid="capture-sheet"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-section font-semibold text-ink flex items-center gap-2">
                  <Camera size={20} className="text-accent" />
                  {s.scanWithCamera}
                </h3>
                <button
                  onClick={close}
                  disabled={uploading}
                  aria-label="Close"
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink rounded-pill transition-colors disabled:opacity-40"
                >
                  <X size={20} />
                </button>
              </div>

              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="w-full max-h-[50vh] object-contain rounded-card bg-surface-muted mb-5"
                />
              ) : (
                <div className="flex items-center gap-4 p-5 rounded-card bg-surface-alt border border-line mb-5">
                  <div className="w-12 h-12 flex-shrink-0 rounded-btn bg-surface-raised border border-line flex items-center justify-center">
                    <FileText size={22} className="text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p dir="auto" className="text-sm font-semibold text-ink truncate">{file.name}</p>
                    <p className="text-label font-semibold text-ink-muted mt-0.5">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRetake}
                  disabled={uploading}
                  className="flex-1 min-h-[48px] rounded-btn border-2 border-line text-ink-secondary font-semibold text-section transition-colors hover:border-line-strong disabled:opacity-40"
                >
                  {s.retake}
                </button>
                <button
                  onClick={handleExtract}
                  disabled={uploading}
                  className="flex-1 min-h-[48px] rounded-btn bg-accent hover:bg-accent-hover text-white font-semibold text-section shadow-card transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
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

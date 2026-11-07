import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* The region is FIXED to the top of the viewport, clear of the status
          bar, above every sheet and modal. Until 2026-11-07 it carried the
          classes "toast-container" / "toast", which no stylesheet defines: it
          rendered in normal flow after the page, below the fold, and nobody
          saw a toast (measured: top 896 px in an 844 px viewport). The
          classes stay as hooks for tests; the look is the utilities. */}
      <div
        className="toast-container pointer-events-none fixed inset-x-0 top-0 z-toast flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
        role="status"
        aria-live="polite"
        data-toast-region
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type} pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card bg-surface-raised p-3 text-ink shadow-raised ring-1 ring-line`}
            data-toast={toast.type}
          >
            <div className={`toast-icon mt-0.5 flex-none ${toast.type === 'success' ? 'text-success-text' : toast.type === 'error' ? 'text-danger-text' : 'text-accent-text'}`} aria-hidden="true">
              {toast.type === 'success' && <CheckCircle size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>
            <div dir="auto" className="toast-message min-w-0 flex-1 text-sm font-medium leading-relaxed">{toast.message}</div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="toast-close -m-2 flex min-h-[44px] min-w-[44px] flex-none items-center justify-center text-ink-muted"
              aria-label="Close"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/** The toast API, or undefined where no provider is mounted (tests, bare screens). */
export const useOptionalToast = () => useContext(ToastContext);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

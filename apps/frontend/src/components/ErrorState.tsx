import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ 
  title = 'Something went wrong', 
  message,
  onRetry 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-red-50 rounded-2xl border border-red-100">
      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle size={24} />
      </div>
      <h3 className="text-lg font-bold text-red-900 mb-1">{title}</h3>
      <p className="text-sm text-red-700 max-w-md mx-auto mb-6">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="flex items-center gap-2 bg-white text-red-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-red-50 transition-colors border border-red-200"
        >
          <RefreshCcw size={16} />
          Try Again
        </button>
      )}
    </div>
  );
};

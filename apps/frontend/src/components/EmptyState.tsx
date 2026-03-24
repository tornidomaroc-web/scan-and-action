import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  message, 
  description, 
  icon,
  children 
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon || <Inbox size={32} />}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">{message}</h3>
      {description && <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6">{description}</p>}
      {children}
    </div>
  );
};

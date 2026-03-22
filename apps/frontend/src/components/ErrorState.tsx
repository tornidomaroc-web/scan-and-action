import React from 'react';

export const ErrorState = ({ title, message }: { title?: string, message: string }) => (
  <div className="error-state card warning">
    <h3>❌ {title || 'Error'}</h3>
    <p>{message}</p>
  </div>
);

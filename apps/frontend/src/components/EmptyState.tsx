import React from 'react';

export const EmptyState = ({ message }: { message: string }) => (
  <div className="empty-state card">
    <p>{message}</p>
  </div>
);

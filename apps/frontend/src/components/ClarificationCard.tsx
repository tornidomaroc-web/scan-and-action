import React from 'react';

export const ClarificationCard = ({ message }: { message: string }) => (
  <div className="card clarification-card warning">
    <h3>⚠️ Clarification Needed</h3>
    <p>{message}</p>
  </div>
);

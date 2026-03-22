import React from 'react';

export const AnswerCard = ({ text, meta }: { text: string, meta?: any }) => (
  <div className="card answer-card">
    <div className="card-header">
       <h3>Answer</h3>
       {meta && <span className="meta-badge">{meta.executionTimeMs}ms • {meta.resultCount} results</span>}
    </div>
    <p className="answer-text">{text}</p>
  </div>
);

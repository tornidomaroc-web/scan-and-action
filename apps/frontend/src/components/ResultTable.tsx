import React from 'react';
import { EmptyState } from './EmptyState';

export const ResultTable = ({ data, emptyStateComponent }: { data: any[], emptyStateComponent?: React.ReactNode }) => {
  if (!data || data.length === 0) return (emptyStateComponent || <EmptyState message="No data available." />) as any;
  
  const headers = Object.keys(data[0]);

  return (
    <div className="table-container card">
      <table className="result-table">
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {headers.map(h => <td key={h}>{String(row[h])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

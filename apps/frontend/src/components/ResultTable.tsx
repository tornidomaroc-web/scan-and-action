import React from 'react';
import { EmptyState } from './EmptyState';

type ResultTableProps = {
  data: any[];
  emptyStateComponent?: React.ReactNode;
  onRowClick?: (row: any) => void;
};

export const ResultTable = ({
  data,
  emptyStateComponent,
  onRowClick,
}: ResultTableProps) => {
  if (!data || data.length === 0) {
    return (emptyStateComponent || <EmptyState message="No data available." />) as any;
  }

  const headers = Object.keys(data[0]);
  const isClickable = typeof onRowClick === 'function';

  return (
    <div className="table-container card">
      <table className="result-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={isClickable ? () => onRowClick(row) : undefined}
              style={isClickable ? { cursor: 'pointer' } : undefined}
            >
              {headers.map((h) => (
                <td key={h}>{String(row[h] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
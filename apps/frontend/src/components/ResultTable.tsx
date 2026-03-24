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

  const headers = Object.keys(data[0]).filter(h => h !== 'id');
  const isClickable = typeof onRowClick === 'function';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
            {headers.map((h) => (
              <th key={h} className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                {h.replace(/([A-Z])/g, ' $1').trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={isClickable ? () => onRowClick(row) : undefined}
              className={`group transition-all duration-200 ${isClickable ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40' : ''}`}
            >
              {headers.map((h) => (
                <td key={h} className="px-6 py-5 text-sm text-slate-600 dark:text-slate-300 font-bold group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                  {String(row[h] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
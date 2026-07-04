import React from 'react';
import { ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useStrings } from '../i18n/useStrings';

type ResultTableProps = {
  data: any[];
  emptyStateComponent?: React.ReactNode;
  onRowClick?: (row: any) => void;
};

// Data table restyled onto the --sa-* tokens. Alignment is by logical start
// (text-start, not a physical side) and padding is symmetric, so Arabic mirrors
// correctly. Clickable rows get a mirrored chevron affordance and navigate
// read-only to the document (no mutation happens here).
export const ResultTable = ({ data, emptyStateComponent, onRowClick }: ResultTableProps) => {
  const s = useStrings();
  if (!data || data.length === 0) {
    return (emptyStateComponent || <EmptyState message={s.noData} />) as any;
  }

  const headers = Object.keys(data[0]).filter((h) => h !== 'id');
  const isClickable = typeof onRowClick === 'function';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <thead>
          <tr className="border-b border-divider bg-surface-alt">
            {headers.map((h) => (
              <th
                key={h}
                className="px-5 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary"
              >
                {h.replace(/([A-Z])/g, ' $1').trim()}
              </th>
            ))}
            {isClickable && <th className="w-10 px-5 py-3.5" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={isClickable ? () => onRowClick!(row) : undefined}
              className={`group border-b border-divider transition-colors last:border-b-0 ${
                isClickable ? 'cursor-pointer hover:bg-surface-alt' : ''
              }`}
            >
              {headers.map((h) => (
                <td
                  key={h}
                  className="px-5 py-3.5 text-start text-sm text-ink-secondary transition-colors group-hover:text-ink"
                >
                  {String(row[h] ?? '-')}
                </td>
              ))}
              {isClickable && (
                <td className="px-5 py-3.5 text-end text-ink-fainter">
                  <ChevronRight size={16} className="inline rtl:-scale-x-100" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCellValue } from '../lib/formatCellValue';

type ResultTableProps = {
  data: any[];
  emptyStateComponent?: React.ReactNode;
  onRowClick?: (row: any) => void;
};

const columnLabel = (h: string) => h.replace(/([A-Z])/g, ' $1').trim();

// Responsive results table restyled onto the --sa-* tokens.
//  - Desktop (>= md): a horizontal table (unchanged layout).
//  - Mobile (< md): each row becomes a stacked CARD of label-above-value pairs,
//    so nothing overflows or wraps one character per line on a narrow screen.
// Every cell value is run through formatCellValue, which turns objects/arrays
// (e.g. `facts`, `documentEntities`) into readable text instead of the raw
// "[object Object]", and empty values into a muted "not available" placeholder.
// Alignment is by logical `start` and each value carries dir="auto", so Arabic
// mirrors correctly while numerals/dates stay LTR. Rows stay clickable (read-only
// navigation to the document) in both layouts.
export const ResultTable = ({ data, emptyStateComponent, onRowClick }: ResultTableProps) => {
  const s = useStrings();
  const { language } = useLanguage();

  if (!data || data.length === 0) {
    return (emptyStateComponent || <EmptyState message={s.noData} />) as any;
  }

  const headers = Object.keys(data[0]).filter((h) => h !== 'id');
  const isClickable = typeof onRowClick === 'function';

  // Shared muted placeholder for a genuinely empty value (no em/en dash).
  const placeholder = (
    <span className="text-ink-fainter" aria-label={s.notAvailable} title={s.notAvailable}>
      -
    </span>
  );
  const renderValue = (row: any, h: string) => {
    const formatted = formatCellValue(row[h], h, language);
    return formatted == null ? (
      placeholder
    ) : (
      <span dir="auto">{formatted}</span>
    );
  };

  return (
    <>
      {/* ── Desktop: horizontal table (>= md) ─────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-divider bg-surface-alt">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-5 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary"
                >
                  {columnLabel(h)}
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
                    className="px-5 py-3.5 text-start align-top text-sm text-ink-secondary transition-colors group-hover:text-ink"
                  >
                    {renderValue(row, h)}
                  </td>
                ))}
                {isClickable && (
                  <td className="px-5 py-3.5 text-end align-top text-ink-fainter">
                    <ChevronRight size={16} className="inline rtl:-scale-x-100" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked cards (< md) ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.map((row, i) => (
          <div
            key={row.id ?? i}
            onClick={isClickable ? () => onRowClick!(row) : undefined}
            className={`rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors ${
              isClickable ? 'cursor-pointer active:bg-surface-alt' : ''
            }`}
          >
            <dl className="flex flex-col gap-3">
              {headers.map((h) => (
                <div key={h} className="flex flex-col gap-0.5">
                  <dt className="text-label font-semibold uppercase tracking-wide text-ink-tertiary">
                    {columnLabel(h)}
                  </dt>
                  <dd className="break-words text-sm text-ink-secondary">{renderValue(row, h)}</dd>
                </div>
              ))}
            </dl>
            {isClickable && (
              <div className="mt-3 flex items-center justify-end border-t border-divider pt-3 text-ink-fainter">
                <ChevronRight size={16} className="rtl:-scale-x-100" />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

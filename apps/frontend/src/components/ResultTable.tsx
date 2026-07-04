import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCellValue } from '../lib/formatCellValue';
import { getPrimaryFields } from '../lib/searchResultCard';

type ResultTableProps = {
  data: any[];
  emptyStateComponent?: React.ReactNode;
  onRowClick?: (row: any) => void;
};

const columnLabel = (h: string) => h.replace(/([A-Z])/g, ' $1').trim();

// Responsive results table restyled onto the --sa-* tokens.
//  - Desktop (>= md): a horizontal table showing all columns (unchanged). Every
//    cell runs through formatCellValue, so objects/arrays (`facts`,
//    `documentEntities`) read as text instead of "[object Object]" and empty
//    values show a muted "not available" placeholder.
//  - Mobile (< md): PROGRESSIVE DISCLOSURE. Each row is a slim card showing only
//    the primary fields (name, vendor, amount, translated status) rather than
//    every column; the whole card taps through to the document detail route where
//    the full record already lives. The long file name truncates with an ellipsis
//    (never overflows or wraps one character per line).
// Alignment is by logical `start` (dir="auto" on desktop values, dir="ltr" on the
// mobile amount) so Arabic mirrors correctly while numerals stay LTR. Rows stay
// clickable (read-only navigation to the document) in both layouts.
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

      {/* ── Mobile: slim primary-field cards (< md) ───────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.map((row, i) => {
          const { title, vendor, amount, status } = getPrimaryFields(row, s as any, language);
          const CardTag = isClickable ? 'button' : 'div';
          return (
            <CardTag
              key={row.id ?? i}
              type={isClickable ? 'button' : undefined}
              onClick={isClickable ? () => onRowClick!(row) : undefined}
              className={`flex w-full flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 text-start shadow-card transition-colors ${
                isClickable ? 'cursor-pointer active:bg-surface-alt' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink-faint">
                  <FileText size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{title}</div>
                  {vendor && <div className="mt-0.5 truncate text-xs text-ink-muted">{vendor}</div>}
                </div>
                {amount && (
                  <span className="flex-shrink-0 text-sm font-semibold text-ink" dir="ltr">
                    {amount}
                  </span>
                )}
              </div>

              {(status || isClickable) && (
                <div className="flex items-center justify-between border-t border-divider pt-3">
                  {status ? (
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${status.dot}`} />
                      <span className={`truncate text-xs font-medium ${status.text}`}>{status.label}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {isClickable && (
                    <ChevronRight size={16} className="flex-shrink-0 text-ink-fainter rtl:-scale-x-100" />
                  )}
                </div>
              )}
            </CardTag>
          );
        })}
      </div>
    </>
  );
};

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle, XCircle, FileText, Network } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { ReviewBadge } from '../components/SharedComponents';
import { DecisionBanner } from '../components/DecisionBanner';
import { FixActionPanel } from '../components/FixActionPanel';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getStatus, getDocTypeLabel, getEntityRoleLabel, formatFactValue } from '../lib/searchResultCard';

// Document detail, restyled onto the --sa-* token system (PR-D3).
//  - Calm flat surfaces (rounded-card, quiet shadow) instead of the old
//    oversized mega-card; every color is a token (no raw palette and no
//    per-component theme variants), matching the D2 Search page.
//  - The meta-grid status reuses the SAME shared status config as the Search
//    card (getStatus), so it reads Processed / Needs review / Rejected with the
//    same dot colors and Arabic, instead of the raw enum.
//  - Mixed-direction values (file name, fact values, currency, entity names)
//    are bidi-isolated so numerals and Latin text do not scramble in Arabic RTL.
//  - All copy is i18n (three locales); no hardcoded English remains.
export const DocumentDetailScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const fieldLabel = (key: string): string => {
    const map: Record<string, string> = {
      TRANSACTION_DATE: s.transactionDate,
      TOTAL_AMOUNT: s.totalAmount,
      decision: s.decisionField,
      decision_reason: s.decisionReason,
    };
    return map[key] || key;
  };
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!documentId) return <ErrorState title={s.errorTitle} message={s.docNotFound} />;
  const { showToast } = useToast();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [actioning, setActioning] = useState(false);

  // Same review actions as the queue, surfaced here so a mobile user who
  // tapped through to the detail can resolve the document in place.
  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (actioning) return;
    setActioning(true);
    try {
      await documentService.updateStatus(documentId!, action === 'approve' ? 'COMPLETED' : 'REJECTED');
      showToast(action === 'approve' ? s.toastApproved : s.toastRejected, action === 'approve' ? 'success' : 'info');
      navigate('/queue');
    } catch (error) {
      console.error('[DocumentDetail] Review action failed:', error);
      showToast(s.toastUpdateError, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    documentService
      .getDocumentDetail(documentId!)
      .then(setDoc)
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    handleRefresh();
  }, [documentId]);

  const DocumentDetailSkeleton = () => (
    <div className="mx-auto max-w-[1000px] animate-in fade-in duration-500">
      <div className="skeleton mb-8 h-6 w-32 rounded-btn" />
      <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card md:p-8">
        <div className="mb-8 flex items-start justify-between">
          <div className="space-y-3">
            <div className="skeleton h-9 w-64 rounded-btn" />
            <div className="skeleton h-4 w-40 rounded-btn" />
          </div>
          <div className="skeleton h-8 w-28 rounded-pill" />
        </div>
        <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-card" />)}
        </div>
        <div className="skeleton mb-8 h-[360px] rounded-card" />
        <div className="skeleton h-28 rounded-card" />
      </div>
    </div>
  );

  if (loading) return <DocumentDetailSkeleton />;

  if (errorMsg) return <div className="mx-auto max-w-[1000px] py-12"><ErrorState title={s.errorTitle} message={errorMsg} onRetry={() => window.location.reload()} /></div>;
  if (!doc) return <div className="mx-auto max-w-[1000px] py-12"><ErrorState title={s.errorTitle} message={s.docNotFound} /></div>;

  const isImageFile = typeof doc.signedFileUrl === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.originalFileName || '');
  const isPdfFile = typeof doc.signedFileUrl === 'string' && /\.pdf$/i.test(doc.originalFileName || '');

  const decisionFact = doc.facts?.find((f: any) => f.key === 'decision');
  const reasonFact = doc.facts?.find((f: any) => f.key === 'decision_reason');
  const decision = decisionFact?.valueString || null;
  const reason = reasonFact?.valueString || undefined;

  // Reuse the Search card's status config so the label + dot match the card the
  // user tapped to arrive here (Processed / Needs review / Rejected, translated).
  const status = getStatus(doc, s as any);

  // Localized, honest fact value (shared with Search): preserves a numeric 0,
  // Intl-formats amounts, and renders dates human-readable instead of raw ISO.
  const factValue = (fact: any): string => formatFactValue(fact, s as any, language);

  // The rule-engine decision + decision_reason are NOT extracted facts: they are
  // rule outputs already surfaced by the DecisionBanner above. Filter them out of
  // the Extracted Facts table so an Arabic user never sees a raw "NEEDS_REVIEW"
  // enum or an untranslated English reason duplicated here.
  const visibleFacts: any[] = (doc.facts || []).filter(
    (f: any) => f.key !== 'decision' && f.key !== 'decision_reason'
  );

  return (
    <div className="mx-auto max-w-[1000px] animate-in fade-in slide-in-from-bottom-4 pb-20 duration-500">
      <button
        onClick={() => navigate(-1)}
        className="group mb-8 inline-flex items-center gap-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-btn border border-line bg-surface-raised text-ink-faint shadow-card transition-colors group-hover:border-line-strong">
          <ChevronLeft size={16} className="rtl:-scale-x-100" />
        </span>
        {s.backToSearch}
      </button>

      <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card md:p-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row">
          {/* self-stretch bounds this wrapper to the card width in the mobile
              column layout (items-start would otherwise size it to the file
              name's max-content and let a long unbroken name overflow the card);
              the h1 truncate then produces a clean ellipsis. On desktop the row
              layout already shrinks via min-w-0, and self-stretch only affects
              cross-axis height there, so it does not regress. */}
          <div className="min-w-0 self-stretch">
            <h1 className="mb-2 truncate text-title-lg font-semibold tracking-tight text-ink" dir="auto">
              <bdi>{doc.originalFileName || `${s.errorTitle} ${doc.id}`}</bdi>
            </h1>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-btn bg-accent-tint text-accent">
                <FileText size={15} />
              </span>
              <p className="text-label font-medium text-ink-tertiary">{s.verifiedExtraction}</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <ReviewBadge confidence={doc.overallConfidence} status={doc.status} />
          </div>
        </div>

        <DecisionBanner decision={decision} reason={reason} />

        <FixActionPanel
          documentId={doc.id}
          decision={decision}
          reason={reason}
          onSuccess={handleRefresh}
        />

        <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1.5 block text-label font-medium text-ink-tertiary">{s.status}</span>
            {status ? (
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${status.dot}`} />
                <span className={`truncate text-sm font-medium ${status.text}`}>{status.label}</span>
              </span>
            ) : (
              <span className="text-sm font-medium text-ink-muted">{s.notAvailable}</span>
            )}
          </div>
          {[
            { label: s.type, value: getDocTypeLabel(doc.documentType, s as any) || s.notAvailable },
            { label: s.date, value: doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : s.notAvailable },
            { label: s.docLanguage, value: doc.detectedLanguage?.toUpperCase() || 'EN' },
          ].map((item, i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-4">
              <span className="mb-1.5 block text-label font-medium text-ink-tertiary">{item.label}</span>
              <span className="block truncate text-sm font-medium text-ink" dir="auto"><bdi>{item.value}</bdi></span>
            </div>
          ))}
        </div>

        {doc.signedFileUrl && (
          <div className="mb-10">
            <h3 className="mb-4 text-section font-semibold text-ink">{s.sourceVisualization}</h3>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {isImageFile ? (
                <img
                  src={doc.signedFileUrl}
                  alt={doc.originalFileName || s.sourceVisualization}
                  className="mx-auto h-auto max-h-[800px] w-full object-contain"
                />
              ) : isPdfFile ? (
                <iframe
                  src={doc.signedFileUrl}
                  title={doc.originalFileName || s.sourceVisualization}
                  className="h-[700px] w-full border-none"
                />
              ) : (
                <div className="p-16 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-card bg-surface-muted text-ink-faint">
                    <FileText size={32} />
                  </div>
                  <p className="mb-5 text-sm font-medium text-ink">{s.previewUnavailable}</p>
                  <a
                    href={doc.signedFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    {s.openOriginalSource}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {doc.summary && (
          <div className="mb-10 rounded-card border border-accent-border bg-accent-tint p-5 text-start">
            <h4 className="mb-2 text-label font-semibold text-accent-text">{s.aiSynthesis}</h4>
            <p className="text-sm leading-relaxed text-ink-secondary"><bdi dir="auto">{doc.summary}</bdi></p>
          </div>
        )}

        <div>
          <h3 className="mb-5 flex items-center gap-2.5 text-section font-semibold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-btn bg-success-tint text-success-text">
              <CheckCircle size={16} />
            </span>
            {s.extractedFacts}
          </h3>

          {visibleFacts.length > 0 ? (
            <>
              {/* Mobile: stacked label/value rows (the 3-column table clips at phone widths). */}
              <div className="divide-y divide-divider overflow-hidden rounded-card border border-line bg-surface-raised md:hidden">
                {visibleFacts.map((fact: any, i: number) => (
                  <div key={i} className="p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="text-label font-medium text-ink-tertiary">{fieldLabel(fact.key)}</span>
                      <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 text-label font-medium ${
                        fact.confidence > 0.9 ? 'text-success-text' : 'text-warning-text'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-pill ${fact.confidence > 0.9 ? 'bg-success' : 'bg-warning'}`} />
                        <span dir="ltr">{Math.round(fact.confidence * 100)}%</span> {s.match}
                      </span>
                    </div>
                    <p className="break-words text-sm font-medium text-ink" dir="auto"><bdi>{factValue(fact)}</bdi></p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-card border border-line bg-surface-raised md:block">
                <table className="w-full border-collapse text-start">
                  <thead>
                    <tr className="border-b border-divider bg-surface-alt">
                      <th className="px-6 py-3.5 text-start text-label font-semibold text-ink-tertiary">{s.factLabel}</th>
                      <th className="px-6 py-3.5 text-start text-label font-semibold text-ink-tertiary">{s.dataValue}</th>
                      <th className="px-6 py-3.5 text-start text-label font-semibold text-ink-tertiary">{s.precision}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {visibleFacts.map((fact: any, i: number) => (
                      <tr key={i} className="transition-colors hover:bg-surface-alt">
                        <td className="px-6 py-3.5 text-sm font-medium text-ink">{fieldLabel(fact.key)}</td>
                        <td className="px-6 py-3.5 text-sm text-ink-secondary" dir="auto"><bdi>{factValue(fact)}</bdi></td>
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-label font-medium ${
                            fact.confidence > 0.9 ? 'text-success-text' : 'text-warning-text'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-pill ${fact.confidence > 0.9 ? 'bg-success' : 'bg-warning'}`} />
                            <span dir="ltr">{Math.round(fact.confidence * 100)}%</span> {s.match}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center text-sm font-medium text-ink-muted">
              {s.noFacts}
            </div>
          )}
        </div>

        <div className="mt-12 border-t border-divider pt-8">
          <h3 className="mb-4 flex items-center gap-2 text-section font-semibold text-ink">
            <Network size={16} className="text-ink-faint" />
            {s.graphRelationships}
          </h3>
          {doc.entities && doc.entities.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {doc.entities.map((ent: any, i: number) => (
                <div key={i} className="inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-start transition-colors hover:border-line-strong">
                  <span className="flex-shrink-0 text-label font-medium text-ink-muted">{getEntityRoleLabel(ent.role, s as any)}</span>
                  {/* Cap + truncate so a long vendor name ellipsizes instead of
                      pushing the layout. dir="auto" sits on the TRUNCATING span
                      (matching the h1/meta pattern) so the ellipsis lands at each
                      name's natural trailing edge under RTL, not the leading side. */}
                  <span className="min-w-0 max-w-[12rem] truncate text-sm font-medium text-ink" dir="auto"><bdi>{ent.name}</bdi></span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-ink-muted">{s.noEntities}</p>
          )}
        </div>
      </div>

      {/* Sticky review actions: bottom-20 clears the mobile tab bar; md:bottom-6
          sits above the viewport edge on desktop. */}
      {doc.status === 'NEEDS_REVIEW' && (
        <div className="sticky bottom-20 z-40 mt-6 md:bottom-6">
          <div className="flex gap-3 rounded-card border border-line bg-surface-raised/95 p-3 shadow-lg backdrop-blur">
            <button
              onClick={() => handleReviewAction('approve')}
              disabled={actioning}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-success text-sm font-semibold text-white transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <CheckCircle size={18} />
              {s.approve}
            </button>
            <button
              onClick={() => handleReviewAction('reject')}
              disabled={actioning}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-danger text-sm font-semibold text-white transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <XCircle size={18} />
              {s.reject}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

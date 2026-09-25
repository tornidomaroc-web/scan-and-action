import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, CheckCircle, XCircle, FileText, RefreshCw, ArrowUpRight } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { DocumentIcon } from '../components/ui/DocumentIcon';
import { IconTile } from '../components/ui/IconTile';
import { CountChip } from '../components/ui/CountChip';
import { panelClass } from '../components/ui/Panel';
import { translateDecisionReasons } from '../components/DecisionBanner';
import { FixActionPanel } from '../components/FixActionPanel';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getStatus, getDocTypeLabel, getVendor, formatFactValue, factValueDir } from '../lib/searchResultCard';
import { isIdentityConflict } from '../lib/identityConflict';
import { isRequestTimeout } from '../lib/fetchWithTimeout';
import { visibleDetailFacts, detailFactLabel } from '../lib/detailFacts';
import { getDocumentCategory } from '../lib/documentCategory';
import { documentCurrency, ledgerAmount } from '../lib/ledgerAmount';
import { Lang, figureSizeClass, fullDayLabel, moneyParts } from '../lib/ledgerView';
import {
  isSourceFileUnavailable,
  isReextractionInProgress,
  isDocumentHasContent,
  isDocumentHasUserEdits,
  isDocumentNotSingle,
} from '../lib/reextractErrors';

// ============================================================================
// The receipt: the screen every scan lands on. Design step 3's result screen,
// redrawn from zero on 2026-09-25 after the owner rejected the previous one
// on his iPhone ("complicated and disorganised, not modern, looks as if it
// belongs to another app").
//
// Top to bottom, on the ledger home's visual language:
//   1. Who, how much, when, one status. The category tile, the merchant, the
//      amount the LEDGER counts (lib/ledgerAmount.ts: a correction beats the
//      extraction, in the extraction's currency, marked "Edited"), the date
//      printed on the receipt (TRANSACTION_DATE; the upload day only when no
//      date was read, said so), and the lifecycle status once.
//   2. What needs the person, as plain sentences, with the fix actions and
//      the retry inside the same card. Nothing when nothing does.
//   3. The receipt, a card that opens the original on tap.
//   4. The facts, as rows: only what lib/detailFacts.ts allows, and the file.
//   5. Approve / Reject, sticky, while the document waits for review.
//
// Gone, on the owner's ruling: the file name as the title, "Verified AI
// intelligence extraction", the 83% badge, the per-fact "99% match" labels,
// the relationships section, and the status repeated three times.
//
// Behaviour is untouched: the review actions, the re-extraction gate (the
// server's own `reextractable`), the fix-action writes, the facts allowlist,
// the lockout handling and the image fallback are the same code paths as
// before; tests pin each. No amount is added or converted here: the figure is
// one document's own, read by the ledger's rule.
// ============================================================================
export const DocumentDetailScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const lang = language as Lang;
  // The label for a facts row. Backed by the ALLOWLIST in lib/detailFacts,
  // which is also what decides whether the row renders at all, so the two can
  // never disagree. It has no raw-key fallback on purpose: the `map[key] ||
  // key` that used to live here is what rendered `extraction_model` and
  // `extraction_recovered` to a user in an Arabic UI.
  const fieldLabel = (key: string): string => detailFactLabel(key, s as any) ?? '';
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!documentId) return <ErrorState title={s.errorTitle} message={s.docNotFound} />;
  const { showToast } = useToast();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [actioning, setActioning] = useState(false);
  // IDENTITY_EMAIL_CONFLICT is a property of the SESSION, not of this endpoint:
  // authMiddleware raises it before any route handler runs. It is terminal —
  // clearing it is an operator action against an orphaned row — so the screen
  // must stop offering a retry that cannot succeed (lib/identityConflict.ts:15-18).
  const [locked, setLocked] = useState(false);
  // The receipt image is a second request, to Supabase storage, after the
  // document itself. Until it arrives the frame holds its space; if it fails
  // (an expired signed URL, a dropped connection) the frame says so and
  // offers the original, instead of an empty box where a picture should be.
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'failed'>('loading');

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
      // On a lockout the toast is SUPPRESSED and the screen switches instead.
      // This is the ACTION path (updateStatus, from an approve/reject tap) and
      // is a separate surface from the load path below — which is why the
      // ruling made for the queue's action toast applies here unchanged: a
      // toast vanishes, the condition is permanent, and a disappearing message
      // invites the next tap. Setting errorMsg replaces the whole document body
      // via the early return at the render site, so this is a switch and not a
      // silent disappearance. Every OTHER action failure keeps its toast.
      if (isIdentityConflict(error)) {
        setLocked(true);
        setErrorMsg(s.accountLockedBody);
      } else {
        showToast(s.toastUpdateError, 'error');
      }
    } finally {
      setActioning(false);
    }
  };

  // Re-extraction. The render gate is the SERVER's own answer (`doc.reextractable`,
  // computed by documentController.reextractionRefusal), so the button appears
  // on exactly the rows the endpoint would accept and on no others.
  //
  // It charges no scan. A FAILED row was never charged — every writer of FAILED
  // is reached only after the charge transaction rolled back — and an empty
  // NEEDS_REVIEW row keeps whatever scanChargedAt it already had, because
  // persistence.ts leaves the column untouched in both directions when
  // chargeScan is false. Free retry, never a refund.
  const handleReextract = async () => {
    if (actioning) return;
    setActioning(true);
    try {
      await documentService.reextract(documentId!);
      showToast(s.reextractStarted, 'info');
      handleRefresh();
    } catch (error) {
      console.error('[DocumentDetail] Re-extraction failed:', error);
      // By EXACT code, never by status (lib/reextractErrors.ts). The two 409s
      // ask for opposite things, so they must not share a toast: one sends the
      // user to a re-upload, the other tells them to wait. Anything else —
      // a 429 from the limiter, a bare proxy 409, a dropped socket — keeps the
      // ordinary generic failure copy.
      if (isSourceFileUnavailable(error)) {
        showToast(s.reextractSourceUnavailable, 'error');
      } else if (isReextractionInProgress(error)) {
        showToast(s.reextractInProgress, 'info');
      } else if (isDocumentHasUserEdits(error)) {
        // Checked BEFORE hasContent: a row can be refused for either, and this
        // is the one the user needs to hear — the refusal is protecting their
        // own corrections, not reporting a fault.
        showToast(s.reextractHasUserEdits, 'info');
      } else if (isDocumentHasContent(error)) {
        showToast(s.reextractHasContent, 'info');
      } else if (isDocumentNotSingle(error)) {
        showToast(s.reextractNotSingle, 'error');
      } else if (isIdentityConflict(error)) {
        setLocked(true);
        setErrorMsg(s.accountLockedBody);
      } else {
        showToast(s.toastUpdateError, 'error');
      }
    } finally {
      setActioning(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    // Both are cleared together, and they MUST be: `locked` and `errorMsg` are
    // one fact split across two variables. Clearing only `locked` on a
    // documentId change would leave accountLockedBody in `errorMsg` and route it
    // to the NON-locked branch below — rendering the lockout copy above a live
    // retry, the exact harm this work exists to remove. (Clearing errorMsg also
    // fixes a pre-existing staleness: navigating from a failed document to a
    // healthy one kept the old ErrorState. That was unreachable before only
    // because the sole retry re-booted the app.)
    setErrorMsg('');
    setLocked(false);
    documentService
      .getDocumentDetail(documentId!)
      .then(setDoc)
      // `err.message` used to render VERBATIM as the full-screen ErrorState body.
      // It is always English and never a machine code: documentService.ts:12
      // throws `errorData.error || 'Failed to load document'`, and the backend
      // puts PROSE in `data.error` ('Document not found', 'Unauthorized: Invalid
      // or expired token', 'Internal Server Error', ...). A dropped connection
      // adds the browser's own TypeError('Failed to fetch'). Every one of those
      // reached an Arabic or French user in English.
      //
      // s.somethingWrong is ErrorState's OWN default for an unspecified failure
      // (components/ErrorState.tsx:21), so it is the one existing string that is
      // true for all of those shapes at once. Deliberately NOT s.docNotFound:
      // that claims the document does not exist, which is false for a 401, a 500
      // or an offline phone, and :101 already uses it for the real not-found
      // case. The retry affordance below is unchanged.
      // The catch bound NOTHING before this change: there was no `err` in scope
      // to classify, so the signature has to change before any classification is
      // possible here. By EXACT code, never by status (lib/identityConflict.ts:20-22).
      .catch((err: unknown) => {
        const lockedNow = isIdentityConflict(err);
        setLocked(lockedNow);
        if (!lockedNow && isRequestTimeout(err)) {
          setErrorMsg(s.requestTimedOut);
          return;
        }
        setErrorMsg(lockedNow ? s.accountLockedBody : s.somethingWrong);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    handleRefresh();
  }, [documentId]);

  // Each read signs a fresh URL, so a new URL is a new image to load. Without
  // this, the state of the LAST image survives a move to another document:
  // a failure on one receipt would hide the next one's picture behind
  // "preview unavailable", and a loaded state would skip its skeleton.
  useEffect(() => {
    setImageState('loading');
  }, [doc?.signedFileUrl]);

  const DocumentDetailSkeleton = () => (
    // The same shapes as the loaded screen, in the same surfaces.
    <div className="mx-auto w-full max-w-xl animate-pulse" aria-busy="true">
      <div className="h-11 w-11 rounded-pill bg-line" />
      <div className={`mt-4 p-4 ${panelClass}`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-tile bg-line" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 rounded-pill bg-line" />
            <div className="h-3 w-28 rounded-pill bg-line" />
          </div>
        </div>
        <div className="mt-5 h-9 w-44 rounded-btn bg-line" />
      </div>
      <div className={`mt-4 h-[280px] ${panelClass}`} />
      <div className={`mt-4 h-[132px] ${panelClass}`} />
    </div>
  );

  if (loading) return <DocumentDetailSkeleton />;

  if (errorMsg)
    return (
      <div className="mx-auto w-full max-w-xl py-12">
        {locked ? (
          // onRetry omitted, so ErrorState renders NO button at all
          // (components/ErrorState.tsx:24). That matters more here than on any
          // other screen: this retry is window.location.reload(), which re-boots
          // the app, re-runs provisioning and lands straight back in the same
          // lockout. Removing the button breaks a LOOP, not a wasted request.
          <ErrorState title={s.accountLockedTitle} message={errorMsg} />
        ) : (
          // Unchanged, reload included. The reload is a poor retry for ordinary
          // errors too — handleRefresh would re-fetch without re-booting — but
          // that is a separate defect with a different blast radius and is
          // deliberately NOT bundled into this one.
          <ErrorState title={s.errorTitle} message={errorMsg} onRetry={() => window.location.reload()} />
        )}
      </div>
    );
  if (!doc) return <div className="mx-auto w-full max-w-xl py-12"><ErrorState title={s.errorTitle} message={s.docNotFound} /></div>;

  const isImageFile = typeof doc.signedFileUrl === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.originalFileName || '');

  const decisionFact = doc.facts?.find((f: any) => f.key === 'decision');
  const reasonFact = doc.facts?.find((f: any) => f.key === 'decision_reason');
  const decision = decisionFact?.valueString || null;
  const reason: string | undefined = reasonFact?.valueString || undefined;

  // The ONE status on the screen, in the same vocabulary as every list
  // (Processed / Needs review / Rejected, translated).
  const status = getStatus(doc, s as any);
  const statusTone = status?.key === 'NEEDS_REVIEW' ? 'warning'
    : status?.key === 'REJECTED' || status?.key === 'FAILED' ? 'danger'
    : status?.key === 'COMPLETED' ? 'success' : 'neutral';

  // Localized, honest fact value (shared with Search): preserves a numeric 0,
  // Intl-formats amounts, and renders dates human-readable instead of raw ISO.
  const factValue = (fact: any): string => formatFactValue(fact, s as any, language);

  // WHICH facts the rows may show is an ALLOWLIST that fails closed — see
  // lib/detailFacts for the production census behind it and the reason each key
  // is in or out. A fact key nobody has thought about yet renders nowhere.
  const visibleFacts: any[] = visibleDetailFacts(doc.facts, s as any);

  const category = getDocumentCategory(doc);
  const merchant = getVendor(doc);
  const typeLabel = getDocTypeLabel(doc.documentType, s as any);
  const amount = ledgerAmount(doc.facts);
  const money = amount ? moneyParts(amount.amount, amount.currency, lang) : null;

  // The date on the receipt, as the ledger dates it. The upload day only when
  // no date was read, and then the line says so (the same copy as Home).
  const printed = doc.facts?.find((f: any) => f.key === 'TRANSACTION_DATE' && f.valueDate)?.valueDate ?? null;
  const dateText = printed
    ? fullDayLabel(printed, lang)
    : doc.uploadedAt ? s.ledgerNoDate.replace('{day}', fullDayLabel(doc.uploadedAt, lang, 'local')) : null;
  const metaLine = [category ? (s as any)[`cat${category}`] : null, typeLabel, dateText].filter(Boolean);

  // What needs the person, as sentences. Each rule-engine reason is one
  // sentence in the reader's language (the raw English enum never renders).
  const reasons = reason ? reason.split(', ').map((part) => translateDecisionReasons(part.trim(), s as any, language)) : [];
  const issues: string[] = [];
  if (doc.status === 'FAILED') issues.push(s.detailExtractionFailed);
  if (decision === 'FLAGGED') issues.push(s.decisionFlaggedDesc, ...reasons);
  else if (decision === 'NEEDS_REVIEW') issues.push(...(reasons.length ? reasons : [s.expenseAttention]));
  else if (decision === 'APPROVED' && doc.status === 'NEEDS_REVIEW') issues.push(s.decisionApprovedNeedsReviewDesc);
  else if (!decision && doc.status === 'NEEDS_REVIEW') issues.push(s.expenseAttention);
  // THE RETRY GATE IS `doc.reextractable`, WHICH THE SERVER COMPUTES. The
  // FAILED branch deliberately does not consult it: the server admits FAILED
  // unconditionally, and a response served before the flag existed carries no
  // such field, so reading it there would make the button vanish from a path
  // that already worked.
  const canRetry = doc.status === 'FAILED' || (doc.status === 'NEEDS_REVIEW' && doc.reextractable === true);
  const showFix = !!decision && decision !== 'APPROVED';
  const showIssues = issues.length > 0 || showFix || canRetry;

  return (
    <div className="mx-auto w-full max-w-xl pb-28" data-detail-screen>
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={s.backToSearch}
        className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface-raised text-ink-secondary ring-1 ring-line transition-colors hover:text-ink active:scale-95"
      >
        <ChevronLeft size={20} className="rtl:-scale-x-100" aria-hidden="true" />
      </button>

      {/* ── Who, how much, when, one status ── */}
      <section className={`mt-4 p-4 ${panelClass}`} data-detail-header aria-labelledby="detail-title">
        <div className="flex items-start gap-3">
          <DocumentIcon doc={doc} />
          <div className="min-w-0 flex-1">
            {/* A merchant name is natural language of unknown direction, kept
                whole: it wraps, it is never cut. dir="auto" on the element
                itself, with no isolate child to swallow it. */}
            <h1 id="detail-title" dir="auto" className="break-words text-title-lg font-semibold tracking-tight text-ink">
              {merchant ?? <span className="text-ink-muted">{s.ledgerUnknownVendor}</span>}
            </h1>
            {metaLine.length > 0 && (
              <p className="mt-0.5 text-xs font-medium text-ink-muted" data-detail-meta>
                {metaLine.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          {money && amount ? (
            <div className="flex flex-wrap items-baseline gap-x-2" aria-label={`${money.number} ${money.name ?? money.code ?? s.ledgerNoCurrency}`}>
              <bdi dir="ltr" data-detail-amount className={`${figureSizeClass(money.number)} font-extrabold leading-none tracking-tight tabular-nums text-ink`}>
                {money.number}
              </bdi>
              <span className={`text-base font-bold tracking-wide ${amount.currency ? 'text-ink-muted' : 'text-warning-text'}`}>
                {money.code ?? s.ledgerNoCurrency}
              </span>
              {amount.source === 'corrected' && <CountChip data-detail-edited>{s.ledgerCorrectedTag}</CountChip>}
            </div>
          ) : (
            <p className="text-lg font-semibold text-ink-muted" data-detail-amount-missing>{s.detailNoAmount}</p>
          )}
          {status && (
            <CountChip tone={statusTone} data-detail-status className="max-w-full">
              <span className="truncate">{status.label}</span>
            </CountChip>
          )}
        </div>
        {/* RE-PROCESSED NOTICE. A document recovered by the re-extraction
            endpoint gains its amounts, and they enter the totals the moment
            they land; a money figure that moves unexplained reads as a bug.
            This is the explanation. */}
        {doc.reprocessed && (
          <p className="mt-3 text-xs font-medium leading-relaxed text-ink-secondary" data-detail-reprocessed>
            <CountChip className="me-1.5 align-middle">{s.reprocessedBadge}</CountChip>
            <bdi dir="auto">{s.reprocessedNotice.replace('{date}', fullDayLabel(doc.processedAt, lang, 'local') || s.recently)}</bdi>
          </p>
        )}
      </section>

      {/* ── What needs the person ── */}
      {showIssues && (
        <section className={`mt-4 p-4 ${panelClass}`} data-detail-issues aria-labelledby="detail-issues">
          <h2 id="detail-issues" className="flex items-center gap-3 text-[15px] font-bold text-ink">
            <IconTile icon={AlertTriangle} tone="warning" size="sm" />
            {s.detailNeedsYou}
          </h2>
          {issues.length > 0 && (
            <ul className="mt-3 space-y-2">
              {issues.map((sentence, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-secondary">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-pill bg-warning" />
                  <bdi dir="auto">{sentence}</bdi>
                </li>
              ))}
            </ul>
          )}
          <FixActionPanel
            documentId={doc.id}
            decision={decision}
            reason={reason}
            currency={documentCurrency(doc.facts)}
            onSuccess={handleRefresh}
          />
          {canRetry && (
            <button
              type="button"
              onClick={handleReextract}
              disabled={actioning}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill bg-surface-muted text-sm font-semibold text-ink transition-colors hover:bg-surface-alt active:scale-[0.99] disabled:opacity-50"
            >
              <RefreshCw size={18} aria-hidden="true" />
              {s.retryExtraction}
            </button>
          )}
        </section>
      )}

      {/* ── The receipt ── */}
      {doc.signedFileUrl && (
        <section className={`mt-4 overflow-hidden ${panelClass}`} data-detail-receipt>
          {isImageFile && imageState !== 'failed' ? (
            <a href={doc.signedFileUrl} target="_blank" rel="noreferrer" className="block" aria-label={s.openOriginalSource}>
              <div className={imageState === 'loading' ? 'skeleton min-h-[240px]' : ''} data-detail-image={imageState}>
                <img
                  src={doc.signedFileUrl}
                  alt={doc.originalFileName || s.sourceVisualization}
                  onLoad={() => setImageState('loaded')}
                  onError={() => setImageState('failed')}
                  className={`mx-auto h-auto max-h-[70vh] w-full object-contain ${imageState === 'loading' ? 'opacity-0' : ''}`}
                />
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <IconTile icon={FileText} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink" dir="auto">{doc.originalFileName}</span>
                <span className="mt-0.5 block text-xs font-medium text-ink-muted">{s.previewUnavailable}</span>
              </span>
              <a
                href={doc.signedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[40px] flex-none items-center gap-1 rounded-pill bg-surface-muted px-3.5 text-xs font-semibold text-ink"
              >
                {s.openOriginalSource}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          )}
        </section>
      )}

      {/* ── The facts, as rows ── */}
      <section className={`mt-4 ${panelClass}`} data-detail-facts>
        <ul className="divide-y divide-divider">
          {visibleFacts.map((fact: any, i: number) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="flex-none text-xs font-medium text-ink-muted">{fieldLabel(fact.key)}</span>
              {/* Direction is DATA, not a property of this box: the same
                  element renders an Arabic string value, a localized Arabic
                  date, a placeholder, and an Intl currency string. Only the
                  numeric branch is pinned ltr (searchResultCard.factValueDir,
                  whose precedence mirrors formatFactValue's). No <bdi>: it is
                  an isolate with dir auto and would re-run the detection the
                  pin exists to override. */}
              <span className="min-w-0 break-words text-end text-sm font-semibold text-ink" dir={factValueDir(fact)}>{factValue(fact)}</span>
            </li>
          ))}
          {visibleFacts.length === 0 && (
            <li className="px-4 py-3 text-sm font-medium text-ink-muted">{s.noFacts}</li>
          )}
          {doc.originalFileName && (
            <li className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="flex-none text-xs font-medium text-ink-muted">{s.nameLabel}</span>
              <span className="min-w-0 break-all text-end text-sm font-medium text-ink-secondary" dir="auto">{doc.originalFileName}</span>
            </li>
          )}
        </ul>
      </section>

      {/* Sticky review actions: bottom-20 clears the mobile tab bar; md:bottom-6
          sits above the viewport edge on desktop. */}
      {doc.status === 'NEEDS_REVIEW' && (
        <div className="sticky bottom-20 z-40 mt-6 md:bottom-6">
          <div className={`flex gap-3 p-3 shadow-lg ${panelClass}`}>
            <button
              onClick={() => handleReviewAction('approve')}
              disabled={actioning}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-pill bg-success text-sm font-bold text-surface-raised transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <CheckCircle size={18} aria-hidden="true" />
              {s.approve}
            </button>
            <button
              onClick={() => handleReviewAction('reject')}
              disabled={actioning}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-pill bg-danger text-sm font-bold text-surface-raised transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <XCircle size={18} aria-hidden="true" />
              {s.reject}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

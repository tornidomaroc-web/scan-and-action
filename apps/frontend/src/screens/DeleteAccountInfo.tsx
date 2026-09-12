import React from 'react';
import { Link } from 'react-router-dom';
import { LandingHeader } from '../components/LandingHeader';
import { Trash2 } from 'lucide-react';

/**
 * Public, logged-out-reachable account & data deletion page.
 * Required by the Google Play data-deletion policy: there must be a web URL,
 * usable without the app, that explains how a user (including one who has
 * uninstalled) can request deletion of their account and data.
 *
 * Mirrors the other legal screens (TermsOfService / PrivacyPolicy): plain,
 * English, rendered outside the authenticated Layout.
 */
const DeleteAccountInfo: React.FC = () => {
  // A visitor who taps a footer link lands here with no header, no logo and no
  // way back — measured on production 2026-09-12: `document.querySelector('header')`
  // and `a[href="/"]` both returned null on /privacy. `LandingHeader`'s home link
  // is that way back.
  //
  // NOT PINNED, DELIBERATELY, and this is the opposite of the landing route. This
  // page sets no background of its own: `body` paints it from `var(--background)`
  // -> `--sa-surface`, which flips #F5F7FA -> #0F172A, and the page carries its own
  // `dark:` variants. So it is ALREADY correct in dark mode, and the header agrees
  // with it (measured: #1E293B header on #0F172A body = 1.22, no seam).
  // `sa-pin-light` would hold the header at #FFFFFF while `body` stayed #0F172A —
  // a 17.85 seam — and leave `dark:text-slate-200` firing on pinned white surfaces
  // at 1.23:1. The pin is for a light-only page; this is not one.
  //
  // `showAnchors={false}`: `#how-it-works` and `#pricing` are landing-page sections
  // and neither id exists here, so the anchors would scroll nowhere and say nothing.
  return (
    <>
      <LandingHeader showAnchors={false} />
      <div className="max-w-4xl mx-auto px-6 py-20 font-sans text-slate-800 dark:text-slate-200">
        <div className="flex items-center gap-4 mb-10">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl text-red-600">
            <Trash2 size={32} />
          </div>
          <h1 className="text-4xl font-black tracking-tight italic uppercase">Delete Your Account</h1>
        </div>

        <div className="space-y-8 leading-relaxed">
          <section>
            <p>
              You can permanently delete your Scan &amp; Action account and all associated data at any
              time. This page explains how, including if you have already uninstalled the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">From inside the app</h2>
            <p>
              Open Scan &amp; Action, go to <strong>Settings → Danger Zone → Delete account</strong>,
              type your email to confirm, and confirm the deletion. Your account is removed immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">If you uninstalled the app</h2>
            <p>
              Sign in on the web at{' '}
              <Link to="/login" className="text-blue-600 font-bold underline">
                www.scan-action.com
              </Link>{' '}
              and use the same <strong>Settings → Delete account</strong> option. If you cannot sign in,
              email us at <a href="mailto:support@scan-action.com" className="text-blue-600 font-bold underline">support@scan-action.com</a>{' '}
              from your account email address and we will delete your account and data on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">What gets deleted</h2>
            <p>
              Deletion permanently removes your account, your workspace, and all documents, scans,
              extracted data, and reports it contains, both from our database and from file storage.
              This cannot be undone.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">Subscriptions</h2>
            <p>
              Deleting your account does <strong>not</strong> cancel an active subscription. Cancel it
              separately: in-app subscriptions through the App Store or Google Play, and web
              subscriptions through the billing portal. Otherwise you may continue to be charged.
            </p>
          </section>

          <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
            Last updated: June 18, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default DeleteAccountInfo;
export { DeleteAccountInfo };

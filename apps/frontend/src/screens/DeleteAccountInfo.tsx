import React from 'react';
import { Link } from 'react-router-dom';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalLinkClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { Trash2 } from 'lucide-react';
import { usePageHead } from '../lib/pageHead';

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
  usePageHead({ title: 'Delete Your Account | Scan & Action', description: 'How to delete your Scan & Action account and every receipt in it, from the app or by email, with or without the app installed.', path: '/delete-account' });
  // A visitor who taps a footer link lands here with no header, no logo and no
  // way back — measured on production 2026-09-12: `document.querySelector('header')`
  // and `a[href="/"]` both returned null on /privacy. `LandingHeader`'s home link
  // is that way back.
  //
  // NOT PINNED: the page follows the theme through the tokens, like every
  // screen (components/legal/legalPage.ts); `sa-pin-light` no longer exists.
  //
  // `showAnchors={false}`: `#how-it-works` and `#pricing` are landing-page sections
  // and neither id exists here, so the anchors would scroll nowhere and say nothing.
  return (
    <>
      <LandingHeader showAnchors={false} />
      <div className={legalPageClass}>
        <div className={legalTitleRowClass}>
          <div className={legalIconClass}>
            <Trash2 size={32} />
          </div>
          <h1 className={legalTitleClass}>Delete Your Account</h1>
        </div>

        <div className={legalBodyClass}>
          <section>
            <p>
              You can permanently delete your Scan &amp; Action account and all associated data at any
              time. This page explains how, including if you have already uninstalled the app.
            </p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>From inside the app</h2>
            <p>
              Open Scan &amp; Action, go to <strong>Settings → Danger Zone → Delete account</strong>,
              type your email to confirm, and confirm the deletion. Your account is removed immediately.
            </p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>If you uninstalled the app</h2>
            <p>
              Sign in on the web at{' '}
              <Link to="/login" className={legalLinkClass}>
                www.scan-action.com
              </Link>{' '}
              and use the same <strong>Settings → Delete account</strong> option. If you cannot sign in,
              email us at <a href="mailto:support@scan-action.com" className={legalLinkClass}>support@scan-action.com</a>{' '}
              from your account email address and we will delete your account and data on your behalf.
            </p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>What gets deleted</h2>
            <p>
              Deletion permanently removes your account, your workspace, and all documents, scans,
              extracted data, and reports it contains, both from our database and from file storage.
              This cannot be undone.
            </p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>Subscriptions</h2>
            <p>
              Deleting your account does <strong>not</strong> cancel an active subscription. If you
              have one, cancel it first by writing to support@scan-action.com. Otherwise you may
              continue to be charged.
            </p>
          </section>

          <footer className={legalFooterClass}>
            Last updated: October 9, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default DeleteAccountInfo;
export { DeleteAccountInfo };

import React from 'react';
import { Link } from 'react-router-dom';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalLinkClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { LifeBuoy } from 'lucide-react';
import { usePageHead } from '../lib/pageHead';

/**
 * The support text, without a header. Two pages render it:
 * - /support (this file), under the landing header, for the web.
 * - /support/app (SupportPageApp.tsx), under a header with no links, for App
 *   Store Connect's Support URL. There its one page link goes to
 *   /privacy/app, which has no links either, so a reviewer who follows every
 *   link from it never reaches the priced landing; the deletion steps name
 *   Settings and the support address instead of /delete-account, whose
 *   header links to the landing (iosNoPlanWording.test.tsx).
 *
 * Apple's field reference, read 2026-09-29: the Support URL "must lead to
 * actual contact information".
 *
 * The address was probed on 2026-09-29 with no message sent: the domain's MX
 * (Cloudflare Email Routing) answered `250` to RCPT TO support@scan-action.com
 * and `550 5.1.1 Address does not exist` to a made-up address on the same
 * domain, the control.
 *
 * Every answer below describes what the app does today, and nothing here names
 * a price, a plan or a way to pay: this URL is App Store metadata, and Apple
 * 3.1.1 and 2.3.7 apply to it. No dash in the copy (supportPage.test.tsx).
 *
 * Mirrors the four legal screens (plain English, the page's own dark:
 * variants, not pinned); legalPagesHeader.test.tsx covers it with them.
 */
export const SupportContent: React.FC<{ store: boolean }> = ({ store }) => (
  <div className={legalPageClass}>
    <div className={legalTitleRowClass}>
      <div className={legalIconClass}>
        <LifeBuoy size={32} />
      </div>
      <h1 className={legalTitleClass}>Support</h1>
    </div>

    <div className={legalBodyClass} data-support-page>
      <section>
        <h2 className={legalHeadingClass}>Contact us</h2>
        <p>
          Email{' '}
          <a href="mailto:support@scan-action.com" className={legalLinkClass} data-support-email>
            support@scan-action.com
          </a>
          . Write from the address you sign in with, and tell us what you tapped, what you expected and
          what happened instead. A screenshot helps.
        </p>
      </section>

      <section>
        <h2 className={legalHeadingClass}>A receipt shows no amount</h2>
        <p>
          Open the receipt from the Queue. When no amount could be read, the receipt asks you to type it
          in, and the month then counts your figure, marked as edited. A receipt that could not be read at
          all can be sent for another reading from the same screen.
        </p>
      </section>

      <section>
        <h2 className={legalHeadingClass}>Why the month shows more than one total</h2>
        <p>
          Each currency is totalled on its own. Amounts in different currencies are never converted or
          added together, so a month with receipts in two currencies shows two figures.
        </p>
      </section>

      <section>
        <h2 className={legalHeadingClass}>Your data</h2>
        {store ? (
          <p>
            Read how your data is handled in the{' '}
            <Link to="/privacy/app" className={legalLinkClass}>Privacy Policy</Link>. You can
            delete your account and everything in it from Settings in the app, or by writing to
            support@scan-action.com from the address you sign in with.
          </p>
        ) : (
          <p>
            Read how your data is handled in the{' '}
            <Link to="/privacy" className={legalLinkClass}>Privacy Policy</Link>. You can
            delete your account and everything in it from Settings inside the app, or follow the steps on{' '}
            <Link to="/delete-account" className={legalLinkClass}>Delete your account</Link>.
          </p>
        )}
      </section>

      <footer className={legalFooterClass}>
        Contact: support@scan-action.com
      </footer>
    </div>
  </div>
);

const SupportPage: React.FC = () => {
  usePageHead({ title: 'Support | Scan & Action', description: 'How to reach Scan & Action support by email, and short answers on amounts, totals per currency and your data.', path: '/support' });
  return (
  <>
    <LandingHeader showAnchors={false} />
    <SupportContent store={false} />
  </>
  );
};

export default SupportPage;
export { SupportPage };

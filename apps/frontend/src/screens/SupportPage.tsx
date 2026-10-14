import React from 'react';
import { Link } from 'react-router-dom';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalLinkClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { LifeBuoy } from 'lucide-react';

/**
 * Public support page, reachable logged out: the App Store Connect Support URL
 * (APPLE TRACK, "No support page"). Apple's field reference, read 2026-09-29:
 * the Support URL "must lead to actual contact information".
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
 * Mirrors the four legal screens (plain English, the landing header, the page's
 * own dark: variants, not pinned); legalPagesHeader.test.tsx covers it with them.
 */
const SupportPage: React.FC = () => (
  <>
    <LandingHeader showAnchors={false} />
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
          <p>
            Read how your data is handled in the{' '}
            <Link to="/privacy" className={legalLinkClass}>Privacy Policy</Link>. You can
            delete your account and everything in it from Settings inside the app, or follow the steps on{' '}
            <Link to="/delete-account" className={legalLinkClass}>Delete your account</Link>.
          </p>
        </section>

        <footer className={legalFooterClass}>
          Contact: support@scan-action.com
        </footer>
      </div>
    </div>
  </>
);

export default SupportPage;
export { SupportPage };

import React from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalLinkClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { CreditCard } from 'lucide-react';
import { usePageHead } from '../lib/pageHead';

const RefundPolicy: React.FC = () => {
  usePageHead({ title: 'Refund Policy | Scan & Action', description: 'The Scan & Action subscription: the 14-day money-back guarantee, how to ask for a refund, and cancellation.', path: '/refund' });
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
            <CreditCard size={32} />
          </div>
          <h1 className={legalTitleClass}>Refund Policy</h1>
        </div>

        <div className={legalBodyClass}>
          <section>
            <h2 className={legalHeadingClass}>1. 14-Day Money-Back Guarantee</h2>
            <p>Every purchase of a Scan & Action subscription comes with a 14-day money-back guarantee. If you request a refund within 14 days of your purchase, you will receive a full refund.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>2. How to Request a Refund</h2>
            <p>Our order process is conducted by our online reseller Paddle.com. Paddle is the Merchant of Record for all our orders and handles all payments and refunds. To request a refund, contact Paddle at <a href="https://paddle.net" className={legalLinkClass}>paddle.net</a> or email us at support@scan-action.com and we will arrange it for you.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>3. Processing Time</h2>
            <p>Refunds are issued to your original payment method. The time for the funds to appear in your account depends on your payment provider, typically 5-10 business days.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>4. Subscription Cancellation</h2>
            <p>You can cancel your Scan & Action subscription at any time through your account settings or by contacting our support team. Your access will continue until the end of the current billing period.</p>
          </section>

          <footer className={legalFooterClass}>
            Last updated: June 11, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default RefundPolicy;
export { RefundPolicy };

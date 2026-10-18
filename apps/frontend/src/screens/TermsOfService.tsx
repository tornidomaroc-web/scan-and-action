import React from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { ShieldCheck } from 'lucide-react';

const TermsOfService: React.FC = () => {
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
      {/* English only (the legal-page deferral), so pinned LTR under the Arabic UI. */}
      <div dir="ltr" lang="en" className={legalPageClass}>
        <div className={legalTitleRowClass}>
          <div className={legalIconClass}>
            <ShieldCheck size={32} />
          </div>
          <h1 className={legalTitleClass}>Terms of Service</h1>
        </div>

        <div className={legalBodyClass}>
          <section>
            <h2 className={legalHeadingClass}>1. Acceptance of Terms</h2>
            <p>Scan & Action is operated by Abdelfettah Amellah, an individual developer ("we", "us"). These Terms of Service are an agreement between you and Abdelfettah Amellah. By accessing or using Scan & Action, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>2. Service Description</h2>
            <p>Scan & Action provides AI-powered document extraction and classification services. We reserve the right to modify or discontinue service features at any time without notice.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>3. User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account. You must provide accurate and complete information.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>4. Payment Terms</h2>
            <p>Subscription fees are billed in advance. Our order process is conducted by our online reseller Paddle.com; Paddle is the Merchant of Record for all our orders. You agree to provide valid payment information and authorize the relevant fees to be charged. Refunds are governed by our Refund Policy, which includes a 14-day money-back guarantee.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>5. Limitation of Liability</h2>
            <p>Scan & Action is provided "as is". Abdelfettah Amellah is not liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our services.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>6. Governing Law</h2>
            <p>These terms are governed by and construed in accordance with the laws of Morocco. Any disputes shall be subject to the exclusive jurisdiction of the local courts.</p>
          </section>

          <footer className={legalFooterClass}>
            Last updated: September 29, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default TermsOfService;
export { TermsOfService };

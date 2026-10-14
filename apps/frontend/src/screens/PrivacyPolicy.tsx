import React from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { legalBodyClass, legalFooterClass, legalHeadingClass, legalIconClass, legalLinkClass, legalPageClass, legalTitleClass, legalTitleRowClass } from '../components/legal/legalPage';
import { Eye } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';

const PrivacyPolicy: React.FC = () => {
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
  //
  // Section 4 is the one part of this page that follows the language switch
  // (s.privacySignInTitle / s.privacySignInBody). Google's brand verification
  // requires the policy to say how the app uses Google user data, and the rest of
  // the page stays English under the legal-page deferral recorded in
  // noHardcodedUserFacingText.test.ts.
  const s = useStrings();
  const { language } = useLanguage();
  // The body is English under the deferral above, so it is pinned LTR: under
  // the Arabic UI it inherited dir="rtl" and rendered right-aligned with its
  // full stops on the wrong side (".security"), seen on the Android emulator
  // 2026-10-09 after the Login link made this page one tap from the first
  // screen. Section 4 follows the language, so it takes the reader's direction.
  return (
    <>
      <LandingHeader showAnchors={false} />
      <div dir="ltr" lang="en" className={legalPageClass}>
        <div className={legalTitleRowClass}>
          <div className={legalIconClass}>
            <Eye size={32} />
          </div>
          <h1 className={legalTitleClass}>Privacy Policy</h1>
        </div>

        <div className={legalBodyClass}>
          <section>
            <h2 className={legalHeadingClass}>1. Data Collected</h2>
            <p>Scan & Action is operated by Abdelfettah Amellah, an individual developer, who is responsible for the personal data described in this policy. We collect information you provide directly, such as account details and uploaded document images. We also collect metadata necessary for service improvement and security.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>2. How We Use Data</h2>
            <p>Your data is used to process documents, provide AI-powered insights, manage your subscription, and communicate important service updates. We do not sell your personal data.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>3. Data Storage (Supabase)</h2>
            <p>We use Supabase for secure data storage and authentication. All data is encrypted at rest and in transit using industry-standard protocols.</p>
          </section>

          <section data-privacy-sign-in dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
            <h2 className={legalHeadingClass}>4. {s.privacySignInTitle}</h2>
            <p>{s.privacySignInBody}</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>5. Third Party Services</h2>
            <p>Document analysis is performed via Google Gemini Vision API. Data shared with this provider is limited to the minimum required for extraction and is subject to their privacy policies. Payments are processed by Paddle.com, our Merchant of Record, which handles your payment details under its own privacy policy.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>6. User Rights</h2>
            <p>You have the right to access, correct, or delete your personal data at any time. You can manage most data directly through your account dashboard.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>7. Account &amp; Data Deletion</h2>
            <p>You can permanently delete your account at any time from Settings &rarr; Delete account inside the app, or from the web at <a href="/delete-account" className={legalLinkClass}>www.scan-action.com/delete-account</a>. Deletion permanently removes your account, your workspace, and all documents, scans, extracted data, and reports it contains &mdash; from both our database and file storage &mdash; and deletes your authentication identity. This action cannot be undone. Deleting your account does not cancel an active subscription; if you have one, cancel it by writing to support@scan-action.com.</p>
          </section>

          <section>
            <h2 className={legalHeadingClass}>8. Contact</h2>
            <p>For any privacy-related inquiries, please contact us at support@scan-action.com.</p>
          </section>

          <footer className={legalFooterClass}>
            Last updated: October 9, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;
export { PrivacyPolicy };

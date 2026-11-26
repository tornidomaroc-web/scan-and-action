import React from 'react';
import { StoreHeader } from '../components/legal/StoreHeader';
import { usePageHead } from '../lib/pageHead';
import { PrivacyPolicyContent } from './PrivacyPolicy';

/**
 * /privacy/app: the privacy policy of the iPhone and iPad app, at its own
 * address, for App Store Connect's Privacy Policy URL. A reviewer opens it in
 * a browser, where /privacy shows the web text (Paddle and subscriptions) and
 * a header whose mark links to the priced landing. Here the text is the iOS
 * text on every platform and the header has no links (StoreHeader), so
 * nothing on this page leads to a price. The page links nowhere at all
 * (iosNoPlanWording.test.tsx).
 */
const PrivacyPolicyApp: React.FC = () => {
  usePageHead({ title: 'Privacy Policy for the iPhone and iPad app | Scan & Action', description: 'What the Scan & Action app for iPhone and iPad collects when you scan a receipt, where it is kept, how Google or Apple sign-in data is used, and how to delete it all.', path: '/privacy/app' });
  return (
    <>
      <StoreHeader />
      <PrivacyPolicyContent ios />
    </>
  );
};

export default PrivacyPolicyApp;
export { PrivacyPolicyApp };

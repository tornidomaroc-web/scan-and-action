import React from 'react';
import { StoreHeader } from '../components/legal/StoreHeader';
import { usePageHead } from '../lib/pageHead';
import { SupportContent } from './SupportPage';

/**
 * /support/app: the support page for App Store Connect's Support URL. /support
 * itself is safe in its words, but its header's mark links to "/", and on the
 * web "/" is the landing with its prices. Here the header has no links
 * (StoreHeader), and the body links only to the support address and to
 * /privacy/app (iosNoPlanWording.test.tsx follows every link).
 */
const SupportPageApp: React.FC = () => {
  usePageHead({ title: 'Support for the iPhone and iPad app | Scan & Action', description: 'How to reach Scan & Action support by email from the iPhone and iPad app, and short answers on amounts, totals per currency and your data.', path: '/support/app' });
  return (
    <>
      <StoreHeader />
      <SupportContent store />
    </>
  );
};

export default SupportPageApp;
export { SupportPageApp };

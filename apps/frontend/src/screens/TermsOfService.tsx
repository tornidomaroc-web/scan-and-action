import React from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { ShieldCheck } from 'lucide-react';

const TermsOfService: React.FC = () => {
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
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-2xl text-blue-600">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-4xl font-black tracking-tight italic uppercase">Terms of Service</h1>
        </div>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">1. Acceptance of Terms</h2>
            <p>Scan & Action is a product operated by KnowFlow ("KnowFlow", "we", "us"). These Terms of Service are an agreement between you and KnowFlow. By accessing or using Scan & Action, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">2. Service Description</h2>
            <p>Scan & Action provides AI-powered document extraction and classification services. We reserve the right to modify or discontinue service features at any time without notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">3. User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account. You must provide accurate and complete information.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">4. Payment Terms</h2>
            <p>Subscription fees are billed in advance. Our order process is conducted by our online reseller Paddle.com; Paddle is the Merchant of Record for all our orders. You agree to provide valid payment information and authorize the relevant fees to be charged. Refunds are governed by our Refund Policy, which includes a 14-day money-back guarantee.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">5. Limitation of Liability</h2>
            <p>Scan & Action is provided "as is". KnowFlow is not liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">6. Governing Law</h2>
            <p>These terms are governed by and construed in accordance with the laws of Morocco. Any disputes shall be subject to the exclusive jurisdiction of the local courts.</p>
          </section>

          <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
            Last updated: June 11, 2026 | Contact: support@scan-action.com
          </footer>
        </div>
      </div>
    </>
  );
};

export default TermsOfService;
export { TermsOfService };

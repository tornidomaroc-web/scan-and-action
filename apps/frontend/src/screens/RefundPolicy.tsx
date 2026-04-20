import React from 'react';
import { CreditCard } from 'lucide-react';

const RefundPolicy: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20 font-sans text-slate-800 dark:text-slate-200">
      <div className="flex items-center gap-4 mb-10">
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl text-red-600">
          <CreditCard size={32} />
        </div>
        <h1 className="text-4xl font-black tracking-tight italic uppercase">Refund Policy</h1>
      </div>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">1. Subscription Cancellation</h2>
          <p>You can cancel your Scan & Action subscription at any time through your account settings or by contacting our support team. Your access will continue until the end of the current billing period.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">2. Refund Eligibility</h2>
          <p>We offer a 7-day money-back guarantee for first-time subscribers. If you are unsatisfied with the service, you can request a full refund within 7 days of your initial purchase.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">3. How to Request</h2>
          <p>To request a refund, please send an email to [contact@scan-and-action.com] with your account details and reasoning. Requests must be sent within the eligibility window.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">4. Processing Time</h2>
          <p>Once approved, refunds are processed within 5-10 business days. The actual time for the funds to appear in your account depends on your financial institution.</p>
        </section>

        <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
          Last updated: April 20, 2026 | Contact: [contact@scan-and-action.com]
        </footer>
      </div>
    </div>
  );
};

export default RefundPolicy;
export { RefundPolicy };

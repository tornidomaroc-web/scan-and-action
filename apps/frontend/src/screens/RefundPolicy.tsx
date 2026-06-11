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
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">1. 14-Day Money-Back Guarantee</h2>
          <p>Every purchase of a Scan & Action subscription comes with a 14-day money-back guarantee. If you request a refund within 14 days of your purchase, you will receive a full refund.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">2. How to Request a Refund</h2>
          <p>Our order process is conducted by our online reseller Paddle.com. Paddle is the Merchant of Record for all our orders and handles all payments and refunds. To request a refund, contact Paddle at <a href="https://paddle.net" className="underline">paddle.net</a> or email us at support@scan-action.com and we will arrange it for you.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">3. Processing Time</h2>
          <p>Refunds are issued to your original payment method. The time for the funds to appear in your account depends on your payment provider, typically 5-10 business days.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-red-600">4. Subscription Cancellation</h2>
          <p>You can cancel your Scan & Action subscription at any time through your account settings or by contacting our support team. Your access will continue until the end of the current billing period.</p>
        </section>

        <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
          Last updated: June 11, 2026 | Contact: support@scan-action.com
        </footer>
      </div>
    </div>
  );
};

export default RefundPolicy;
export { RefundPolicy };

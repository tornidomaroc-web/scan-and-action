import React from 'react';
import { Eye } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20 font-sans text-slate-800 dark:text-slate-200">
      <div className="flex items-center gap-4 mb-10">
        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl text-emerald-600">
          <Eye size={32} />
        </div>
        <h1 className="text-4xl font-black tracking-tight italic uppercase">Privacy Policy</h1>
      </div>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">1. Data Collected</h2>
          <p>We collect information you provide directly, such as account details and uploaded document images. We also collect metadata necessary for service improvement and security.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">2. How We Use Data</h2>
          <p>Your data is used to process documents, provide AI-powered insights, manage your subscription, and communicate important service updates. We do not sell your personal data.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">3. Data Storage (Supabase)</h2>
          <p>We use Supabase for secure data storage and authentication. All data is encrypted at rest and in transit using industry-standard protocols.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">4. Third Party Services (Google Gemini)</h2>
          <p>Document analysis is performed via Google Gemini Vision API. Data shared with this provider is limited to the minimum required for extraction and is subject to their privacy policies.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">5. User Rights</h2>
          <p>You have the right to access, correct, or delete your personal data at any time. You can manage most data directly through your account dashboard.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-emerald-600">6. Contact</h2>
          <p>For any privacy-related inquiries, please contact us at [contact@scan-and-action.com].</p>
        </section>

        <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
          Last updated: April 20, 2026 | Contact: [contact@scan-and-action.com]
        </footer>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
export { PrivacyPolicy };

import React from 'react';
import { ShieldCheck } from 'lucide-react';

const TermsOfService: React.FC = () => {
  return (
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
          <p>By accessing or using Scan & Action, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
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
          <p>Subscription fees are billed in advance. All payments are processed via third-party providers. You agree to provide valid payment information and authorize us to charge relevant fees.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">5. Limitation of Liability</h2>
          <p>Scan & Action is provided "as is". We are not liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our services.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3 uppercase tracking-wider text-blue-600">6. Governing Law</h2>
          <p>These terms are governed by and construed in accordance with the laws of Morocco. Any disputes shall be subject to the exclusive jurisdiction of the local courts.</p>
        </section>

        <footer className="pt-10 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
          Last updated: April 20, 2026 | Contact: [contact@scan-and-action.com]
        </footer>
      </div>
    </div>
  );
};

export default TermsOfService; // Named export might be better if others use it, but App.tsx uses default/named interchangeably. I'll use named export as in other screens.
export { TermsOfService };

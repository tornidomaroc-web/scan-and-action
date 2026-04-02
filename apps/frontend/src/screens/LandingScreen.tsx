import React from 'react';
import { Link } from 'react-router-dom';

export function LandingScreen() {
  return (
    <div className="bg-slate-50 min-h-screen">
      {/* 1. Hero Section */}
      <div className="pt-24 pb-20 px-6 bg-white border-b border-slate-100 mb-12 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center text-center lg:text-left">
          <div className="space-y-8 relative z-10 text-left">
            <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight uppercase">
              Stop typing receipts. <span className="text-indigo-600">Let AI fix the data for you.</span>
            </h1>
            <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl font-medium leading-relaxed">
              Upload receipts, get structured validated data, and review only what actually needs attention.
            </p>
            <div className="flex flex-col items-center lg:items-start space-y-4 pt-4">
              <Link to="/login" className="inline-block px-10 py-5 bg-indigo-600 text-white font-black text-xl rounded-2xl hover:bg-indigo-700 transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-95 uppercase tracking-tight">
                Start Free – 10 Scans Included
              </Link>
              <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No credit card. Takes 30 seconds.</p>
            </div>
          </div>
          
          {/* Faithful Product Preview (In-Code) */}
          <div className="relative">
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 text-left">
              {/* Mock Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Starbucks Receipt</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Extraction</p>
                </div>
                <div className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-600 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  Needs Review
                </div>
              </div>

              {/* Mock Decision Banner */}
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl flex items-center gap-3">
                <div className="w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center text-white font-bold text-xs">!</div>
                <p className="text-xs font-bold text-amber-800">Missing total amount detected</p>
              </div>

              {/* Mock Facts Table */}
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Merchant</td>
                        <td className="px-4 py-3 text-sm text-slate-600">Starbucks Coffee</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Date</td>
                        <td className="px-4 py-3 text-sm text-slate-600">Oct 24, 2023</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Amount</td>
                        <td className="px-4 py-3 text-sm text-indigo-600 font-bold flex items-center gap-2">
                           Fix required
                           <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mock Source (Receipt Preview) */}
              <div className="h-40 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-3 p-6 opacity-40">
                 <div className="w-full h-2 bg-slate-200 rounded-full" />
                 <div className="w-3/4 h-2 bg-slate-200 rounded-full" />
                 <div className="w-full h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                   <div className="w-16 h-2 bg-slate-300 rounded-full" />
                 </div>
                 <div className="w-1/2 h-2 bg-slate-200 rounded-full" />
              </div>
            </div>

            {/* Subtle shadow depth */}
            <div className="absolute -bottom-6 left-12 right-12 h-6 bg-slate-200 blur-2xl rounded-full opacity-30 -z-10" />
          </div>
        </div>
      </div>

      {/* 2. Problem Section */}
      <div className="py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-12">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 text-center uppercase">Still typing receipts manually?</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-slate-800 text-lg leading-snug">You’re still typing every receipt by hand</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-slate-800 text-lg leading-snug">Receipts with missing amounts break your reports</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-slate-800 text-lg leading-snug">You find mistakes only after it’s too late</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. How it Works Section */}
      <div className="py-24 px-6 bg-white border-y border-slate-100">
        <div className="max-w-4xl mx-auto text-center space-y-16">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase italic">How it works</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">You don’t review everything. Only what needs attention.</p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-12 sm:gap-4 relative">
            <div className="space-y-6 relative z-10">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-indigo-100">1</div>
              <h3 className="text-xl font-black text-slate-900 uppercase leading-tight">Upload receipts</h3>
            </div>
            <div className="space-y-6 relative z-10">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-indigo-100">2</div>
              <h3 className="text-xl font-black text-slate-900 uppercase leading-tight">AI extracts and fixes the data</h3>
            </div>
            <div className="space-y-6 relative z-10">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-indigo-100">3</div>
              <h3 className="text-xl font-black text-slate-900 uppercase leading-tight">You review only what matters</h3>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Value Section */}
      <div className="py-24 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-8 text-center sm:text-left">
          <div className="space-y-4">
            <h3 className="font-black text-slate-900 text-2xl uppercase leading-tight">Stop wasting hours on manual entry</h3>
            <p className="text-slate-600 font-medium">Automatic recognition makes typing a thing of the past.</p>
          </div>
          <div className="space-y-4">
            <h3 className="font-black text-slate-900 text-2xl uppercase leading-tight">Catch errors before they cost you</h3>
            <p className="text-slate-600 font-medium">Built-in validation rules flag suspicious data instantly.</p>
          </div>
          <div className="space-y-4">
            <h3 className="font-black text-slate-900 text-2xl uppercase leading-tight">Get clean data you can actually use</h3>
            <p className="text-slate-600 font-medium">Export validated CSV data ready for your accounting tool.</p>
          </div>
        </div>
      </div>

      {/* 5. Pricing Section */}
      <div className="py-24 px-6 bg-white border-y border-slate-100">
        <div className="max-w-4xl mx-auto space-y-16 text-center">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase italic tracking-tight">Try it free. Upgrade when you need more.</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Simple, transparent, and fair.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto uppercase">
            <div className="p-10 rounded-[32px] border-4 border-slate-50 bg-white text-left flex flex-col justify-between items-start space-y-8">
              <div className="space-y-2">
                <h3 className="font-black text-slate-400 text-xl italic">Free</h3>
                <div className="text-5xl font-black text-slate-900 italic">$0</div>
              </div>
              <ul className="space-y-3 font-bold text-slate-600 text-sm italic">
                <li>✓ 10 Scans Included</li>
                <li>✓ All core features</li>
                <li>✓ Free forever</li>
              </ul>
              <Link to="/login" className="w-full text-center py-4 bg-slate-100 text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all">Start Free</Link>
            </div>
            
            <div className="p-10 rounded-[32px] border-4 border-indigo-600 bg-white text-left flex flex-col justify-between items-start space-y-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black tracking-widest">MOST POPULAR</div>
              <div className="space-y-2">
                <h3 className="font-black text-indigo-600 text-xl italic">Pro</h3>
                <div className="text-5xl font-black text-slate-900 italic">$9<span className="text-2xl opacity-40">/mo</span></div>
              </div>
              <ul className="space-y-3 font-bold text-slate-900 text-sm italic">
                <li>✓ Unlimited scans</li>
                <li>✓ All core features</li>
                <li>✓ Priority processing</li>
              </ul>
              <Link to="/login" className="w-full text-center py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20">Upgrade Now</Link>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Final CTA Section */}
      <div className="py-32 px-6 bg-slate-900 text-center">
        <div className="max-w-3xl mx-auto space-y-10">
          <h2 className="text-4xl sm:text-5xl font-black text-white uppercase leading-tight">Turn receipts into clean data in seconds</h2>
          <div className="space-y-6">
            <Link to="/login" className="inline-block px-12 py-6 bg-indigo-600 text-white font-black text-2xl rounded-2xl hover:bg-indigo-700 transition-all shadow-2xl hover:shadow-indigo-500/40 active:scale-95 uppercase tracking-tight">
              Start Free – 10 Scans Included
            </Link>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">No credit card. Takes 30 seconds.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

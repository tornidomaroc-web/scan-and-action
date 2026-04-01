import React from 'react';
import { Link } from 'react-router-dom';

export function LandingScreen() {
  return (
    <>
      {/* Hero Section */}
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12 text-center">
        <div className="max-w-3xl space-y-8">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight">
            Know Where Your Money Goes — Instantly
          </h1>
          <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl mx-auto">
            Upload your receipts and get a clean, categorized expense report in seconds — no spreadsheets, no manual work, no guesswork.
          </p>
          <div className="pt-4">
            <Link to="/?intent=upload" className="inline-block text-center px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl w-full sm:w-auto">
              See My Expenses — Free
            </Link>
          </div>
          {/* Proof Strip */}
          <div className="pt-12 flex flex-wrap justify-center gap-8 text-slate-500 font-medium text-sm sm:text-base border-t border-slate-200">
             <div className="flex items-center">
                <span className="mr-2 text-indigo-500">✓</span> Categorized automatically
             </div>
             <div className="flex items-center">
                <span className="mr-2 text-indigo-500">✓</span> Export-ready
             </div>
             <div className="flex items-center">
                <span className="mr-2 text-indigo-500">✓</span> Built for freelancers & small teams
             </div>
          </div>
        </div>
      </div>

      {/* Problem Section */}
      <div className="bg-slate-50 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center border-t border-slate-100">
        <div className="max-w-3xl space-y-8">
          <h2 className="text-3xl font-bold text-slate-900">The "Pile of Receipts" Problem</h2>
          <div className="inline-block text-left space-y-6 text-xl sm:text-2xl text-slate-700">
            <p>- You lose track of daily spending</p>
            <p>- You have a mounting pile of unorganized receipts</p>
            <p>- You don't know your real profit until tax season</p>
          </div>
          <p className="font-bold text-slate-900 text-xl sm:text-2xl mt-4">
            This lack of clarity is costing you money.
          </p>
        </div>
      </div>

      {/* Solution Section */}
      <div className="bg-white flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-12">How it works</h2>
        <div className="max-w-3xl flex flex-col sm:flex-row justify-between items-center space-y-12 sm:space-y-0 sm:space-x-12 text-xl font-bold text-slate-800">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 text-2xl">1</div>
            <p>Upload</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 text-2xl">2</div>
            <p>AI Extraction</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 text-2xl">3</div>
            <p>Smart Report</p>
          </div>
        </div>
      </div>

      {/* Result/Dashboard Section */}
      <div className="bg-slate-900 text-white flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-5xl space-y-12">
          <h2 className="text-3xl sm:text-5xl font-bold">This is what your money looks like</h2>
          <div className="aspect-video bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-center text-slate-500 overflow-hidden">
             {/* Simple Placeholder for Dashboard UI */}
             <div className="flex flex-col items-center space-y-4">
                <div className="w-64 h-8 bg-slate-700 rounded animate-pulse"></div>
                <div className="w-48 h-8 bg-slate-700 rounded animate-pulse"></div>
                <div className="grid grid-cols-3 gap-4 w-full px-12">
                   <div className="h-32 bg-slate-700 rounded"></div>
                   <div className="h-32 bg-slate-700 rounded"></div>
                   <div className="h-32 bg-slate-700 rounded"></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-slate-50 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl space-y-12">
          <h2 className="text-3xl font-bold text-slate-900">Why choose Scan & Action?</h2>
          <div className="grid sm:grid-cols-2 gap-8 text-left">
            <div className="space-y-2">
               <p className="font-bold text-slate-900 text-xl">✓ Categorized automatically</p>
               <p className="text-slate-600">Smart labels for food, transport, and more.</p>
            </div>
            <div className="space-y-2">
               <p className="font-bold text-slate-900 text-xl">✓ Ready for accounting</p>
               <p className="text-slate-600">Matches standard accounting formats.</p>
            </div>
            <div className="space-y-2">
               <p className="font-bold text-slate-900 text-xl">✓ Clear expense visibility</p>
               <p className="text-slate-600">See exactly where your money is going.</p>
            </div>
            <div className="space-y-2">
               <p className="font-bold text-slate-900 text-xl">✓ Faster monthly tracking</p>
               <p className="text-slate-600">Close your books in minutes, not days.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA Section */}
      <div className="bg-indigo-600 text-white flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl space-y-8">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Stop Guessing. Know Your Numbers.
          </h2>
          <p className="text-xl text-indigo-100">Join freelancers and business owners who automate their finances.</p>
          <div className="pt-4">
            <Link to="/?intent=upload" className="inline-block text-center px-8 py-4 bg-white text-indigo-600 font-bold text-lg rounded-xl hover:bg-slate-100 transition-colors shadow-lg hover:shadow-xl w-full sm:w-auto">
              Get My Expense Report — Free
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

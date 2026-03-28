import React from 'react';
import { Link } from 'react-router-dom';

export function LandingScreen() {
  return (
    <>
      {/* Hero Section */}
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12 text-center">
        <div className="max-w-3xl space-y-8">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight">
            Stop wasting time typing receipts.
          </h1>
          <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl mx-auto">
            Upload a photo. Get clean, structured data instantly.
          </p>
          <div className="pt-4">
            <Link to="/?intent=upload" className="inline-block text-center px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl w-full sm:w-auto">
              Try it free
            </Link>
          </div>
        </div>
      </div>

      {/* Problem Section */}
      <div className="bg-slate-50 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl space-y-8">
          <div className="inline-block text-left space-y-6 text-xl sm:text-2xl text-slate-700">
            <p>- You take photos of receipts</p>
            <p>- They stay in your phone</p>
            <p>- You manually type everything later</p>
          </div>
          <p className="font-bold text-slate-900 text-xl sm:text-2xl mt-4">
            This is a waste of time.
          </p>
        </div>
      </div>

      {/* How it works Section */}
      <div className="bg-white flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl space-y-6 text-xl sm:text-2xl text-slate-700">
          <p>1. Upload your receipt</p>
          <p>2. We extract the data</p>
          <p>3. You get structured results instantly</p>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-slate-50 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="inline-block text-left space-y-6 text-xl sm:text-2xl text-slate-700">
          <p>- Save hours every week</p>
          <p>- No more manual typing</p>
          <p>- Keep your finances organized</p>
          <p>- Ready for accounting anytime</p>
        </div>
      </div>

      {/* Testimonial Section */}
      <div className="bg-white flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl text-xl sm:text-2xl text-slate-700 italic">
          <p>"I scan 20+ receipts per week. This saves me hours."</p>
        </div>
      </div>

      {/* Final CTA Section */}
      <div className="bg-slate-50 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <div className="max-w-3xl space-y-8">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Start free — no credit card needed
          </h2>
          <div className="pt-4">
            <Link to="/?intent=upload" className="inline-block text-center px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl w-full sm:w-auto">
              Try it free
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

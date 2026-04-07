import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Zap, 
  Brain, 
  BarChart, 
  CheckCircle, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

export const AuthScreen: React.FC = () => {
  const s = useStrings();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)] overflow-hidden lg:gap-0">
      {/* Left Side: Product Value Panel (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-16">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-lg w-full">
          <div className="mb-12 flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Zap size={28} className="text-white" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">{s.header}</span>
          </div>

          <p className="text-blue-400 font-bold uppercase tracking-[0.2em] text-xs mb-4">
            Intellectual Automation
          </p>
          <h1 className="text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
            Turn Documents Into <span className="text-blue-500">Actionable</span> Intelligence
          </h1>
          <p className="text-xl text-slate-300 font-bold mb-10">
            Stop wasting hours reviewing documents manually.
          </p>

          <div className="space-y-8">
            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <Zap size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">Instant Data Extraction</h4>
                <p className="text-slate-500 text-sm font-medium">99%+ accuracy on invoices, receipts, and complex forms.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <Brain size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">Intelligent Insights & Search</h4>
                <p className="text-slate-500 text-sm font-medium">Query your entire document library using natural language.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <BarChart size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">Audit-Ready Reports</h4>
                <p className="text-slate-500 text-sm font-medium">Generate professional audit reports in a single click.</p>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-12 border-t border-white/5">
             <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                <ShieldCheck size={18} className="text-emerald-500" />
                Trusted by teams managing thousands of documents monthly
             </div>
          </div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 lg:p-16 animate-in fade-in slide-in-from-right-4 duration-700">
        <div className="w-full max-w-[440px]">
          {/* Mobile Only Header */}
          <div className="lg:hidden mb-12 flex flex-col items-center">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 rotate-3">
               <Zap size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{s.header}</h2>
          </div>

          <div className="bg-white dark:bg-slate-800 p-10 lg:p-12 rounded-[40px] shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-200/50 dark:border-slate-700/50">
            <div className="mb-10 lg:text-left text-center">
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-3 italic">
                {isLogin ? 'Welcome back' : 'Create your workspace'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-base leading-relaxed">
                {isLogin ? 'Log in to manage your intelligence' : 'Start your journey to automated precision'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] pl-1 flex items-center gap-2">
                  <Mail size={12} /> Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl text-slate-900 dark:text-white font-bold placeholder-slate-350 dark:placeholder-slate-600 transition-all outline-none"
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="password" className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Lock size={12} /> Password
                  </label>
                  {isLogin && (
                    <button type="button" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl text-slate-900 dark:text-white font-bold placeholder-slate-350 dark:placeholder-slate-600 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl text-sm font-bold border border-rose-100 dark:border-rose-900/30 flex items-center gap-3 animate-in fade-in zoom-in-95">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 hover:-translate-y-0.5 hover:brightness-110 text-white rounded-2xl font-black text-base transition-all shadow-xl shadow-slate-200 dark:shadow-none active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-3 group"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isLogin ? 'Signing in...' : 'Registering...'}
                  </>
                ) : (
                  <>
                    {isLogin ? 'Continue to Dashboard' : 'Access Workspace'}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <ShieldCheck size={12} className="text-emerald-500" />
                  Secure login • Enterprise-grade encryption
                </p>
              </div>
            </form>

            <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(null); }}
                  className="ml-2 text-blue-600 dark:text-blue-400 hover:underline font-black"
                >
                  {isLogin ? 'Create Account' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

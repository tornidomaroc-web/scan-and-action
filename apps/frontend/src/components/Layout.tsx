import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet, useSearchParams } from 'react-router-dom';
import { UploadModal } from './UploadModal';
import { documentService } from '../services/documentService';
import { Camera, Menu } from 'lucide-react';

export const Layout: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [plan, setPlan] = useState<'FREE' | 'PRO' | undefined>(undefined);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    documentService.getStats().then(stats => {
      if (stats?.plan) setPlan(stats.plan);
    }).catch(err => console.error('[Layout] Plan fetch failed:', err));
  }, [refreshCount]);

  useEffect(() => {
    if (searchParams.get('intent') === 'upload') {
      setIsUploadOpen(true);
      searchParams.delete('intent');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleNewScan = () => {
    console.log('DEBUG: handleNewScan triggered in Layout');
    setIsUploadOpen(true);
  };

  const handleUploadSuccess = () => {
    console.log('DEBUG: handleUploadSuccess triggered in Layout');
    setRefreshCount(prev => prev + 1);
  };

  const handleRefreshPlan = () => {
    setRefreshCount(prev => prev + 1);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      {/* Mobile Top Bar */}
      <header className="flex md:hidden items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[60] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Camera size={18} className="text-white" />
          </div>
          <span className="font-bold text-slate-900 dark:text-white tracking-tight">Scan & Action</span>
        </div>
        <button
          onClick={handleNewScan}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
        >
          <Camera size={16} />
          Scan Receipt
        </button>
      </header>

      {/* Sidebar - Fixed Layer (Hidden on Mobile) */}
      <aside className="hidden md:block fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all duration-500">
        <Sidebar onNewScan={handleNewScan} plan={plan} onRefreshPlan={handleRefreshPlan} />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-[280px] min-h-screen overflow-y-auto">
        <div className="p-4 md:p-8 lg:p-12 xl:p-16">
          <Outlet context={{ refreshCount, onNewScan: handleNewScan, onSuccess: handleUploadSuccess, plan }} />
        </div>
      </main>

      {/* Global Contextual Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        plan={plan}
      />
    </div>
  );
};

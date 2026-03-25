import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet } from 'react-router-dom';
import { UploadModal } from './UploadModal';
import { documentService } from '../services/documentService';

export const Layout: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [plan, setPlan] = useState<'FREE' | 'PRO'>('FREE');

  useEffect(() => {
    documentService.getStats().then(stats => {
      if (stats?.plan) setPlan(stats.plan);
    }).catch(err => console.error('[Layout] Plan fetch failed:', err));
  }, [refreshCount]);

  const handleNewScan = () => {
    console.log('DEBUG: handleNewScan triggered in Layout');
    setIsUploadOpen(true);
  };

  const handleUploadSuccess = () => {
    console.log('DEBUG: handleUploadSuccess triggered in Layout');
    setRefreshCount(prev => prev + 1);
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      {/* Sidebar - Fixed Layer */}
      <aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all duration-500">
        <Sidebar onNewScan={handleNewScan} plan={plan} />
      </aside>
      
      {/* Main Content Area */}
      <main className="flex-1 ml-[280px] min-h-screen overflow-y-auto">
        <div className="p-8 lg:p-12 xl:p-16">
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

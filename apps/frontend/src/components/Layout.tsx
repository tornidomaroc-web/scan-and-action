import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { UploadModal } from './UploadModal';
import { BottomTabBar } from './BottomTabBar';
import { CaptureSheet, CaptureSheetHandle } from './CaptureSheet';
import { ProcessingTray } from './ProcessingTray';
import { ProWelcome } from './ProWelcome';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { documentService } from '../services/documentService';
import { BrandMark } from './BrandMark';

export const Layout: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [plan, setPlan] = useState<'FREE' | 'PRO' | undefined>(undefined);
  const [pendingCount, setPendingCount] = useState(0);
  const [showProWelcome, setShowProWelcome] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const captureRef = useRef<CaptureSheetHandle>(null);
  const isDesktop = useIsDesktop();

  // Re-fetched on navigation too, so the Queue tab badge reflects
  // approvals/rejections made in the queue as soon as the user leaves it.
  useEffect(() => {
    documentService.getStats().then(stats => {
      if (stats?.plan) setPlan(stats.plan);
      if (typeof stats?.pendingCount === 'number') setPendingCount(stats.pendingCount);
    }).catch(err => console.error('[Layout] Plan fetch failed:', err));
  }, [refreshCount, location.pathname]);

  useEffect(() => {
    if (searchParams.get('intent') === 'upload') {
      setIsUploadOpen(true);
      searchParams.delete('intent');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Post-payment confirmation: Paddle redirects here with ?checkout=success.
  // Celebrate, refetch the plan (twice — the webhook that flips FREE->PRO can
  // lag the redirect by a few seconds), and clean the URL so a refresh
  // doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setShowProWelcome(true);
      setRefreshCount(prev => prev + 1);
      const lagRefetch = setTimeout(() => setRefreshCount(prev => prev + 1), 5000);
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
      return () => clearTimeout(lagRefetch);
    }
  }, [searchParams, setSearchParams]);

  // Mobile opens the source chooser (camera or gallery/Files incl. PDF);
  // desktop keeps the drag-drop modal where it earns its place.
  const handleNewScan = () => {
    if (isDesktop) {
      setIsUploadOpen(true);
    } else {
      captureRef.current?.open();
    }
  };

  const handleUploadSuccess = () => {
    setRefreshCount(prev => prev + 1);
  };

  const handleRefreshPlan = () => {
    setRefreshCount(prev => prev + 1);
  };

  return (
    <ProcessingProvider onJobSettled={handleUploadSuccess}>
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-surface transition-colors duration-500 motion-reduce:transition-none">
      {/* Mobile Top Bar. It carries the brand only. Scanning has ONE home on a
          phone, the camera button in the centre of the tab bar: it is on every
          screen, in thumb reach at the bottom of the display, and it opens the
          camera directly. A second "Scan receipt" button up here offered the
          same action twice, out of thumb reach (ruled 2026-09-24). The mark was
          a camera glyph on an accent tile, which read as a third scan button;
          it is the app's own mark now (BrandMark, as on the landing header). */}
      <header className="flex md:hidden items-center gap-2.5 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-surface-raised border-b border-line sticky top-0 z-[60]" data-mobile-header>
        {/* Mounted only on a phone. The rail renders the mark too, and the two
            share one SVG gradient id; with this header merely display:none on
            a desktop, the rail's plate resolved to the hidden copy and painted
            nothing (seen 2026-09-26). One instance per viewport, never two. */}
        {!isDesktop && <BrandMark size={28} className="rounded-[7px]" />}
        <span className="font-bold text-ink tracking-tight">Scan & Action</span>
      </header>

      {/* Sidebar - Fixed Layer (Hidden on Mobile). `start-0` + `border-e` are
          logical, so the rail mirrors to the right edge in Arabic/RTL. */}
      <aside className="hidden md:block fixed inset-y-0 start-0 z-50 w-24 bg-surface-raised">
        <Sidebar onNewScan={handleNewScan} plan={plan} onRefreshPlan={handleRefreshPlan} />
      </aside>

      {/* Main Content Area (logical margin so it clears the rail on either edge) */}
      {/* The bottom padding on a phone is what keeps the last row of every
          screen above the floating tab bar: the bar's own height (72 px) plus
          its lift (12 px) plus the safe-area inset, plus a 36 px gap. It has
          to include env(safe-area-inset-bottom): a fixed rem alone left the
          last category cards under the bar on the owner's iPhone (2026-09-26).
          tabBarClearance.test.ts holds the arithmetic against BottomTabBar. */}
      <main className="flex-1 md:ms-24 min-h-screen overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+7.5rem)] md:pb-0" data-app-main>
        <div className="p-4 md:p-8 lg:p-12 xl:p-16">
          <Outlet context={{ refreshCount, onNewScan: handleNewScan, onSuccess: handleUploadSuccess, plan, pendingCount }} />
        </div>
      </main>

      {/* Mobile Bottom Tab Bar (hidden on md+) */}
      <BottomTabBar pendingCount={pendingCount} onScan={() => captureRef.current?.open()} />

      {/* App-level processing tray: chip above the tab bar + tray sheet */}
      <ProcessingTray />

      {/* Mobile one-tap camera capture (hidden input + confirm sheet) */}
      <CaptureSheet ref={captureRef} plan={plan} />

      {/* Post-payment celebration (?checkout=success) */}
      {showProWelcome && <ProWelcome onClose={() => setShowProWelcome(false)} />}

      {/* Global Contextual Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        plan={plan}
      />
    </div>
    </ProcessingProvider>
  );
};

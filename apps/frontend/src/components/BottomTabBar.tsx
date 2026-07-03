import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, ClipboardList, Settings, Camera } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

interface BottomTabBarProps {
  pendingCount?: number;
  /** Fires the camera capture flow directly (no intermediate modal). */
  onScan?: () => void;
}

// Mobile-only (<md) bottom navigation. Activity is intentionally absent:
// on mobile it lives inside Home's Recent Activity section. The desktop
// sidebar is a separate component and keeps its own nav.
export const BottomTabBar: React.FC<BottomTabBarProps> = ({ pendingCount = 0, onScan }) => {
  const s = useStrings();

  const leftTabs = [
    { to: '/dashboard', icon: Home, label: s.home },
    { to: '/search', icon: Search, label: s.searchTab },
  ];
  const rightTabs = [
    { to: '/queue', icon: ClipboardList, label: s.queueTab, badge: pendingCount },
    { to: '/settings', icon: Settings, label: s.settings },
  ];

  const renderTab = ({ to, icon: Icon, label, badge }: { to: string; icon: typeof Home; label: string; badge?: number }) => (
    <li key={to} className="flex-1">
      <NavLink
        to={to}
        className={({ isActive }) =>
          `relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
            isActive
              ? 'text-accent'
              : 'text-ink-faint hover:text-ink-secondary'
          }`
        }
      >
        <span className="relative">
          <Icon size={22} strokeWidth={2.5} />
          {badge != null && badge > 0 && (
            <span
              data-testid="queue-badge"
              className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-pill bg-warning text-white text-[10px] font-black flex items-center justify-center leading-none"
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        {label}
      </NavLink>
    </li>
  );

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-[60] bg-surface-raised border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {leftTabs.map(renderTab)}
        {/* Center Scan slot: fires the camera input directly. */}
        <li className="flex-1 flex justify-center">
          <button
            onClick={onScan}
            aria-label={s.scanWithCamera}
            data-testid="scan-slot"
            className="-mt-5 w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-white shadow-lg border-4 border-surface-raised flex items-center justify-center transition-all active:scale-95"
          >
            <Camera size={24} strokeWidth={2.5} />
          </button>
        </li>
        {rightTabs.map(renderTab)}
      </ul>
    </nav>
  );
};

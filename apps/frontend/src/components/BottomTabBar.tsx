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
//
// On the visual language of the ledger home: the active tab's icon sits in
// an accent-tint pill (the app's tile shape), labels are sentence case at
// the meta size, and the Queue count is a CountChip-shaped badge in the
// accent. The camera in the centre is the app's one scan button on a phone.
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
          `relative flex min-h-[56px] flex-col items-center justify-center gap-1 pb-1 pt-1.5 text-[11px] font-semibold transition-colors ${
            isActive ? 'text-accent-text' : 'text-ink-muted hover:text-ink'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`relative flex h-7 w-14 items-center justify-center rounded-pill transition-colors ${isActive ? 'bg-accent-tint' : ''}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              {badge != null && badge > 0 && (
                <span
                  data-testid="queue-badge"
                  className="absolute -top-1.5 end-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-bold leading-none tabular-nums text-surface-raised ring-2 ring-surface-raised"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            {label}
          </>
        )}
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
            className="-mt-5 w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-surface-raised shadow-lg border-4 border-surface-raised flex items-center justify-center transition-all active:scale-95"
          >
            <Camera size={24} strokeWidth={2.5} />
          </button>
        </li>
        {rightTabs.map(renderTab)}
      </ul>
    </nav>
  );
};

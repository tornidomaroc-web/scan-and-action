import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, ClipboardList, Settings, Camera } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

interface BottomTabBarProps {
  pendingCount?: number;
  /** Fires the camera capture flow directly (no intermediate modal). */
  onScan?: () => void;
}

// Mobile-only (<md) navigation, in the visual language of 2026-09-26: a
// floating pill, lifted off the page by the raised shadow and a hairline
// ring, with four round buttons and the scan button as the accent circle at
// its centre. Activity is intentionally absent: on mobile it lives inside
// Home. The desktop rail is a separate component and keeps its own nav.
//
// Each tab is a circle: the active one is filled with the accent tint and
// draws the icon in the accent text colour; the others draw it muted. The
// label is for screen readers, the way the design's rail names nothing on
// screen. The Queue count is a small accent badge on its circle.
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
    <li key={to} className="flex flex-1 justify-center">
      <NavLink
        to={to}
        aria-label={label}
        className={({ isActive }) => `flex items-center justify-center transition-colors motion-reduce:transition-none ${isActive ? 'text-accent-text' : 'text-ink-muted hover:text-ink'}`}
      >
        {({ isActive }) => (
          <span className={`relative flex h-12 w-12 items-center justify-center rounded-nav ${isActive ? 'bg-accent-tint' : ''}`}>
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
            <span className="sr-only">{label}</span>
            {badge != null && badge > 0 && (
              <span
                data-testid="queue-badge"
                className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-bold leading-none tabular-nums text-on-accent ring-2 ring-surface-raised"
              >
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
        )}
      </NavLink>
    </li>
  );

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-[60] rounded-pill bg-surface-raised px-2 py-2 shadow-raised ring-1 ring-line"
      data-tab-bar
    >
      <ul className="flex items-center justify-around">
        {leftTabs.map(renderTab)}
        {/* Centre scan slot: the one scan button on a phone, the accent circle. */}
        <li className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={onScan}
            aria-label={s.scanWithCamera}
            data-testid="scan-slot"
            className="flex h-14 w-14 items-center justify-center rounded-nav bg-accent text-on-accent shadow-raised transition-all hover:bg-accent-hover active:scale-95 motion-reduce:transition-none"
          >
            <Camera size={24} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </li>
        {rightTabs.map(renderTab)}
      </ul>
    </nav>
  );
};

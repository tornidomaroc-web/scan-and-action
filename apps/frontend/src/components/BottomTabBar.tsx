import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, ClipboardList, Settings } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

interface BottomTabBarProps {
  pendingCount?: number;
}

// Mobile-only (<md) bottom navigation. Activity is intentionally absent:
// on mobile it lives inside Home's Recent Activity section. The desktop
// sidebar is a separate component and keeps its own nav.
export const BottomTabBar: React.FC<BottomTabBarProps> = ({ pendingCount = 0 }) => {
  const s = useStrings();

  const tabs = [
    { to: '/dashboard', icon: Home, label: s.home },
    { to: '/search', icon: Search, label: s.searchTab },
    { to: '/queue', icon: ClipboardList, label: s.queueTab, badge: pendingCount },
    { to: '/settings', icon: Settings, label: s.settings },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-[60] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map(({ to, icon: Icon, label, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`
              }
            >
              <span className="relative">
                <Icon size={22} strokeWidth={2.5} />
                {badge != null && badge > 0 && (
                  <span
                    data-testid="queue-badge"
                    className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center leading-none"
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

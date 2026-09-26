import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  Activity,
  Search,
  ClipboardList,
  Settings,
  Plus,
  Moon,
  Sun,
  LogOut,
  RefreshCw,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { LanguageSwitcher } from './LanguageSwitcher';
import { BrandMark } from './BrandMark';
import { syncThemeColor } from '../lib/themeColor';

interface SidebarProps {
  onNewScan: () => void;
  onRefreshPlan?: () => void;
  plan?: 'FREE' | 'PRO';
}

// ============================================================================
// The web rail (md and up), in the visual language of 2026-09-26: a narrow
// column of circles. The mark on top, the scan button as the accent circle,
// the six destinations as circles in a pill track (the active one filled with
// the accent), the theme toggle, and the account circle at the bottom, which
// opens a card with the name, the plan, the language switcher, Settings and
// Sign out.
//
// Everything the old 280px sidebar did is still here; only the shape changed.
// The account card is always in the DOM (hidden when closed), so the name and
// the plan label are rendered whatever the state of the menu, as
// sidebarLocalization.test.tsx reads them.
// ============================================================================

export const Sidebar: React.FC<SidebarProps> = ({ onNewScan, onRefreshPlan, plan }) => {
  const s = useStrings();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem('theme', newTheme);
    syncThemeColor(newTheme);
  };

  const navItems = [
    // /dashboard is the ledger home; the old dashboard lives at /overview.
    { to: '/dashboard', icon: Home, label: s.home, end: true },
    { to: '/overview', icon: LayoutDashboard, label: s.dashboard },
    { to: '/activity', icon: Activity, label: s.recentActivity },
    { to: '/search', icon: Search, label: s.search },
    { to: '/queue', icon: ClipboardList, label: s.queue },
    { to: '/settings', icon: Settings, label: s.settings },
  ];

  const userName = user?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshPlan) {
      onRefreshPlan();
      showToast(s.planRefreshChecking, 'info');
    }
  };

  const circle = 'flex h-11 w-11 items-center justify-center rounded-nav transition-colors motion-reduce:transition-none';

  return (
    <aside className="flex h-screen w-24 flex-col items-center gap-3 border-e border-line-sidebar bg-surface-raised py-5" data-rail>
      <BrandMark size={40} className="rounded-[12px]" />

      {/* The one primary action, the accent circle. */}
      <button
        type="button"
        onClick={onNewScan}
        aria-label={s.newScan}
        title={s.newScan}
        className="mt-1 flex h-12 w-12 items-center justify-center rounded-nav bg-accent text-on-accent shadow-raised transition-colors hover:bg-accent-hover motion-reduce:transition-none"
      >
        <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
        <span className="sr-only">{s.newScan}</span>
      </button>

      <nav aria-label={s.header} className="mt-2 flex flex-col gap-1.5 rounded-pill bg-surface-muted p-1.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            className={({ isActive }) => `${circle} ${isActive ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-surface-alt hover:text-ink'}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? s.switchDark : s.switchLight}
        title={theme === 'light' ? s.switchDark : s.switchLight}
        className={`${circle} bg-surface-muted text-ink-secondary hover:text-ink`}
      >
        {theme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
      </button>

      <div className="relative">
        {/* The account card. Always rendered, hidden when closed. */}
        <div
          hidden={!isMenuOpen}
          className="absolute bottom-full start-0 z-[100] mb-2 w-64 rounded-panel bg-surface-raised p-3 shadow-raised ring-1 ring-line"
          data-rail-account
        >
          <div className="flex items-center gap-3 px-1 py-1">
            <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-nav bg-accent-tint text-sm font-bold text-accent-text">
              {userName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              {/* Direction stated on the truncating box itself; the same value
                  SettingsScreen shows (sidebarLocalization.test.tsx). */}
              <p dir="auto" className="text-sm font-semibold text-ink" style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userName}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="m-0 text-xs text-ink-muted">
                  {plan === 'PRO' ? s.proPlan : plan === 'FREE' ? s.freePlan : s.verifyingAccount}
                </p>
                {plan === 'FREE' && (
                  <button type="button" onClick={handleRefreshClick} className="flex items-center p-0.5 text-ink-muted opacity-70 hover:opacity-100" title="Refresh subscription status">
                    <RefreshCw size={10} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="my-2 border-t border-divider" />
          <div className="px-1 py-1"><LanguageSwitcher /></div>
          <button type="button" onClick={() => { navigate('/settings'); setIsMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-card px-2 py-2 text-start text-sm text-ink hover:bg-surface-alt">
            <User size={16} className="text-ink-muted" aria-hidden="true" /> {s.myProfile}
          </button>
          <button type="button" onClick={() => { navigate('/settings'); setIsMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-card px-2 py-2 text-start text-sm text-ink hover:bg-surface-alt">
            <Settings size={16} className="text-ink-muted" aria-hidden="true" /> {s.settings}
          </button>
          <div className="my-2 border-t border-divider" />
          <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-card px-2 py-2 text-start text-sm font-semibold text-danger-text hover:bg-danger-tint">
            <LogOut size={16} aria-hidden="true" /> {s.signOut}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((v) => !v)}
          aria-expanded={isMenuOpen}
          aria-label={userName}
          className={`${circle} ${isMenuOpen ? 'bg-accent text-on-accent' : 'bg-accent-tint text-accent-text hover:bg-accent-tint-2'} text-sm font-bold`}
        >
          {userName.charAt(0).toUpperCase()}
        </button>
      </div>
    </aside>
  );
};

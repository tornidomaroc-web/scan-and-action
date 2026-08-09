import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Settings,
  Plus,
  LogOut,
  User,
  Zap,
  Sun,
  Moon,
  ChevronUp,
  RefreshCw,
  Activity
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { LanguageSwitcher } from './LanguageSwitcher';

interface SidebarProps {
  onNewScan: () => void;
  onRefreshPlan?: () => void;
  plan?: 'FREE' | 'PRO';
}

export const Sidebar: React.FC<SidebarProps> = ({ onNewScan, onRefreshPlan, plan }) => {
  const s = useStrings();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', newTheme);
  };

  const navItems = [
    { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: s.dashboard, end: true },
    { to: '/activity', icon: <Activity size={20} />, label: s.recentActivity },
    { to: '/search', icon: <Search size={20} />, label: s.search },
    { to: '/queue', icon: <ClipboardList size={20} />, label: s.queue },
    { to: '/settings', icon: <Settings size={20} />, label: s.settings },
  ];

  const userName = user?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNewScanClick = () => {
    onNewScan();
  };

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshPlan) {
      onRefreshPlan();
      showToast(s.planRefreshChecking, 'info');
    }
  };

  return (
    <aside style={{
      width: '260px',
      height: '100vh',
      backgroundColor: 'var(--card)',
      borderInlineEnd: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      flexShrink: 0,
      zIndex: 50,
      transition: 'all var(--transition-speed) ease'
    }}>
      {/* Branding */}
      <div style={{ padding: '32px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', background: 'var(--accent)', borderRadius: 'var(--sa-radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="white" />
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>{s.header}</span>
      </div>

      {/* Primary Action */}
      <div style={{ padding: '0 16px 24px 16px' }}>
        <button
          onClick={handleNewScanClick}
          className="btn-primary"
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <Plus size={18} />
          {s.newScan}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Theme Toggle & User Info */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '4px' }}>
          <LanguageSwitcher />
        </div>
        <button
          onClick={toggleTheme}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderRadius: 'var(--sa-radius-nav)',
            background: 'var(--nav-hover)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all var(--transition-speed) ease'
          }}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          {theme === 'light' ? s.switchDark : s.switchLight}
        </button>

        <div style={{ position: 'relative' }}>
          {/* Dropup Menu */}
          {isMenuOpen && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--sa-radius-card)',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
              zIndex: 100,
              marginBottom: '8px'
            }}>
              <button
                onClick={() => { navigate('/settings'); setIsMenuOpen(false); }}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'start', fontSize: '14px', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <User size={16} color="var(--text-secondary)" /> {s.myProfile}
              </button>
              <button
                onClick={() => { navigate('/settings'); setIsMenuOpen(false); }}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'start', fontSize: '14px', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Settings size={16} color="var(--text-secondary)" /> {s.settings}
              </button>
              <div style={{ borderTop: '1px solid var(--border)' }} />
              <button
                onClick={handleLogout}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'start', fontSize: '14px', color: 'var(--sa-danger)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <LogOut size={16} /> {s.signOut}
              </button>
            </div>
          )}

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px',
              borderRadius: 'var(--sa-radius-nav)',
              background: isMenuOpen ? 'var(--nav-hover)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'background var(--transition-speed)'
            }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem', flexShrink: 0 }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'start' }}>
              {/* Same value as SettingsScreen.tsx:69 (`user.email.split('@')[0]`),
                  in a box that truncates — so it takes the same dir="auto".

                  WHY THE APP-WIDE GUARD CANNOT SEE THIS LINE, in case someone
                  later deletes the attribute and finds every check still green.
                  tests/rtlTruncation.test.ts misses it TWICE over, and adding
                  `userName` to its allowlist would close neither:
                    1. TRUNCATING_ELEMENT keys on the `truncate` CLASS token. This
                       box truncates via three inline style properties, so it is
                       never scanned at all — it is the only such box in src
                       (`git grep -c textOverflow -- apps/frontend/src` → 1).
                    2. `userName` is deliberately OUT of USER_DATA, because the
                       identifier also plausibly names an i18n label, and a guard
                       that fires on label spans gets suppressed.
                  So it is guarded where that file says such cases belong — per
                  screen, at the DOM level, by a human who decided which it is:
                  tests/sidebarLocalization.test.tsx. That is the same place
                  SettingsScreen's copy is guarded (settingsPreferences.test.tsx:167). */}
              <p dir="auto" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  {/* `verifyingAccount` ("جارٍ التحقق من حالة الحساب…"), not a new
                      key: the same in-flight account check UploadModal.tsx:85
                      already shows while `plan` is undefined. Reusing it keeps
                      one approved wording for one state in all three locales. */}
                  {plan === 'PRO' ? s.proPlan : plan === 'FREE' ? s.freePlan : s.verifyingAccount}
                </p>
                {plan === 'FREE' && (
                  <button
                    onClick={handleRefreshClick}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.6 }}
                    title="Refresh subscription status"
                  >
                    <RefreshCw size={10} color="var(--text-secondary)" />
                  </button>
                )}
              </div>
            </div>
            <ChevronUp size={16} color={isMenuOpen ? 'var(--nav-active-text)' : 'var(--text-secondary)'} />
          </button>
        </div>
      </div>
    </aside>
  );
};

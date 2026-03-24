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
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  onNewScan: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNewScan }) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
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
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard', end: true },
    { to: '/search', icon: <Search size={20} />, label: 'Search' },
    { to: '/queue', icon: <ClipboardList size={20} />, label: 'Review Queue' },
    { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  const userName = user?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNewScanClick = () => {
    console.log('DEBUG: New Scan button clicked in Sidebar');
    onNewScan();
  };

  return (
    <aside style={{ 
      width: '260px', 
      height: '100vh', 
      backgroundColor: 'var(--card)', 
      borderRight: '1px solid var(--border)',
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
        <div style={{ width: '36px', height: '36px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="white" />
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Scan & Action</span>
      </div>

      {/* Primary Action */}
      <div style={{ padding: '0 16px 24px 16px' }}>
        <button 
          onClick={handleNewScanClick}
          className="btn-primary" 
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <Plus size={18} />
          New Scan
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
        <button 
          onClick={toggleTheme}
          style={{ 
            width: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: '10px 16px', 
            borderRadius: '8px',
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
          {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
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
              borderRadius: '12px', 
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
              zIndex: 100,
              marginBottom: '8px'
            }}>
              <button 
                onClick={() => { navigate('/profile'); setIsMenuOpen(false); }}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <User size={16} color="var(--text-secondary)" /> My Profile
              </button>
              <button 
                onClick={() => { navigate('/settings'); setIsMenuOpen(false); }}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Settings size={16} color="var(--text-secondary)" /> Settings
              </button>
              <div style={{ borderTop: '1px solid var(--border)' }} />
              <button 
                onClick={handleLogout}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <LogOut size={16} /> Sign Out
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
              borderRadius: '8px',
              background: isMenuOpen ? 'var(--nav-hover)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'background var(--transition-speed)'
            }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem', flexShrink: 0 }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Free Plan</p>
            </div>
            <ChevronUp size={16} color={isMenuOpen ? 'var(--nav-active-text)' : 'var(--text-secondary)'} />
          </button>
        </div>
      </div>
    </aside>
  );
};

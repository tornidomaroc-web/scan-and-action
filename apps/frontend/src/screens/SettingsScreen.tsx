import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  User,
  CreditCard,
  ShieldCheck,
  Zap,
  ChevronRight,
  SlidersHorizontal,
  Globe,
  Sun,
  Moon,
  LogOut,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PaywallModal } from '../components/PaywallModal';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { CountChip } from '../components/ui/CountChip';
import { IconTile } from '../components/ui/IconTile';
import { Panel } from '../components/ui/Panel';
import { useStrings } from '../i18n/useStrings';
import { useTheme } from '../hooks/useTheme';
import { isNativePlatform } from '../native/shell';

// Settings on the ledger home's visual language: four Panels (who you are,
// preferences, plan, deletion), each row an IconTile beside its label and its
// control. The old "System information / Coming soon" panel is gone: it
// promised API keys and webhooks, which is an admin panel's promise, not a
// money app's, and Apple 2.1(a) forbids placeholder content (WORK-QUEUE, APPLE
// TRACK). On native the plan card reflects entitlement only (INVARIANT).
export const SettingsScreen = () => {
  const s = useStrings();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };
  // Safe extraction with fallback to {} if context is missing
  const context = useOutletContext<{ plan?: 'FREE' | 'PRO', onSuccess?: () => void }>() || {};
  const { plan = 'FREE' } = context;

  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const userName = user?.email?.split('@')[0] || 'User';
  const ThemeIcon = theme === 'light' ? Moon : Sun;

  const sectionTitle = 'text-[15px] font-bold text-ink';
  const row = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3';
  const rowLabel = 'flex items-center gap-3 text-sm font-semibold text-ink-secondary';
  const pillButton = 'inline-flex min-h-[40px] items-center gap-2 rounded-pill bg-surface-muted px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt active:scale-[0.99]';

  return (
    <div className="mx-auto w-full max-w-xl pb-6 animate-in fade-in duration-500">
      <header className="mb-6">
        <h1 className="text-title-lg font-semibold tracking-tight text-ink">{s.workspaceSettings}</h1>
        <p className="mt-1 text-sm text-ink-muted">{s.manageAccount}</p>
      </header>

      <div className="space-y-4">
        {/* Who you are */}
        <Panel className="p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-pill bg-accent text-lg font-bold text-on-accent">
              {userName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              {/* A person's name is natural language of unknown direction — the
                  exact case dir="auto" exists for. On the truncating element
                  itself, with no isolate child to swallow it. */}
              <h3 dir="auto" className="truncate text-[15px] font-semibold text-ink">{userName}</h3>
              {/* dir="ltr", deliberately NOT dir="auto": an email is an identifier
                  with LTR structure. Under "auto" an Arabic local part makes the
                  box RTL and "@gmail.com" lands on the wrong side, a correct bidi
                  result that reads as a corrupted address. Under "ltr" the domain
                  stays where a reader expects it and the ellipsis eats the tail.
                  `title` keeps the full value on desktop hover. */}
              <p dir="ltr" className="truncate text-xs font-medium text-ink-muted" title={user?.email}>{user?.email}</p>
            </div>
          </div>
          <div className={`${row} mt-2 border-t border-divider`}>
            <span className={rowLabel}><IconTile icon={User} size="sm" />{s.accountType}</span>
            <CountChip>{s.personalWorkspace}</CountChip>
          </div>
          {/* On mobile the desktop sidebar (and its sign-out) is hidden,
              so this is the only way to log out on a phone. */}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill bg-surface-muted text-sm font-semibold text-ink transition-colors hover:bg-surface-alt active:scale-[0.99]"
          >
            <LogOut size={18} aria-hidden="true" />
            {s.signOut}
          </button>
        </Panel>

        {/* Preferences — on mobile this is the only home for language &
            theme: the desktop sidebar (which also hosts them) is hidden
            below md and the bottom tab bar carries no controls. */}
        <Panel className="p-4">
          <h3 className={`${sectionTitle} flex items-center gap-3`}>
            <IconTile icon={SlidersHorizontal} tone="accent" size="sm" />
            {s.preferences}
          </h3>
          <div className="mt-2 divide-y divide-divider">
            <div className={row}>
              <span className={rowLabel}><IconTile icon={Globe} size="sm" />{s.language}</span>
              <LanguageSwitcher />
            </div>
            <div className={row}>
              <span className={rowLabel}><IconTile icon={ThemeIcon} size="sm" />{s.appearance}</span>
              <button type="button" onClick={toggleTheme} className={pillButton}>
                <ThemeIcon size={16} aria-hidden="true" />
                {theme === 'light' ? s.switchDark : s.switchLight}
              </button>
            </div>
          </div>
        </Panel>

        {/* The plan */}
        <Panel className="p-4">
          <h3 className={`${sectionTitle} flex items-center gap-3`}>
            <IconTile icon={CreditCard} tone="accent" size="sm" />
            {s.subscriptionBilling}
          </h3>

          {plan === 'PRO' ? (
            <div className="mt-4 flex items-start gap-3 rounded-tile bg-success-tint p-4">
              <IconTile icon={ShieldCheck} tone="success" size="sm" />
              <div className="min-w-0">
                <h4 className="text-[15px] font-semibold text-success-text">{s.proActive}</h4>
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{s.proActiveDesc}</p>
              </div>
            </div>
          ) : isNativePlatform() ? (
            // Native build: anti-steering. Reflect entitlement state ONLY — no
            // pricing, no checkout/external link, no "Go PRO" upsell CTA. The web
            // upsell (Paddle checkout) lives in the branch below and is unchanged.
            <div className="mt-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Zap} size="sm" />
                <h4 className="text-[15px] font-semibold text-ink">{s.freeTier}</h4>
              </div>
              <p className="mt-3 rounded-tile bg-warning-tint p-3 text-sm font-medium leading-relaxed text-warning-text">{s.freeLimit}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{s.proAutoUnlock}</p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Zap} size="sm" />
                <h4 className="text-[15px] font-semibold text-ink">{s.freeTier}</h4>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{s.upgradeDesc}</p>
              <p className="mt-3 rounded-tile bg-warning-tint p-3 text-sm font-medium leading-relaxed text-warning-text">{s.freeLimit}</p>
              <ul className="mt-4 space-y-2">
                {[s.paywallFeatureUnlimited, s.paywallFeatureBatch, s.paywallFeatureFaster].map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm font-medium text-ink-secondary">
                    <ShieldCheck size={16} className="flex-none text-accent-text" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setIsPaywallOpen(true)}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-accent text-sm font-bold text-on-accent shadow-card transition-all hover:bg-accent-hover active:scale-[0.99]"
              >
                {s.goPro}
                <ChevronRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
              </button>
            </div>
          )}
        </Panel>

        {/* Danger Zone — account deletion (required by Google Play & Apple).
            Platform-independent: shown on web and native alike. */}
        <Panel className="p-4">
          <h3 className={`${sectionTitle} flex items-center gap-3`}>
            <IconTile icon={Trash2} tone="danger" size="sm" />
            {s.dangerZone}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{s.deleteAccountDesc}</p>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill bg-danger text-sm font-bold text-surface-raised transition-colors active:scale-[0.99]"
          >
            <Trash2 size={18} aria-hidden="true" />
            {s.deleteAccount}
          </button>
        </Panel>
      </div>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
      />

      <DeleteAccountModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onDeleted={() => navigate('/login')}
      />
    </div>
  );
};

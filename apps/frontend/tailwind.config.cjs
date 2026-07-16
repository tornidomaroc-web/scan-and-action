module.exports = {
  // The theme toggle (Sidebar) and the index.html boot script drive a `dark`
  // class on <html>; without this, Tailwind `dark:` styles follow the OS
  // instead and the toggle only half-works.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Design tokens surfaced as utilities. All values reference the --sa-*
      // CSS variables in src/styles/tokens.css (the single source of truth), so
      // they adapt to light/dark automatically. These are ADDITIVE names that do
      // NOT shadow Tailwind's built-in palette (blue/slate/etc.), so existing
      // screens using raw utilities are visually unchanged. New/migrated
      // components (PR-B onward) use these token utilities.
      colors: {
        accent: {
          DEFAULT: 'var(--sa-accent)',
          hover: 'var(--sa-accent-hover)',
          text: 'var(--sa-accent-text)',
          tint: 'var(--sa-accent-tint)',
          'tint-2': 'var(--sa-accent-tint-2)',
          border: 'var(--sa-accent-border)',
        },
        surface: {
          DEFAULT: 'var(--sa-surface)',
          raised: 'var(--sa-surface-raised)',
          alt: 'var(--sa-surface-alt)',
          muted: 'var(--sa-surface-muted)',
        },
        line: {
          DEFAULT: 'var(--sa-line)',
          strong: 'var(--sa-line-strong)',
          sidebar: 'var(--sa-line-sidebar)',
        },
        divider: 'var(--sa-divider)',
        // Modal/sheet scrim. Same value in both modes (see tokens.css).
        overlay: 'var(--sa-overlay)',
        ink: {
          DEFAULT: 'var(--sa-ink)',
          secondary: 'var(--sa-ink-secondary)',
          tertiary: 'var(--sa-ink-tertiary)',
          muted: 'var(--sa-ink-muted)',
          faint: 'var(--sa-ink-faint)',
          fainter: 'var(--sa-ink-fainter)',
        },
        success: {
          DEFAULT: 'var(--sa-success)',
          strong: 'var(--sa-success-strong)',
          text: 'var(--sa-success-text)',
          tint: 'var(--sa-success-tint)',
        },
        warning: {
          DEFAULT: 'var(--sa-warning)',
          text: 'var(--sa-warning-text)',
          tint: 'var(--sa-warning-tint)',
        },
        danger: {
          DEFAULT: 'var(--sa-danger)',
          text: 'var(--sa-danger-text)',
          tint: 'var(--sa-danger-tint)',
        },
      },
      borderRadius: {
        // Additive names (Tailwind keeps its defaults: sm/md/lg/xl/2xl/full).
        nav: 'var(--sa-radius-nav)',   // 8px
        btn: 'var(--sa-radius-btn)',   // 9px
        card: 'var(--sa-radius-card)', // 12px
        pill: 'var(--sa-radius-pill)', // 999px
      },
      boxShadow: {
        // Keep the pre-existing 'modal'; add the quiet token elevations.
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        card: 'var(--sa-shadow-card)',
        raised: 'var(--sa-shadow-raised)',
        lg: 'var(--sa-shadow-lg)',
      },
      // ── The overlay ladder (documented in D8b PR-2) ───────────────────
      // Until now these were hand-picked magic numbers spread across 8
      // createPortal sites in 6 components, with no written rule — "undocumented
      // folklore". Every value below is EXACTLY what already ships, so naming
      // them changes no paint order. Additive: components adopt a name as they
      // are restyled (D8b PR-2 adopts `modal-top` in DeleteAccountModal).
      //
      // The gap between `modal` and `modal-top` is LOAD-BEARING, not arbitrary:
      // UploadModal (modal) and CaptureSheet (modal) each render <PaywallModal>
      // (modal-top) INSIDE their own portal, and the gap is what makes the
      // paywall paint above its opener.
      //
      // ⚠️ Known collision, documented not "fixed": DeleteAccountModal and
      // PaywallModal are BOTH `modal-top` and are mounted as siblings from the
      // same parent (SettingsScreen.tsx:263 and :268) with independent state. If
      // both were ever open, paint order would fall back to DOM order. No path
      // opens both today, so this is undefined-by-design rather than a live bug —
      // a speculative reshuffle here would buy nothing and risk real regressions.
      //
      // A SECOND, INDEPENDENT ordering exists: native/overlayStack.ts is a
      // MOUNT-ORDER LIFO driving the Android back button. Nothing keeps it in
      // sync with this visual ladder. A future shared shell should own both.
      zIndex: {
        chrome: '60',           // Layout header, BottomTabBar
        tray: '70',             // ProcessingTray collapsed chip
        'tray-panel': '9000',   // ProcessingTray expanded panel
        modal: '10000',         // UploadModal, CaptureSheet — modals that OPEN others
        'modal-top': '11000',   // PaywallModal, DeleteAccountModal — paint above a modal
        celebration: '12000',   // ProWelcome
      },
      fontFamily: {
        // Real loaded stack. Consistent with the body font-family in index.css.
        sans: ['Inter', 'IBM Plex Sans Arabic', 'system-ui', '-apple-system',
               'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Additive named steps from the type scale (do NOT collide with
        // Tailwind's xs/sm/base/lg/... so existing text-* utilities are intact).
        kpi: ['32px', { lineHeight: '1', letterSpacing: '-0.025em' }],
        'title-lg': ['24px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        section: ['15px', { lineHeight: '1.4' }],
        label: ['12px', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
}

import { defineConfig, defaultExclude } from 'vitest/config';

// ============================================================================
// Backend vitest config — exists for ONE reason: keep dist/ out of collection.
// ============================================================================
// tsconfig.json compiles `src/**/*`, which includes the co-located
// `src/**/*.test.ts` files, so `npm run build` emits `dist/**/*.test.js`
// alongside the real output. Vitest then collects those compiled copies:
// defaultInclude is `**/*.{test,spec}.?(c|m)[jt]s?(x)`, which matches them.
//
// They cannot run. The emitted CommonJS calls `require('vitest')`, and vitest
// refuses that with "Vitest cannot be imported in a CommonJS module using
// require()", so each one reports as a FAILED FILE with (0 test). Locally that
// is 20 phantom failures on top of a fully green suite.
//
// Why this only bites now: vitest 4 narrowed its built-in exclude list to
// ["**/node_modules/**", "**/.git/**"]. Vitest 1-3 shipped "**/dist/**" in
// defaultExclude, so this was covered for free. Verified against the installed
// copy at node_modules/vitest/dist/chunks/defaults.*.js.
//
// CI has never seen it: .github/workflows/ci.yml runs `npm test` BEFORE
// `npm run build`, so dist/ does not exist yet when the suite is collected.
// This is purely a local-developer papercut — and a misleading one, because a
// build-then-test cycle reports 20 failures that are not regressions.
//
// SCOPE: this file adds an exclude and nothing else. `include` is deliberately
// left at its default so the set of REAL test files collected is unchanged;
// `defaultExclude` is spread rather than replaced so node_modules and .git stay
// excluded. dist/ is gitignored (.gitignore:30), so nothing tracked is skipped.
// ============================================================================

export default defineConfig({
  test: {
    exclude: [...defaultExclude, '**/dist/**'],
  },
});

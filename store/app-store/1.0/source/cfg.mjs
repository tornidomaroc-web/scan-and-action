// node cfg.mjs list            -> the screen names a native app can reach
// node cfg.mjs <name> <lang> <theme> <report-url>  -> the iOS config line
import { SCREENS } from './screens.mjs';
const [, , name, lang, theme, report] = process.argv;
if (name === 'list') { console.log(SCREENS.filter((s) => !s.web).map((s) => s.name).join(' ')); process.exit(0); }
const sc = SCREENS.find((s) => s.name === name);
const cfg = { lang, theme, route: sc.route, signedOut: !!sc.signedOut, verify: sc.verify, jobs: !!sc.jobs, steps: sc.steps || [], reportDelay: sc.wait || 6000, report };
console.log(`window.SA_PROOF = ${JSON.stringify(cfg)};`);

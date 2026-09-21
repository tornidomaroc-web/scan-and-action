/* eslint-disable no-console */
// ============================================================================
// TEXT-CONTRAST SWEEP FOR THE LANDING ROUTE, AND THE FIXED-WIDTH FRAME IT NEEDS.
// ============================================================================
// This is NOT a unit test and CI does not run it. It is the instrument behind
// every browser-measured contrast figure quoted in LandingScreen.tsx, in
// landingTextContrast.test.tsx and on WORK-QUEUE.md. It lives in the repository
// for one reason: a measurement whose instrument cannot be re-run is a claim
// with no command behind it, and this repository's rule is to cite the command
// or drop the claim.
//
// WHAT IT IS FOR, given that landingTextContrast.test.tsx already guards colour
// pairs from source. That file cannot see four things, and each one has already
// hidden a real defect or would have:
//   * OPACITY, which is what `/mo` shipped through at 2.55.
//   * INLINE STYLES. The footer sets `fontSize: '13px'` in a style attribute.
//   * INHERITED colour, size and weight from an ancestor rather than the element.
//   * RESPONSIVE SIZE VARIANTS. `sm:text-5xl` emits `.sm\:text-5xl`, so the
//     `.text-5xl` override in the index.css mobile block never applies to it.
//     Measured here: the h1 is 48px at a proven 700 viewport, not 28px.
//
// HOW TO RUN
//   1. npm run dev            (from apps/frontend)
//   2. Open http://localhost:5173/terms in Chrome. The host page must be
//      SAME-ORIGIN with the target or the frame's document is unreadable, and
//      using a page that is NOT the landing route means "am I measuring the
//      right document" is answerable rather than assumed.
//   3. Paste this whole file into the console, then:
//        await __SWEEP.install();
//        __SWEEP.proveWidths();          // refuse to read anything until true
//        __SWEEP.mutationControl();      // plant 6, require 6 FAIL, then reload
//        await __SWEEP.install();        // discard the mutants
//        __SWEEP.run();
//
// TWO THINGS THAT WILL LIE TO YOU, both hit while this was built.
//   * The driven tab reports `document.visibilityState === "hidden"`, so an
//     awaited requestAnimationFrame NEVER resolves. Nothing here awaits one:
//     layout is forced synchronously with getBoundingClientRect(), and the
//     width proof and the measurement happen inside ONE synchronous call so
//     nothing can change between proving the width and using it.
//   * A Chrome window will not go below 516px wide, which is why the target is
//     an iframe and not the window. The frame's own layout viewport is the
//     iframe's content box, independent of the window, and scrollbars are
//     suppressed inside it so clientWidth, innerWidth and the media queries
//     cannot disagree about what "480" means.
//
// SCOPE: TEXT ONLY. Non-text (SHAPE) contrast, WCAG 1.4.11, floor 3:1 for a
// control's own edge against its surface, is NOT measured. Silence from this
// instrument is not a pass for shape.
// ============================================================================

(function () {
  const DEFAULT_TARGET = 'http://localhost:5173/';
  // One width per layout regime, plus the narrowest wrap. Measured 2026-09-20:
  // the verdicts collapse to exactly TWO regimes split at 767 by the index.css
  // mobile block, not at any Tailwind breakpoint. 1280 and 480 alone would have
  // found every failure; the other three are kept because that collapse is a
  // finding about the page today, not a property of it, and a colour that
  // changes at `sm` would reopen the middle.
  const WIDTHS = [1280, 900, 700, 480, 360];

  const S = {};

  // ── colour ───────────────────────────────────────────────────────────────
  S.parse = function (s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter((x) => x.length).map(Number);
    if (p.length < 3 || p.some((n) => !isFinite(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  S.over = function (base, c, a) {
    return { r: c.r * a + base.r * (1 - a), g: c.g * a + base.g * (1 - a), b: c.b * a + base.b * (1 - a), a: 1 };
  };
  S.lum = function (c) {
    const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  S.ratio = function (a, b) {
    const x = S.lum(a), y = S.lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  S.hex = function (c) {
    const h = (v) => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
  };
  // WCAG 1.4.3. Large text is >= 24px, or >= 18.66px (14pt) at weight >= 700.
  S.floorFor = function (px, w) { return (px >= 24 || (px >= 18.66 && w >= 700)) ? 3 : 4.5; };

  S.key = function (el, fd) {
    const p = [];
    for (let e = el; e && e !== fd.body; e = e.parentElement) p.unshift(Array.prototype.indexOf.call(e.parentElement.children, e));
    return p.join('/');
  };
  S.desc = function (el) {
    const c = (typeof el.className === 'string' ? el.className : '').replace(/\s+/g, ' ').trim();
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c.slice(0, 120) : '');
  };
  /** The hero mock's card, found by walking UP from its own heading. */
  S.mockupRoot = function (fd) {
    const h3 = Array.prototype.find.call(fd.querySelectorAll('h3'), (h) => h.textContent.trim() === 'Starbucks Receipt');
    if (!h3) return null;
    for (let e = h3; e; e = e.parentElement) {
      const c = typeof e.className === 'string' ? e.className : '';
      if (c.indexOf('rounded-[32px]') !== -1) return e;
    }
    return null;
  };

  // ── the frame ────────────────────────────────────────────────────────────
  S.install = async function (url) {
    // TARGET is a PARAMETER because the localhost build and the served page are
    // different claims. Pass a production origin to re-measure what visitors get;
    // the host page must be SAME-ORIGIN with it or the frame is unreadable.
    const TARGET = url || window.__SWEEP_TARGET || DEFAULT_TARGET;
    const d = document;
    const old = d.getElementById('__sweep_frame');
    if (old) old.remove();
    d.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden;';
    d.body.style.cssText = 'margin:0;padding:0;overflow:hidden;';
    const f = d.createElement('iframe');
    f.id = '__sweep_frame';
    f.style.cssText = 'position:fixed;top:0;left:0;border:0;background:#fff;z-index:2147483647;width:1280px;height:900px;';
    const loaded = new Promise((res, rej) => {
      f.addEventListener('load', res, { once: true });
      setTimeout(() => rej(new Error('iframe load timeout')), 20000);
    });
    f.src = TARGET;
    d.documentElement.appendChild(f);
    await loaded;
    const fd = f.contentDocument;
    const t0 = Date.now();
    while (!fd.querySelector('h1') || !fd.querySelector('#pricing')) {
      if (Date.now() - t0 > 20000) throw new Error('the landing route never mounted inside the frame');
      await new Promise((r) => setTimeout(r, 100));
    }
    const st = fd.createElement('style');
    st.id = '__sweep_freeze';
    st.textContent =
      '*,*::before,*::after{transition:none!important;animation:none!important;transition-duration:0s!important;animation-duration:0s!important;}\n' +
      'html{scroll-behavior:auto!important;scrollbar-width:none!important;}\n' +
      'html::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}';
    fd.head.appendChild(st);
    await fd.fonts.ready;
    S.f = f;
    return {
      topUrl: location.href,
      topHasHero: /Stop typing receipts/.test(d.body.innerText),   // must be false
      frameHasHero: /Stop typing receipts/.test(fd.body.innerText), // must be true
      pinPresent: !!fd.querySelector('.sa-pin-light'),
      htmlClass: fd.documentElement.className,                      // must not contain "dark"
      survivingMutants: fd.querySelectorAll('[data-mutant]').length // must be 0
    };
  };

  /** A harness that cannot prove its own width is not a harness. */
  S.proveWidths = function () {
    const f = S.f, fd = f.contentDocument, fw = f.contentWindow;
    const rows = WIDTHS.map((w) => {
      f.style.width = w + 'px';
      void f.offsetWidth; void fd.documentElement.offsetWidth;
      fd.documentElement.getBoundingClientRect();
      const mq = (q) => fw.matchMedia(q).matches;
      return {
        target: w, clientWidth: fd.documentElement.clientWidth, innerWidth: fw.innerWidth,
        exactWidthMQ: mq('(width: ' + w + 'px)'),
        max767: mq('(max-width: 767px)'), min640: mq('(min-width: 640px)'),
        min768: mq('(min-width: 768px)'), min1024: mq('(min-width: 1024px)'),
        noHOverflow: fd.body.scrollWidth <= w
      };
    });
    const ok = rows.every((r) =>
      r.clientWidth === r.target && r.innerWidth === r.target && r.exactWidthMQ &&
      r.max767 === (r.target <= 767) && r.min640 === (r.target >= 640) &&
      r.min768 === (r.target >= 768) && r.min1024 === (r.target >= 1024) && r.noHOverflow);
    console.table(rows);
    return { allWidthsProven: ok, rows: rows };
  };

  // ── the sweep ────────────────────────────────────────────────────────────
  /**
   * Every element carrying a non-whitespace text node, with the background of
   * the nearest ancestor that paints one, every opacity on the path composited,
   * the derived floor and the ratio.
   *
   * The opacity model is FLATTENED: each background contributes at its own alpha
   * times the running product of opacity down the chain, and the text is painted
   * at the same product. That is exact for nesting where each opacity group sits
   * over an opaque backdrop, which is what this page has, and approximate for
   * interleaved groups. Any row with opacityProduct < 1 carries its chain so the
   * approximation is inspectable rather than silent.
   */
  S.collect = function (w) {
    const f = S.f, fd = f.contentDocument, fw = f.contentWindow;
    f.style.width = w + 'px';
    void f.offsetWidth; void fd.documentElement.offsetWidth;
    fd.documentElement.getBoundingClientRect();
    const before = { cw: fd.documentElement.clientWidth, iw: fw.innerWidth, mq: fw.matchMedia('(width: ' + w + 'px)').matches };

    const mock = S.mockupRoot(fd);
    const walker = fd.createTreeWalker(fd.body, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let n;
    while ((n = walker.nextNode())) { if (/\S/.test(n.data)) nodes.push(n); }

    const map = new Map(); const excluded = []; const enumSeq = [];
    for (const tn of nodes) {
      const el = tn.parentElement;
      const full = tn.data.replace(/\s+/g, ' ');
      const sample = full.trim();
      if (!el) { excluded.push({ reason: 'no-parent-element', el: null, text: sample }); continue; }
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
        excluded.push({ reason: 'script-or-style', el: S.desc(el), text: sample }); continue;
      }
      const cs = fw.getComputedStyle(el);
      if (el.getClientRects().length === 0) {
        excluded.push({ reason: 'not-rendered: no client rects (display:none)', el: S.desc(el), text: sample, display: cs.display }); continue;
      }
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
        excluded.push({ reason: 'visibility-' + cs.visibility, el: S.desc(el), text: sample }); continue;
      }
      enumSeq.push(full);
      if (map.has(el)) { const r = map.get(el); r.texts.push(sample); r.textNodeCount++; continue; }

      const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
      let bg = { r: 255, g: 255, b: 255, a: 1 }, cum = 1, nearest = null, nearestRaw = null;
      const opChain = []; let bgImg = null;
      for (const e of chain) {
        const s = fw.getComputedStyle(e);
        const op = parseFloat(s.opacity);
        if (isFinite(op) && op < 1) { cum *= op; opChain.push(S.desc(e).slice(0, 55) + ' @' + op); }
        const bc = S.parse(s.backgroundColor);
        if (bc && bc.a > 0) {
          bg = S.over(bg, bc, bc.a * cum); nearest = e; nearestRaw = s.backgroundColor;
          if (s.backgroundImage && s.backgroundImage !== 'none') bgImg = s.backgroundImage.slice(0, 70);
        }
      }
      const fc = S.parse(cs.color);
      if (!fc) { excluded.push({ reason: 'UNPARSEABLE-COLOR:' + cs.color, el: S.desc(el), text: sample }); enumSeq.pop(); continue; }
      const txt = S.over(bg, fc, fc.a * cum);
      const px = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10) || 400;
      const fl = S.floorFor(px, wt), ra = S.ratio(txt, bg);
      map.set(el, {
        w: w, key: S.key(el, fd), el: S.desc(el), tag: tag.toLowerCase(), texts: [sample], textNodeCount: 1,
        fontSizePx: px, fontWeight: wt, colorRaw: cs.color, colorEff: S.hex(txt),
        bgNearestEl: nearest ? S.desc(nearest).slice(0, 90) : null, bgNearestRaw: nearestRaw, bgEff: S.hex(bg),
        opacityChain: opChain, opacityProduct: +cum.toFixed(4), bgImage: bgImg,
        largeText: (px >= 24 || (px >= 18.66 && wt >= 700)),
        floor: fl, ratio: +ra.toFixed(4), verdict: ra >= fl ? 'PASS' : 'FAIL',
        mockup: !!(mock && mock.contains(el)), mutant: el.getAttribute('data-mutant') || null
      });
    }

    const rows = Array.from(map.values());
    const after = { cw: fd.documentElement.clientWidth, iw: fw.innerWidth, mq: fw.matchMedia('(width: ' + w + 'px)').matches };

    // CONTROL 1, closure. The denominator is derived independently of this
    // sweep's own selector: innerText is Chrome's rendering-aware extraction, so
    // if a rendered string is missing from what was enumerated, these two byte
    // strings diverge. It does NOT cover text injected by CSS `content:` on a
    // pseudo-element, which innerText also omits, so both sides would miss it.
    const strip = (s) => (s || '').toUpperCase().normalize('NFC').replace(/\s+/g, '');
    const enumStr = strip(enumSeq.join('')), itStr = strip(fd.body.innerText);
    let firstDiff = -1;
    if (enumStr !== itStr) {
      const L = Math.min(enumStr.length, itStr.length);
      firstDiff = L;
      for (let i = 0; i < L; i++) if (enumStr[i] !== itStr[i]) { firstDiff = i; break; }
    }
    const en = rows.reduce((s, r) => s + r.textNodeCount, 0);
    return {
      w: w, before: before, after: after,
      widthStable: before.cw === w && after.cw === w && before.iw === w && after.iw === w && before.mq && after.mq,
      totalTextNodes: nodes.length, enumeratedNodes: en, excludedNodes: excluded.length,
      unaccounted: nodes.length - en - excluded.length,
      closureOK: (nodes.length - en - excluded.length) === 0,
      elements: rows.length, innerTextMatches: enumStr === itStr, firstDiffIndex: firstDiff,
      mockupElements: rows.filter((r) => r.mockup).length,
      fails: rows.filter((r) => r.verdict === 'FAIL').length,
      rows: rows, excluded: excluded
    };
  };

  // ── CONTROL 2: mutation ──────────────────────────────────────────────────
  /**
   * Six known-failing texts planted at the six structural positions where
   * enumeration actually breaks. A control on ratios cannot test the
   * DENOMINATOR; only planting can. Colours are inline styles, not utilities,
   * because Tailwind only emits classes it finds in `content` files and an
   * absent class would silently inherit instead of failing.
   *
   * THE ONE THAT MATTERS is mut-op. Inside the `opacity-40` block it reads about
   * 2.5 and FAILS. Uncomposited, the identical pair reads about 17 and PASSES.
   * It is the only mutant whose verdict proves compositing is live rather than
   * merely present in the source.
   *
   * Throwaway: re-run install() afterwards and check survivingMutants is 0.
   */
  S.mutationControl = function () {
    const fd = S.f.contentDocument;
    const mk = (tag, id, style, cls, txt) => {
      const e = fd.createElement(tag);
      e.setAttribute('data-mutant', id);
      if (style) e.setAttribute('style', style);
      if (cls) e.setAttribute('class', cls);
      e.textContent = txt;
      return e;
    };
    const mock = S.mockupRoot(fd);
    Array.prototype.find.call(mock.querySelectorAll('td'), (t) => t.textContent.trim() === 'Merchant')
      .appendChild(mk('span', 'mut-td', 'color:#CBD5E1', null, 'MUTANTTD'));
    const ul = fd.querySelector('#pricing .grid > div ul');
    ul.style.color = '#C8C8C8';
    const li = fd.createElement('li'); li.setAttribute('data-mutant', 'mut-li'); li.textContent = 'MUTANTLI';
    ul.appendChild(li);
    mock.querySelector('[class*="opacity-40"]')
      .appendChild(mk('p', 'mut-op', 'color:#0F172A;font-size:14px;font-weight:700', null, 'MUTANTOP'));
    fd.querySelector('h1').parentElement.querySelector('a')
      .appendChild(mk('span', 'mut-link', 'color:#334155', null, 'MUTANTLINK'));
    const d1 = fd.createElement('div'), d2 = fd.createElement('div'), d3 = fd.createElement('div');
    d3.appendChild(mk('span', 'mut-deep', 'color:#E2E8F0;font-size:14px;font-weight:700', null, 'MUTANTDEEP'));
    d2.appendChild(d3); d1.appendChild(d2); fd.querySelector('.bg-surface').appendChild(d1);
    fd.querySelector('#pricing').appendChild(mk('p', 'mut-arb', 'color:#94A3B8;font-weight:700', 'text-[10px]', 'MUTANTARB'));

    const ids = ['mut-td', 'mut-li', 'mut-op', 'mut-link', 'mut-deep', 'mut-arb'];
    const out = [1280, 700, 360].map((w) => {
      const r = S.collect(w);
      const m = {};
      r.rows.filter((x) => x.mutant).forEach((x) => { m[x.mutant] = x.verdict + '@' + x.ratio; });
      return {
        w: w, closureOK: r.closureOK, innerTextMatches: r.innerTextMatches,
        found6: ids.every((i) => m[i]),
        all6Fail: ids.every((i) => m[i] && m[i].indexOf('FAIL') === 0),
        mutants: m
      };
    });
    console.table(out);
    return { passed: out.every((o) => o.found6 && o.all6Fail && o.closureOK && o.innerTextMatches), runs: out };
  };

  // ── CONTROL 3 and 4, and the run ─────────────────────────────────────────
  /** Polarity located by STRUCTURE. The reassurance sentence appears twice. */
  S.polarity = function (run) {
    const fd = S.f.contentDocument;
    S.collect(run.w);
    const band = fd.querySelector('.bg-slate-900');
    const heroCol = fd.querySelector('h1').parentElement;
    const find = (el) => run.rows.find((r) => r.key === S.key(el, fd));
    const twinEl = Array.prototype.find.call(band.querySelectorAll('p'), (p) => p.textContent.indexOf('No credit card') !== -1);
    const heroEl = Array.prototype.find.call(heroCol.querySelectorAll('p'), (p) => p.textContent.indexOf('No credit card') !== -1);
    const plans = Array.prototype.map.call(fd.querySelectorAll('#pricing .grid > div'), (c) => find(c.querySelector('h3')));
    return {
      w: run.w,
      twin: find(twinEl), hero: find(heroEl), plans: plans,
      structural: twinEl !== heroEl && band.contains(twinEl) && !band.contains(heroEl)
    };
  };

  S.run = function () {
    const runs = WIDTHS.map((w) => S.collect(w));
    const pol = runs.map((r) => S.polarity(r));
    const summary = runs.map((r) => ({
      w: r.w, widthStable: r.widthStable, closureOK: r.closureOK, unaccounted: r.unaccounted,
      innerTextMatches: r.innerTextMatches, totalTextNodes: r.totalTextNodes,
      elements: r.elements, excluded: r.excludedNodes, mockupElements: r.mockupElements, fails: r.fails
    }));
    console.table(summary);
    console.table([].concat.apply([], runs.map((r) => r.rows.filter((x) => x.verdict === 'FAIL')))
      .map((x) => ({ w: x.w, text: x.texts.join(' ').slice(0, 34), ratio: x.ratio, floor: x.floor,
                     px: x.fontSizePx, wt: x.fontWeight, color: x.colorRaw, bg: x.bgEff,
                     mock: x.mockup, opacity: x.opacityProduct })));
    S.last = { runs: runs, polarity: pol, summary: summary };
    return {
      // Read NOTHING below this line until every one of these is true.
      control1_closure: summary.every((s) => s.closureOK && s.unaccounted === 0 && s.innerTextMatches),
      control3_polarity: pol.every((p) => p.structural && p.twin && p.hero && p.plans.every(Boolean)),
      control4_mockupCount: summary.every((s) => s.mockupElements === 13),
      widthsStable: summary.every((s) => s.widthStable),
      SHAPE_NOT_MEASURED: 'text only; silence here is not a pass for non-text contrast',
      summary: summary
    };
  };

  window.__SWEEP = S;
  console.log('__SWEEP ready. await __SWEEP.install(); __SWEEP.proveWidths(); __SWEEP.mutationControl(); await __SWEEP.install(); __SWEEP.run();');
})();

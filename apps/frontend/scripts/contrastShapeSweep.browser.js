/* eslint-disable no-console */
// ============================================================================
// NON-TEXT (SHAPE) CONTRAST. WCAG 1.4.11, floor 3:1. Extends __SWEEP.
// ============================================================================
// Load contrastSweep.browser.js first, then this. Same frame, same width proof,
// same opacity model. CI does not run either; they are instruments, checked in
// because a measurement whose instrument cannot be re-run is a claim with no
// command behind it.
//
// WHAT 1.4.11 ACTUALLY ASKS, which is narrower than "every edge needs 3:1":
//   (a) UI COMPONENTS: the visual information required to IDENTIFY a component
//       and its states. Exempt: inactive components, and appearance the USER
//       AGENT determines that the author has not modified.
//   (b) GRAPHICAL OBJECTS: the parts of a graphic required to UNDERSTAND the
//       content. Exempt: pure decoration, and presentations that are essential.
//
// THE DENOMINATOR SPLITS IN TWO, WITH DIFFERENT HONESTY AVAILABLE FOR EACH, and
// pretending otherwise is the trap this file exists to avoid.
//
//   P1, interactive components. Mechanically enumerable AND independently
//   cross-checkable: a tag/role selector on one side, the browser's own computed
//   `tabIndex` on the other. Two different derivations of one set, so a
//   disagreement is a real signal. It has already earned its place: the first
//   run disagreed 13 to 12, and the extra element was the BrandMark
//   `<svg role="presentation">`. The selector had tested `hasAttribute('role')`,
//   which is wrong — `presentation` REMOVES semantics, so an element carrying it
//   is the opposite of a component. Only interactive roles count. That bug would
//   have been invisible without the second derivation.
//
//   P2, everything that PAINTS a boundary. Complete as a SUPERSET: a background
//   with alpha, or a border with width and alpha. What is NOT decidable here is
//   1.4.11's scope test, the words "required to identify" and "required to
//   understand". No DOM query decides that. This file therefore reports the whole
//   superset and REFUSES to mark anything exempt on its own authority.
//   A ROW IN P2 IS NOT A DEFECT, AND SILENCE FROM P2 IS NOT A PASS.
//
// THE FAILURE MODE INVERTS RELATIVE TO THE TEXT SWEEP, which is why extent is
// carried beside every ratio. There the danger was a false NEGATIVE and innerText
// closed it. Here a superset yields false POSITIVES: measured on this page,
// 35 of 38 non-interactive painting elements sit below 3:1, and every one of them
// is a section band, a card or a hairline. Ordering that list by RATIO puts the
// wrong rows on top, which the board already recorded from observation: a card
// fill at 1.073 IS the visible edge while its border at 1.193 is not discernible.
// The higher ratio is the invisible one. ORDER BY EXTENT, NOT BY RATIO.
//
// EXTENT IS IN DEVICE PIXELS, and that is not pedantry. Chrome snaps border
// widths to whole DEVICE pixels, so with the browser zoomed to 80% a declared
// 1px border reports as 1.25 CSS px and a declared 4px as 3.75. Measured, not
// assumed: font-size, width and height all came back exactly as declared, so the
// zoom leaks into border extent ALONE. cssPx * devicePixelRatio undoes it and is
// the number "at one pixel extent counts for more than ratio" is about.
//
// NAMED EXCLUSIONS. Say these out loud wherever the output goes:
//   * SVG PAINT IS INVISIBLE HERE. This reads CSS box paint (background-color,
//     border-*). SVG paints with `fill` and `stroke`. `svgPaintCount()` counts
//     what is therefore unmeasured rather than leaving the count silently short.
//   * The hit-test probe is a SAMPLE at a step in pixels, not a proof: anything
//     thinner than the step can evade it.
//   * box-shadow is recorded as present or absent and never scored.
//   * Focus indicators: programmatic .focus() does not trigger :focus-visible on
//     a link, so focusProbe() alone is INDETERMINATE. Settle it from the CSSOM —
//     if no element on the route carries a focus utility, the user-agent ring is
//     intact and 1.4.11 exempts it explicitly.
//
// HOW TO RUN
//   await __SWEEP.install('https://<origin>/');   // host page must be same-origin
//   __SWEEP.proveWidths();                        // refuse to read anything until true
//   __SWEEP.shapeMutation();                      // 6 planted, 5 must fail and 1 must PASS
//   await __SWEEP.install('https://<origin>/');   // discard the mutants
//   __SWEEP.runShape();
//   __SWEEP.lastShape.polarity                    // failAnchor must be < 3, passAnchor >= 3
// ============================================================================

(function () {
  const S = window.__SWEEP;
  if (!S) throw new Error('load contrastSweep.browser.js first');

  const INTERACTIVE_TAG = /^(a|button|input|select|textarea|summary|details|option)$/;
  // Interactive ARIA roles ONLY. `presentation`, `img`, `banner` and friends are
  // deliberately absent: they are not components. See the header note.
  const INTERACTIVE_ROLE = /^(button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|combobox|listbox|slider|spinbutton|textbox|searchbox|treeitem|scrollbar)$/;
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

  /**
   * A stable structural path. DEFINED HERE rather than borrowed, because this
   * module must not depend on a helper name the base file happens to use: the
   * base calls its equivalent `S.key`, and an earlier draft of this file called
   * `S.pathOf` and threw "S.pathOf is not a function" the first time the two
   * COMMITTED files were run together. Verifying the pasted draft had not caught
   * it, because the draft defined the name itself.
   */
  S.pathOf = function (el, fd) {
    const p = [];
    for (let e = el; e && e !== fd.body; e = e.parentElement) {
      p.unshift(Array.prototype.indexOf.call(e.parentElement.children, e));
    }
    return p.join('/');
  };

  S.isInteractive = function (el) {
    if (INTERACTIVE_TAG.test(el.tagName.toLowerCase())) return true;
    const role = (el.getAttribute('role') || '').trim().toLowerCase();
    if (role && INTERACTIVE_ROLE.test(role)) return true;
    return el.tabIndex >= 0;
  };

  /** Composited colour BEHIND el (ancestors only) and the ancestors' opacity product. */
  S.backdrop = function (el, fw) {
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    let cum = 1;
    const chain = [];
    for (let e = el.parentElement; e; e = e.parentElement) chain.unshift(e);
    for (const e of chain) {
      const s = fw.getComputedStyle(e);
      const op = parseFloat(s.opacity);
      if (isFinite(op) && op < 1) cum *= op;
      const bc = S.parse(s.backgroundColor);
      if (bc && bc.a > 0) bg = S.over(bg, bc, bc.a * cum);
    }
    return { bg: bg, cum: cum };
  };

  S.rendered = function (el, fw) {
    if (el.getClientRects().length === 0) return false;
    const s = fw.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.visibility !== 'collapse';
  };

  S.shapeOf = function (el, fw) {
    const s = fw.getComputedStyle(el);
    const back = S.backdrop(el, fw);
    const own = parseFloat(s.opacity);
    const selfCum = back.cum * (isFinite(own) ? own : 1);

    const fillC = S.parse(s.backgroundColor);
    const fillAlpha = fillC ? fillC.a * selfCum : 0;
    const fill = fillAlpha > 0 ? S.over(back.bg, fillC, fillAlpha) : null;

    let maxW = 0, borderC = null, anyBorder = false;
    const widths = [];
    for (const sd of SIDES) {
      const w = parseFloat(s['border' + sd + 'Width']) || 0;
      const st = s['border' + sd + 'Style'];
      const c = S.parse(s['border' + sd + 'Color']);
      widths.push(w);
      if (w > 0 && st !== 'none' && st !== 'hidden' && c && c.a > 0) {
        anyBorder = true;
        if (w > maxW) { maxW = w; borderC = c; }
      }
    }
    const border = anyBorder && borderC ? S.over(back.bg, borderC, borderC.a * selfCum) : null;

    const fvb = fill ? S.ratio(fill, back.bg) : null;
    const bvb = border ? S.ratio(border, back.bg) : null;
    const bvf = (border && fill) ? S.ratio(border, fill) : null;
    const cue = Math.max(fvb || 0, bvb || 0) || null;
    const dpr = fw.devicePixelRatio || 1;
    const r = el.getBoundingClientRect();

    return {
      tag: el.tagName.toLowerCase(),
      interactive: S.isInteractive(el),
      paints: fillAlpha > 0 || anyBorder,
      fillVsBackdrop: fvb === null ? null : +fvb.toFixed(4),
      borderVsBackdrop: bvb === null ? null : +bvb.toFixed(4),
      borderVsFill: bvf === null ? null : +bvf.toFixed(4),
      edgeCue: cue === null ? null : +cue.toFixed(4),
      maxBorderCssPx: maxW,
      maxBorderDevicePx: +(maxW * dpr).toFixed(2),
      dpr: +dpr.toFixed(3),
      borderWidths: widths.join('/'),
      fillHex: fill ? S.hex(fill) : null,
      backdropHex: S.hex(back.bg),
      borderHex: border ? S.hex(border) : null,
      opacityProduct: +selfCum.toFixed(4),
      hasBgImage: s.backgroundImage !== 'none',
      hasShadow: s.boxShadow !== 'none',
      widthPx: Math.round(r.width),
      heightPx: Math.round(r.height),
      areaPx: Math.round(r.width * r.height)
    };
  };

  /** CONTROL: P1 derived two independent ways. A disagreement is a real signal. */
  S.interactiveTwoWays = function (fd, fw) {
    const rendered = Array.prototype.slice.call(fd.body.querySelectorAll('*'))
      .filter(function (e) { return S.rendered(e, fw); });
    const bySelector = rendered.filter(function (e) {
      return INTERACTIVE_TAG.test(e.tagName.toLowerCase()) ||
        INTERACTIVE_ROLE.test((e.getAttribute('role') || '').trim().toLowerCase());
    });
    const byTabIndex = rendered.filter(function (e) { return e.tabIndex >= 0; });
    const A = new Set(bySelector), B = new Set(byTabIndex);
    const onlyA = bySelector.filter(function (e) { return !B.has(e); });
    const onlyB = byTabIndex.filter(function (e) { return !A.has(e); });
    return {
      bySelector: bySelector.length, byTabIndex: byTabIndex.length,
      agree: onlyA.length === 0 && onlyB.length === 0,
      onlySelector: onlyA.map(function (e) { return e.tagName.toLowerCase() + ' ' + S.pathOf(e, fd); }),
      onlyTabIndex: onlyB.map(function (e) { return e.tagName.toLowerCase() + ' ' + S.pathOf(e, fd); }),
      elements: bySelector
    };
  };

  /** NAMED EXCLUSION: elements this instrument cannot score, counted rather than skipped. */
  S.svgPaintCount = function (fd) {
    return Array.prototype.slice.call(fd.body.querySelectorAll('svg, svg *'))
      .filter(function (e) {
        const f = e.getAttribute && e.getAttribute('fill');
        const st = e.getAttribute && e.getAttribute('stroke');
        return (f && f !== 'none') || (st && st !== 'none');
      }).length;
  };

  S.collectShape = function (w) {
    const f = S.f, fd = f.contentDocument, fw = f.contentWindow;
    f.style.width = w + 'px';
    void f.offsetWidth; void fd.documentElement.offsetWidth;
    fd.documentElement.getBoundingClientRect();
    const before = { cw: fd.documentElement.clientWidth, iw: fw.innerWidth, mq: fw.matchMedia('(width: ' + w + 'px)').matches };

    const all = Array.prototype.slice.call(fd.body.querySelectorAll('*'));
    const excluded = [], rows = [], p2set = new Set();
    let neither = 0;

    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') {
        excluded.push({ reason: 'script-or-style', tag: tag }); continue;
      }
      if (!S.rendered(el, fw)) {
        const s = fw.getComputedStyle(el);
        excluded.push({ reason: 'not-rendered', tag: tag, display: s.display, visibility: s.visibility, path: S.pathOf(el, fd) });
        continue;
      }
      const sh = S.shapeOf(el, fw);
      if (!sh.paints && !sh.interactive) { neither++; continue; }
      if (sh.paints) p2set.add(el);
      sh.w = w; sh.path = S.pathOf(el, fd); sh.el = S.desc(el);
      sh.population = sh.interactive ? (sh.paints ? 'P1andP2' : 'P1') : 'P2';
      rows.push(sh);
    }

    const after = { cw: fd.documentElement.clientWidth, iw: fw.innerWidth, mq: fw.matchMedia('(width: ' + w + 'px)').matches };
    const two = S.interactiveTwoWays(fd, fw);
    const unacc = all.length - rows.length - excluded.length - neither;
    return {
      w: w,
      widthStable: before.cw === w && after.cw === w && before.iw === w && after.iw === w && before.mq && after.mq,
      totalElements: all.length, measured: rows.length, excluded: excluded.length, neither: neither,
      unaccounted: unacc, closureOK: unacc === 0,
      exclusionReasons: Array.from(new Set(excluded.map(function (e) { return e.reason; }))),
      p1Count: rows.filter(function (r) { return r.interactive; }).length,
      p2Count: rows.filter(function (r) { return r.paints; }).length,
      svgPaintedNotMeasured: S.svgPaintCount(fd),
      crossCheck: two,
      rows: rows, excludedItems: excluded, p2set: p2set
    };
  };

  /**
   * CONTROL: hit testing, independent of the tree walk. Asks the browser which
   * element owns each sampled pixel; anything that owns one and PAINTS but is
   * absent from P2 is a hole. A SAMPLE, not a proof: thinner than stepPx evades it.
   */
  S.hitTestProbe = function (fd, fw, p2set, stepPx) {
    const step = stepPx || 24, vh = fw.innerHeight, vw = fw.innerWidth;
    const docH = fd.documentElement.scrollHeight, y0 = fw.scrollY;
    let sampled = 0, painted = 0;
    const holes = [], seen = new Set();
    for (let top = 0; top < docH; top += vh) {
      fw.scrollTo(0, top);
      fd.documentElement.getBoundingClientRect();
      for (let y = step / 2; y < vh; y += step) {
        for (let x = step / 2; x < vw; x += step) {
          const el = fd.elementFromPoint(x, y);
          if (!el || el === fd.documentElement || el === fd.body) continue;
          sampled++;
          const sh = S.shapeOf(el, fw);
          if (!sh.paints) continue;
          painted++;
          if (!p2set.has(el)) {
            const k = S.pathOf(el, fd);
            if (!seen.has(k)) { seen.add(k); holes.push(sh.tag + ' ' + k); }
          }
        }
      }
    }
    fw.scrollTo(0, y0);
    return { stepPx: step, sampledPoints: sampled, paintingHits: painted, holesFound: holes.length, holes: holes.slice(0, 10) };
  };

  /**
   * CONTROL: polarity, located STRUCTURALLY and two-sided. The fail anchor is the
   * link in the pricing card whose h3 reads "Free", a deliberately quiet
   * secondary; the pass anchor is the link in the h1's own column. No expected
   * figure appears anywhere in this file.
   *
   * The fail anchor USED to be the single link in the `bg-slate-900` band. That
   * was the page's primary shape defect, and the closing-band ruling fixed it, so
   * it stopped being a failure and could no longer anchor one. It is still
   * reported, as `bandAnchor`, because it is the element that ruling is about.
   */
  S.shapePolarity = function (run) {
    const fd = S.f.contentDocument, fw = S.f.contentWindow;
    const band = fd.querySelector('.bg-slate-900');
    const heroCol = fd.querySelector('h1').parentElement;
    const freeCard = Array.prototype.find.call(fd.querySelectorAll('#pricing .grid > div'), function (c) {
      const h = c.querySelector('h3');
      return !!h && h.textContent.trim() === 'Free';
    });
    const freeLinks = freeCard ? Array.prototype.slice.call(freeCard.querySelectorAll('a')) : [];
    const bandLinks = band ? Array.prototype.slice.call(band.querySelectorAll('a')) : [];
    const heroLinks = Array.prototype.slice.call(heroCol.querySelectorAll('a'));
    const pick = function (el) {
      if (!el) return null;
      const r = run.rows.find(function (x) { return x.path === S.pathOf(el, fd); }) || S.shapeOf(el, fw);
      return { fill: r.fillVsBackdrop, cue: r.edgeCue, fillHex: r.fillHex, backHex: r.backdropHex, area: r.areaPx };
    };
    return {
      w: run.w, freeLinks: freeLinks.length, bandLinks: bandLinks.length, heroLinks: heroLinks.length,
      failAnchor: pick(freeLinks[0]), passAnchor: pick(heroLinks[0]), bandAnchor: pick(bandLinks[0]),
      structural: freeLinks.length === 1 && heroLinks.length === 1 && freeLinks[0] !== heroLinks[0] &&
        !!band && bandLinks.length === 1
    };
  };

  /** Focus indicators. INDETERMINATE on its own; settle from the CSSOM. See header. */
  S.focusProbe = function () {
    const fd = S.f.contentDocument, fw = S.f.contentWindow;
    const two = S.interactiveTwoWays(fd, fw), y0 = fw.scrollY;
    const out = two.elements.map(function (el) {
      const b = fw.getComputedStyle(el);
      const bOut = b.outlineStyle + ' ' + b.outlineWidth, bSh = b.boxShadow;
      el.focus();
      const a = fw.getComputedStyle(el);
      const res = {
        tag: el.tagName.toLowerCase(), path: S.pathOf(el, fd),
        label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26),
        focusVisible: (function () { try { return el.matches(':focus-visible'); } catch (e) { return null; } })(),
        outlineAfter: a.outlineStyle + ' ' + a.outlineWidth, outlineColor: a.outlineColor,
        changed: (a.outlineStyle + ' ' + a.outlineWidth) !== bOut || a.boxShadow !== bSh,
        carriesFocusUtility: /(^|\s)(focus:|focus-visible:|focus-within:)/.test(typeof el.className === 'string' ? el.className : '')
      };
      el.blur();
      return res;
    });
    fw.scrollTo(0, y0);
    return out;
  };

  /**
   * CONTROL: mutation. Six planted shapes; FIVE must come back below the floor and
   * the SIXTH must come back above it, so the run proves the instrument
   * DISCRIMINATES rather than merely flags. Inline styles, never utilities:
   * Tailwind only emits classes it finds in the content files, so an absent class
   * would silently inherit and the mutant would prove nothing.
   */
  S.shapeMutation = function () {
    const fd = S.f.contentDocument;
    const mk = function (id, style) {
      const e = fd.createElement('div');
      e.setAttribute('data-shapemutant', id);
      e.setAttribute('style', 'width:40px;height:40px;' + style);
      return e;
    };
    const sect = fd.querySelector('.bg-surface');
    sect.appendChild(mk('s1-faint-fill', 'background:#F2F4F8;'));
    sect.appendChild(mk('s2-hairline', 'background:transparent;border:1px solid #EFF1F5;'));
    const a = fd.createElement('a');
    a.setAttribute('data-shapemutant', 's3-interactive');
    a.setAttribute('href', '#');
    a.setAttribute('style', 'display:block;width:40px;height:40px;background:#F3F5F9;');
    sect.appendChild(a);
    const d1 = fd.createElement('div'), d2 = fd.createElement('div'), d3 = fd.createElement('div');
    d3.appendChild(mk('s4-deep', 'background:#F1F3F7;'));
    d2.appendChild(d3); d1.appendChild(d2); sect.appendChild(d1);
    const grp = fd.createElement('div');
    grp.setAttribute('style', 'opacity:0.08;');
    grp.appendChild(mk('s5-opacity', 'background:#000000;'));
    sect.appendChild(grp);
    sect.appendChild(mk('s6-strong', 'background:#101010;'));

    const faint = ['s1-faint-fill', 's2-hairline', 's3-interactive', 's4-deep', 's5-opacity'];
    const runs = [1280, 360].map(function (w) {
      const r = S.collectShape(w);
      const m = {};
      Array.prototype.forEach.call(fd.querySelectorAll('[data-shapemutant]'), function (el) {
        const row = r.rows.find(function (x) { return x.path === S.pathOf(el, fd); });
        m[el.getAttribute('data-shapemutant')] = row
          ? { cue: row.edgeCue, borderDevicePx: row.maxBorderDevicePx, op: row.opacityProduct, pop: row.population }
          : null;
      });
      return {
        w: w, closureOK: r.closureOK,
        foundAll: faint.every(function (i) { return m[i]; }) && !!m['s6-strong'],
        fiveBelowFloor: faint.every(function (i) { return m[i] && m[i].cue !== null && m[i].cue < 3; }),
        strongAboveFloor: !!m['s6-strong'] && m['s6-strong'].cue >= 3,
        interactiveTagged: !!m['s3-interactive'] && m['s3-interactive'].pop.indexOf('P1') === 0,
        hairlineIsOneDevicePx: !!m['s2-hairline'] && Math.round(m['s2-hairline'].borderDevicePx) === 1,
        opacityComposited: !!m['s5-opacity'] && m['s5-opacity'].op < 1,
        mutants: m
      };
    });
    return {
      passed: runs.every(function (x) {
        return x.closureOK && x.foundAll && x.fiveBelowFloor && x.strongAboveFloor &&
          x.interactiveTagged && x.hairlineIsOneDevicePx && x.opacityComposited;
      }),
      runs: runs
    };
  };

  S.runShape = function (widths) {
    const W = widths || [1280, 900, 700, 480, 360];
    const runs = W.map(function (w) { return S.collectShape(w); });
    const pol = runs.map(function (r) { S.collectShape(r.w); return S.shapePolarity(r); });
    const fd = S.f.contentDocument, fw = S.f.contentWindow;
    const base = S.collectShape(W[0]);
    const probe = S.hitTestProbe(fd, fw, base.p2set, 32);
    S.lastShape = { runs: runs, polarity: pol, hitTest: probe, focus: S.focusProbe() };
    return {
      closureOK: runs.every(function (r) { return r.closureOK; }),
      widthsStable: runs.every(function (r) { return r.widthStable; }),
      crossCheckAgrees: runs.every(function (r) { return r.crossCheck.agree; }),
      polarityStructural: pol.every(function (p) { return p.structural; }),
      hitTestHoles: probe.holesFound,
      svgPaintedNotMeasured: base.svgPaintedNotMeasured,
      SCOPE: 'P2 is a mechanical superset; 1.4.11 relevance is NOT decided here. A row is not a defect and silence is not a pass. Order by extent, never by ratio.',
      perWidth: runs.map(function (r) {
        return { w: r.w, total: r.totalElements, measured: r.measured, p1: r.p1Count, p2: r.p2Count, excluded: r.excluded, neither: r.neither, unacc: r.unaccounted };
      })
    };
  };

  console.log('shape module ready: runShape, collectShape, shapeMutation, shapePolarity, hitTestProbe, focusProbe');
})();

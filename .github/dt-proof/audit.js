// Layout audit, evaluated inside the page. Returns what a reader would call
// broken: text cut by its box (clipped or ellipsised), text drawn over other
// text, and the page scrolling sideways. Each finding carries its text, so a
// merchant name cut on purpose can be told from an amount.
(() => {
  // The topmost full-screen layer (an open sheet's scrim, portalled into
  // <body>), else the app root: what the reader is looking at.
  const SCOPE = (() => { for (const k of [...document.body.children].reverse()) { const cs = getComputedStyle(k); const r = k.getBoundingClientRect(); if (cs.position === 'fixed' && r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && cs.display !== 'none') return k; } return document.getElementById('root'); })();
  const srOnly = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.position === 'absolute' && parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1) return true; } return false; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !srOnly(el); };
  // The nearest box that hides overflow: a text's visible part ends at its edge.
  const clipBox = (el) => { for (let e = el; e && e !== SCOPE.parentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis') return e.getBoundingClientRect(); } return null; };
  const label = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const inFixed = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const all = [...SCOPE.querySelectorAll('*')].filter((el) => vis(el) && !el.closest('[aria-hidden="true"]') && !el.closest('svg'));
  const cut = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const t = label(el);
    if (!t || el.children.length > 0 && [...el.children].some((c) => label(c) === t)) continue;
    const hidesX = cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    const hidesY = cs.overflowY !== 'visible';
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') continue;
    if (/(auto|scroll)/.test(cs.overflowX)) continue;
    if (hidesX && el.scrollWidth > el.clientWidth + 1) cut.push({ how: cs.textOverflow === 'ellipsis' ? 'ellipsis' : 'clipped-x', text: t, cls: (el.className || '').toString().slice(0, 80) });
    else if (hidesY && el.scrollHeight > el.clientHeight + 1 && !/(auto|scroll)/.test(cs.overflowY)) cut.push({ how: 'clipped-y', text: t, cls: (el.className || '').toString().slice(0, 80) });
  }
  // Text over text: line boxes of distinct text nodes intersecting.
  const boxes = [];
  const walker = document.createTreeWalker(SCOPE, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.trim();
    if (!s || !n.parentElement || !vis(n.parentElement) || n.parentElement.closest('[aria-hidden="true"]')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const c = clipBox(n.parentElement);
    for (const raw of range.getClientRects()) {
      const r = c ? { left: Math.max(raw.left, c.left), right: Math.min(raw.right, c.right), top: Math.max(raw.top, c.top), bottom: Math.min(raw.bottom, c.bottom) } : raw;
      if (r.right - r.left > 1 && r.bottom - r.top > 1) boxes.push({ r, s: s.slice(0, 40), fixed: inFixed(n.parentElement), el: n.parentElement });
    }
  }
  const overlap = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.fixed !== b.fixed || a.el === b.el) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 2) overlap.push(`${a.s} | ${b.s}`);
  }
  const root = getComputedStyle(document.documentElement).fontSize;
  return { scope: SCOPE.id || SCOPE.getAttribute('data-testid') || SCOPE.className.toString().slice(0, 40), root, textScale: document.documentElement.dataset.textScale || null, sideways: document.documentElement.scrollWidth > innerWidth + 1, cut, overlap: [...new Set(overlap)] };
})()

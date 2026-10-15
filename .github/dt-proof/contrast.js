// Contrast audit, evaluated inside the page. For every visible text node: its
// colour, the background actually behind it (each ancestor's background-color
// composited over the next, translucent tints included, down to the page),
// and the WCAG 2 ratio. Floor 4.5:1; 3:1 for large text (24px, or 18.66px
// bold). Text over an image is skipped (no colour to read). Returns every
// distinct pair with its ratio, and the failures.
(() => {
  const SCOPE = (() => { for (const k of [...document.body.children].reverse()) { const cs = getComputedStyle(k); const r = k.getBoundingClientRect(); if (cs.position === 'fixed' && r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && cs.display !== 'none') return k; } return document.getElementById('root'); })();
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function background(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    if (!layers.length || layers[layers.length - 1].a < 1) layers.push(parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 });
    let acc = layers.pop();
    while (layers.length) acc = over(layers.pop(), acc);
    return acc;
  }
  const pairs = new Map();
  const walker = document.createTreeWalker(SCOPE, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); const el = n.parentElement;
    if (!t || !el || el.closest('[aria-hidden="true"]') || el.closest('svg')) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    if (cs.position === 'absolute' && parseFloat(cs.width) <= 1) continue;
    const bg = background(el); if (!bg) continue;
    let fg = parse(cs.color); if (!fg) continue;
    fg = over(fg, bg);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const value = ratio(fg, bg); const floor = large ? 3 : 4.5;
    const key = hex(fg) + ' on ' + hex(bg);
    const prev = pairs.get(key);
    if (!prev || value < prev.ratio || (prev.floor === 3 && floor === 4.5)) pairs.set(key, { pair: key, ratio: Math.round(value * 100) / 100, floor, sample: t.slice(0, 40) });
  }
  const all = [...pairs.values()].sort((a, b) => a.ratio - b.ratio);
  return { pairs: all, failures: all.filter((p) => p.ratio < p.floor) };
})()

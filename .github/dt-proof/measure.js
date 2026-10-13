(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); };
  const len = (w) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;height:1px;width:' + w; document.body.appendChild(d); const r = d.getBoundingClientRect().width; d.remove(); return Math.round(r * 100) / 100; };
  const probe = document.createElement('span'); probe.textContent = 'X'; probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px;line-height:1';
  document.body.appendChild(probe); const zoom = probe.getBoundingClientRect().height / 100; probe.remove();
  const title = document.querySelector('#detail-title');
  const body = document.querySelector('[data-detail-facts] li span') || document.querySelector('[data-ledger-currency] span');
  return { root: getComputedStyle(document.documentElement).fontSize, rootInline: document.documentElement.style.fontSize || 'none',
    textScale: document.documentElement.dataset.textScale || null, oneRem: len('1rem'), appliedZoom: Math.round(zoom * 1000) / 1000,
    back: box(document.querySelector('[data-detail-screen] > button')), approve: box(document.querySelector('[data-detail-actions] button')),
    titleFont: title ? getComputedStyle(title).fontSize : null, bodyFont: body ? getComputedStyle(body).fontSize : null };
})()

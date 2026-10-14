// PROOF BUILD ONLY. Injected into dist/index.html before the app's own scripts.
// Replaces the network with fixtures so the real screens render signed in, with
// no backend and no Supabase. Config: window.SA_PROOF (iOS, from
// sa-proof-config.js) or localStorage 'sa-proof-config' (browser and Android).
(function () {
  var cfg = window.SA_PROOF || JSON.parse(localStorage.getItem('sa-proof-config') || 'null') || {};
  var lang = cfg.lang || 'en', theme = cfg.theme || 'light', route = cfg.route || '/dashboard';
  localStorage.setItem('lang', lang);
  localStorage.setItem('theme', theme);
  var now = Math.floor(Date.now() / 1000);
  var session = { access_token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1LTEiLCJleHAiOjk5OTk5OTk5OTl9.', token_type: 'bearer', expires_in: 3600, expires_at: now + 360000, refresh_token: 'r',
    user: { id: 'u-1', aud: 'authenticated', email: 'owner@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Abo Jad' }, created_at: '2026-01-01T00:00:00Z' } };
  // Signed out (sign-in, sign-up, the confirm link): no session at all.
  if (cfg.signedOut) localStorage.removeItem('sb-supabase-auth-token');
  else localStorage.setItem('sb-supabase-auth-token', JSON.stringify(session));
  // The processing tray resumes PROCESSING jobs from storage; seed four, which
  // the fixtures below settle into four different states on the first poll.
  var JOBS = { p1: ['scan-20261014-091200.jpg', 'PROCESSING'], p2: ['IMG_0418.jpg', 'COMPLETED'], p3: ['facture-lydec-octobre.pdf', 'NEEDS_REVIEW'], p4: ['blurry-photo.jpg', 'FAILED'] };
  if (cfg.jobs) localStorage.setItem('sa_processing_jobs', JSON.stringify(Object.keys(JOBS).map(function (id) { return { documentId: id, fileName: JOBS[id][0], status: 'PROCESSING', startedAt: Date.now() - 20000 }; })));
  else localStorage.removeItem('sa_processing_jobs');
  if (location.pathname + location.search !== route) history.replaceState(null, '', route);

  var receiptSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#fbfaf6"/>' +
    '<text x="300" y="80" font-family="monospace" font-size="34" text-anchor="middle" fill="#222">CARREFOUR MAARIF</text>' +
    '<text x="300" y="124" font-family="monospace" font-size="22" text-anchor="middle" fill="#555">Bd Al Massira, Casablanca</text>' +
    [['Lait 1L x6', '89.40'], ['Pain complet', '12.00'], ['Huile olive 1L', '118.50'], ['Fromage', '74.60'], ['Cafe 500g', '118.00']].map(function (r, i) {
      return '<text x="60" y="' + (220 + i * 50) + '" font-family="monospace" font-size="26" fill="#222">' + r[0] + '</text><text x="540" y="' + (220 + i * 50) + '" font-family="monospace" font-size="26" text-anchor="end" fill="#222">' + r[1] + '</text>';
    }).join('') + '<line x1="60" y1="500" x2="540" y2="500" stroke="#999" stroke-dasharray="6 6"/></svg>');

  var ledger = { month: '2026-10', timeZone: 'Africa/Casablanca',
    currencies: [{ currency: 'USD', total: 12989.92, receiptCount: 5, uncategorizedCount: 0,
      categories: [{ category: 'Shopping', total: 11980.02, receiptCount: 1 }, { category: 'Food', total: 412.5, receiptCount: 1 }, { category: 'Bills', total: 400, receiptCount: 1 }, { category: 'Health', total: 129.4, receiptCount: 1 }, { category: 'Transport', total: 68, receiptCount: 1 }],
      receipts: [
        { documentId: 'd1', date: '2026-10-12', dateSource: 'document', amount: 412.5, amountSource: 'extracted', category: 'Food', merchant: 'Carrefour Market Maarif Casablanca', status: 'NEEDS_REVIEW' },
        { documentId: 'd2', date: '2026-10-11', dateSource: 'document', amount: 68, amountSource: 'extracted', category: 'Transport', merchant: 'Shell', status: 'COMPLETED' },
        { documentId: 'd3', date: '2026-10-10', dateSource: 'document', amount: 129.4, amountSource: 'corrected', category: 'Health', merchant: 'صيدلية الأطلس', status: 'COMPLETED' },
        { documentId: 'd4', date: '2026-10-09', dateSource: 'document', amount: 11980.02, amountSource: 'extracted', category: 'Shopping', merchant: 'Marjane', status: 'COMPLETED' },
        { documentId: 'd5', date: '2026-10-08', dateSource: 'uploaded', amount: 400, amountSource: 'extracted', category: 'Bills', merchant: 'Maroc Telecom', status: 'COMPLETED' }] },
      { currency: 'MAD', total: 1250, receiptCount: 1, uncategorizedCount: 0, categories: [{ category: 'Food', total: 1250, receiptCount: 1 }],
        receipts: [{ documentId: 'd7', date: '2026-10-07', dateSource: 'document', amount: 1250, amountSource: 'extracted', category: 'Food', merchant: 'Dar Naji', status: 'COMPLETED' }] }],
    excluded: { status: 0, duplicate: 1, noAmount: 0 } };
  var detail = { id: 'd1', originalFileName: 'scan-20261012-140612.jpg', documentType: 'RECEIPT', overallConfidence: 0.795, uploadedAt: '2026-10-12T14:06:12Z',
    status: 'NEEDS_REVIEW', signedFileUrl: '/sa-receipt.jpg', reextractable: false, reprocessed: null,
    entities: [{ role: 'VENDOR', displayName: 'Carrefour Market Maarif Casablanca' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Carrefour Market Maarif Casablanca' } }],
    facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 2412.5, currency: 'USD', confidence: 0.6 }, { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-10-12T00:00:00.000Z', confidence: 0.99 }, { key: 'category', valueString: 'Food' },
      { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Total not printed' }] };
  var queue = [detail, Object.assign({}, detail, { id: 'd6', originalFileName: 'IMG_0412.jpg', entities: [], documentEntities: [], facts: [{ key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Missing amount' }] })];
  var stats = { pendingCount: 2, statusBreakdown: { COMPLETED: 4, NEEDS_REVIEW: 2, REJECTED: 0 } };
  var hits = ledger.currencies[0].receipts.map(function (r) { return Object.assign({ currency: 'USD' }, r); }).concat([Object.assign({ currency: 'MAD' }, ledger.currencies[1].receipts[0])]);
  var search = { mode: 'recent', q: '', category: null, month: null, timeZone: 'Africa/Casablanca', receipts: hits, currencies: [], notCounted: [] };
  var searchMonth = { mode: 'filtered', q: '', category: null, month: '2026-10', timeZone: 'Africa/Casablanca', receipts: hits,
    currencies: [{ currency: 'USD', total: 12989.92, receiptCount: 5 }, { currency: 'MAD', total: 1250, receiptCount: 1 }],
    notCounted: [{ documentId: 'd8', date: '2026-10-06', merchant: 'Carrefour Market Maarif Casablanca', fileName: 'scan-20261006.jpg', status: 'COMPLETED', reason: 'duplicate', category: 'Food' }] };
  var activity = [
    { id: 'd1', originalFileName: 'scan-20261012-140612.jpg', uploadedAt: '2026-10-12T14:06:12Z', status: 'NEEDS_REVIEW', facts: [{ key: 'category', valueString: 'Food' }] },
    { id: 'd2', originalFileName: 'IMG_0412.jpg', uploadedAt: '2026-10-11T09:20:00Z', status: 'COMPLETED', facts: [{ key: 'category', valueString: 'Transport' }] },
    { id: 'd3', originalFileName: 'فاتورة-الصيدلية.pdf', uploadedAt: '2026-10-10T18:42:00Z', status: 'COMPLETED', facts: [{ key: 'category', valueString: 'Health' }] },
    { id: 'd9', originalFileName: 'receipt-maroc-telecom-october-2026-final.pdf', uploadedAt: '2026-10-08T08:00:00Z', status: 'REJECTED', facts: [] },
    { id: 'd10', originalFileName: 'blurry-photo.jpg', uploadedAt: '2026-10-07T12:00:00Z', status: 'FAILED', facts: [] }];

  function body(path, q) {
    if (path.indexOf('/ledger') >= 0) return ledger;
    if (/\/documents\/stats$/.test(path)) return stats;
    if (/\/documents\/all$/.test(path)) return activity;
    if (/\/documents\/recent$/.test(path) || /\/review/.test(path)) return queue;
    if (/\/search$/.test(path)) return q && (q.get('month') || q.get('q') || q.get('category')) ? searchMonth : search;
    var job = path.match(/\/documents\/(p\d)$/);
    if (job) return Object.assign({}, detail, { id: job[1], status: JOBS[job[1]][1] });
    if (/\/documents\/[^/]+$/.test(path)) return detail;
    if (/\/auth\/v1\/signup$/.test(path)) return { id: 'u-2', aud: 'authenticated', role: '', email: 'new.person@example.com', confirmation_sent_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ id: 'i-2', user_id: 'u-2', provider: 'email' }], created_at: new Date().toISOString() };
    if (/\/version$/.test(path)) return { commit: 'proof' };
    if (/\/(me|usage|billing|subscription|account)/.test(path)) return { plan: 'PRO', usage: { scansThisMonth: 6, limit: 1000 } };
    return {};
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.indexOf('api.invalid') >= 0 || url.indexOf('supabase.invalid') >= 0) {
      var u = new URL(url);
      // The confirm link's three failures, as Supabase and the network give them.
      if (/\/auth\/v1\/verify$/.test(u.pathname)) {
        if (cfg.verify === 'network') return Promise.reject(new TypeError('Failed to fetch'));
        if (cfg.verify === 'hang') return new Promise(function () {});
        if (cfg.verify === 'expired') return Promise.resolve(new Response(JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }), { status: 403, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify(body(u.pathname, u.searchParams)), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return realFetch(input, init);
  };

  // Steps that open a sheet the way a person does: tap its control. Run after
  // the app has painted; each waits for its target. {click: css} or
  // {text: {en, ar}} (a button by its label) or {fill: [css, value]}.
  var steps = cfg.steps || [];
  function find(st) {
    if (st.click || st.fill) return document.querySelector(st.click || st.fill[0]);
    var want = st.text[lang] || st.text.en;
    return [].slice.call(document.querySelectorAll('button, a')).filter(function (b) { return (b.textContent || '').trim() === want; })[0] || null;
  }
  function run(i, tries) {
    if (i >= steps.length) { document.documentElement.setAttribute('data-proof-steps', 'done'); return; }
    var el = find(steps[i]);
    if (!el) { if (tries > 40) { document.documentElement.setAttribute('data-proof-steps', 'missing:' + i); return; } return setTimeout(function () { run(i, tries + 1); }, 150); }
    if (steps[i].fill) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, steps[i].fill[1]);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else el.click();
    setTimeout(function () { run(i + 1, 0); }, 500);
  }
  window.addEventListener('load', function () { setTimeout(function () { run(0, 0); }, 1500); });
})();

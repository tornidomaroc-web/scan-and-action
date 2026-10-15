// PROOF BUILD ONLY (store screenshots, fictional data). Injected into dist/index.html before the app's own scripts.
// Replaces the network with fixtures so the real screens render signed in, with
// no backend and no Supabase. Config: window.SA_PROOF (iOS, from
// sa-proof-config.js) or localStorage 'sa-proof-config' (browser and Android).
(function () {
  var cfg = window.SA_PROOF || JSON.parse(localStorage.getItem('sa-proof-config') || 'null') || {};
  var lang = cfg.lang || 'en', theme = cfg.theme || 'light', route = cfg.route || '/dashboard';
  localStorage.setItem('lang', lang);
  // 'system': no stored choice, so index.html's boot script follows the OS.
  if (theme === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', theme);
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

  // STORE SCREENSHOT DATA (2026-10-15). Invented for the App Store set: every
  // merchant, amount and file name below is fictional, chosen to look like a
  // real month in Morocco. No real user's data and no review account's data.
  // No real brand names (App Store Review Guideline 5.2).
  var R = function (id, date, amount, category, merchant, status, src) {
    return { documentId: id, date: date, dateSource: 'document', amount: amount, amountSource: src || 'extracted', category: category, merchant: merchant, status: status || 'COMPLETED' };
  };
  var mad = [
    R('d1', '2026-10-13', 342.5, 'Food', 'Épicerie Al Waha'),
    R('d2', '2026-10-12', 400, 'Transport', 'Station Nour', 'NEEDS_REVIEW'),
    R('d3', '2026-10-11', 129.4, 'Health', 'Pharmacie Al Majd'),
    R('d4', '2026-10-09', 612.8, 'Bills', 'Régie Al Amal', 'NEEDS_REVIEW'),
    R('d5', '2026-10-08', 215, 'Shopping', 'Librairie Kalam'),
    R('d6', '2026-10-06', 48, 'Food', 'Café Nouara'),
    R('d7', '2026-10-04', 26.5, 'Food', 'Boulangerie Yasmine')];
  var eur = [R('d8', '2026-10-03', 184, 'Travel', 'Hôtel Les Cèdres'), R('d9', '2026-10-02', 32.5, 'Food', 'Brasserie du Port')];
  var usd = [R('d10', '2026-10-01', 12, 'Office', 'Cloudnote Pro')];
  var sum = function (rs) { return Math.round(rs.reduce(function (a, r) { return a + r.amount; }, 0) * 100) / 100; };
  var cats = function (rs) {
    var m = {}; rs.forEach(function (r) { (m[r.category] = m[r.category] || { category: r.category, total: 0, receiptCount: 0 }); m[r.category].total = Math.round((m[r.category].total + r.amount) * 100) / 100; m[r.category].receiptCount++; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.total - a.total; });
  };
  var cur = function (code, rs) { return { currency: code, total: sum(rs), receiptCount: rs.length, uncategorizedCount: 0, categories: cats(rs), receipts: rs }; };
  var ledger = { month: '2026-10', timeZone: 'Africa/Casablanca', currencies: [cur('MAD', mad), cur('EUR', eur), cur('USD', usd)], excluded: { status: 0, duplicate: 1, noAmount: 0 } };
  var detail = { id: 'd1', originalFileName: 'scan-20261013-181204.jpg', documentType: 'RECEIPT', overallConfidence: 0.97, uploadedAt: '2026-10-13T18:12:04Z',
    status: 'COMPLETED', signedFileUrl: '/sa-receipt.jpg', reextractable: false, reprocessed: null,
    entities: [{ role: 'VENDOR', displayName: 'Épicerie Al Waha' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Épicerie Al Waha' } }],
    facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 342.5, currency: 'MAD', confidence: 0.97 }, { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-10-13T00:00:00.000Z', confidence: 0.99 },
      { key: 'category', valueString: 'Food' }, { key: 'decision', valueString: 'APPROVED' }] };
  var fuel = { id: 'd2', originalFileName: 'scan-20261012-090131.jpg', documentType: 'RECEIPT', overallConfidence: 0.81, uploadedAt: '2026-10-12T09:01:31Z',
    status: 'NEEDS_REVIEW', signedFileUrl: '/sa-receipt.jpg', reextractable: false, reprocessed: null,
    entities: [{ role: 'VENDOR', displayName: 'Station Nour' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Station Nour' } }],
    facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 400, currency: 'MAD', confidence: 0.6 }, { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-10-12T00:00:00.000Z', confidence: 0.98 },
      { key: 'category', valueString: 'Transport' }, { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Total not printed' }] };
  // The queue's two receipts, each held for a reason the rule engine really
  // gives (ruleEngineService): Rule A, an amount over 500, and Rule E, a page
  // with no total line, so the items were added up. Both show their amount.
  var bill = { id: 'd4', originalFileName: 'scan-20261009-191520.jpg', documentType: 'RECEIPT', overallConfidence: 0.95, uploadedAt: '2026-10-09T19:15:20Z',
    status: 'NEEDS_REVIEW', signedFileUrl: '/sa-receipt.jpg', reextractable: false, reprocessed: null,
    entities: [{ role: 'VENDOR', displayName: 'Régie Al Amal' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Régie Al Amal' } }],
    facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 612.8, currency: 'MAD', confidence: 0.96 }, { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-10-09T00:00:00.000Z', confidence: 0.98 },
      { key: 'category', valueString: 'Bills' }, { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Amount exceeds threshold' }] };
  // A receipt the app is still reading: the screen a scan lands on
  // (CaptureSheet navigates to Detail), before anything has been read.
  var reading = { id: 'r1', originalFileName: 'scan-20261015-094102.jpg', documentType: 'UNKNOWN', overallConfidence: null, uploadedAt: '2026-10-15T09:41:02Z',
    status: 'PROCESSING', signedFileUrl: '/sa-receipt.jpg', reextractable: false, reprocessed: null, entities: [], documentEntities: [], facts: [] };
  var queue = [fuel, bill];
  var stats = { pendingCount: 2, statusBreakdown: { COMPLETED: 9, NEEDS_REVIEW: 2, REJECTED: 0 } };
  var hits = mad.map(function (r) { return Object.assign({ currency: 'MAD' }, r); }).concat(eur.map(function (r) { return Object.assign({ currency: 'EUR' }, r); }), usd.map(function (r) { return Object.assign({ currency: 'USD' }, r); }));
  var search = { mode: 'recent', q: '', category: null, month: null, timeZone: 'Africa/Casablanca', receipts: hits, currencies: [], notCounted: [] };
  var searchMonth = { mode: 'filtered', q: '', category: null, month: '2026-10', timeZone: 'Africa/Casablanca', receipts: hits,
    currencies: [{ currency: 'MAD', total: sum(mad), receiptCount: mad.length }, { currency: 'EUR', total: sum(eur), receiptCount: eur.length }, { currency: 'USD', total: sum(usd), receiptCount: usd.length }],
    notCounted: [{ documentId: 'd12', date: '2026-10-02', merchant: 'Brasserie du Port', fileName: 'scan-20261002-213010.jpg', status: 'COMPLETED', reason: 'duplicate', category: 'Food' }] };
  var activity = [
    { id: 'd1', originalFileName: 'scan-20261013-181204.jpg', uploadedAt: '2026-10-13T18:12:04Z', status: 'COMPLETED', facts: [{ key: 'category', valueString: 'Food' }] },
    { id: 'd2', originalFileName: 'scan-20261012-090131.jpg', uploadedAt: '2026-10-12T09:01:31Z', status: 'NEEDS_REVIEW', facts: [{ key: 'category', valueString: 'Transport' }] },
    { id: 'd3', originalFileName: 'scan-20261011-174455.jpg', uploadedAt: '2026-10-11T17:44:55Z', status: 'COMPLETED', facts: [{ key: 'category', valueString: 'Health' }] },
    { id: 'd4', originalFileName: 'scan-20261009-191520.jpg', uploadedAt: '2026-10-09T19:15:20Z', status: 'NEEDS_REVIEW', facts: [{ key: 'category', valueString: 'Bills' }] }];

  function body(path, q) {
    if (path.indexOf('/ledger') >= 0) return ledger;
    if (/\/documents\/stats$/.test(path)) return stats;
    if (/\/documents\/all$/.test(path)) return activity;
    if (/\/documents\/recent$/.test(path) || /\/review/.test(path)) return queue;
    if (/\/search$/.test(path)) return q && (q.get('month') || q.get('q') || q.get('category')) ? searchMonth : search;
    var job = path.match(/\/documents\/(p\d)$/);
    if (job) return Object.assign({}, detail, { id: job[1], status: JOBS[job[1]][1] });
    var doc = path.match(/\/documents\/([^/]+)$/);
    if (doc) return { d1: detail, d2: fuel, d4: bill, r1: reading }[doc[1]] || detail;
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

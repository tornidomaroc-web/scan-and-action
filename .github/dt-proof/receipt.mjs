// A fictional till receipt for the store set: the shop, the address and every
// line are invented, and the lines add up to the total Detail reports.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const require = createRequire(process.env.PW_PKG); const { chromium } = require('playwright');
const items = [['Lait 1L x2', 19.0], ['Pain complet', 12.0], ["Huile d'olive 1L", 89.0], ['Fromage frais', 64.5], ['Café moulu 500g', 78.0], ['Tomates 1kg', 9.0], ['Dattes 500g', 71.0]];
const total = items.reduce((a, [, v]) => a + v, 0);
if (Math.abs(total - 342.5) > 0.001) throw new Error('lines do not add up: ' + total);
const row = (a, b) => `<div class="r"><span>${a}</span><span>${b}</span></div>`;
const html = `<style>
body{margin:0;background:#d9d4c7;display:grid;place-items:center;height:100vh}
.p{width:520px;background:#fbfaf6;padding:36px 34px 44px;font:22px/1.5 "Courier New",monospace;color:#222;box-shadow:0 2px 10px rgba(0,0,0,.15);transform:rotate(-1.2deg)}
.c{text-align:center}.h{font-size:30px;font-weight:700;letter-spacing:1px}.r{display:flex;justify-content:space-between}
hr{border:0;border-top:2px dashed #999;margin:14px 0}.t{font-size:28px;font-weight:700}
</style><div class="p">
<div class="c h">ÉPICERIE AL WAHA</div><div class="c">12 Rue des Orangers</div><div class="c">Casablanca</div>
<hr>${row('13/10/2026', '18:09')}${row('Ticket', 'N° 004812')}<hr>
${items.map(([a, v]) => row(a, v.toFixed(2))).join('')}
<hr>${row('<span class="t">TOTAL</span>', `<span class="t">${total.toFixed(2)} MAD</span>`)}${row('Espèces', '350.00')}${row('Rendu', '7.50')}
<hr><div class="c">Merci de votre visite</div></div>`;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 640, height: 980 }, deviceScaleFactor: 1.5 });
await p.setContent(html); await p.screenshot({ path: process.argv[2], type: 'jpeg', quality: 85 });
await b.close(); console.log('receipt', total.toFixed(2), process.argv[2]);

// usage: node cdp.mjs <port> eval <js-file-or-expression>
//        node cdp.mjs <port> url
// Talks to the Android WebView's devtools socket forwarded to 127.0.0.1:<port>.
import { readFileSync, existsSync } from 'node:fs';

const [port, cmd, arg] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page target', JSON.stringify(targets)); process.exit(2); }
if (cmd === 'url') { console.log(page.url); process.exit(0); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });

const expr = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
if (r.result?.exceptionDetails) { console.error(JSON.stringify(r.result.exceptionDetails)); process.exit(3); }
console.log(JSON.stringify(r.result?.result?.value ?? null));
ws.close();
process.exit(0);

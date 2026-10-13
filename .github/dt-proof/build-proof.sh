#!/usr/bin/env bash
# Usage: build-proof.sh <apps/frontend dir> <out dir>. A production build with
# the network pointed at .invalid hosts, then sa-proof.js injected first.
set -eu
app="$1"; out="$2"; here="$(cd "$(dirname "$0")" && pwd)"
cd "$app"
VITE_API_URL=https://api.invalid/api VITE_SUPABASE_URL=https://supabase.invalid VITE_SUPABASE_ANON_KEY=proof VITE_SENTRY_DSN= VITE_PADDLE_CLIENT_TOKEN= \
  npx vite build --outDir "$out" --emptyOutDir >/dev/null
cp "$here/sa-proof.js" "$out/sa-proof.js"
cp "$here/sa-receipt.jpg" "$out/sa-receipt.jpg"
python3 - "$out/index.html" <<'PY' || python - "$out/index.html" <<'PY2'
import sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read()
tag='<script src="/sa-proof-config.js"></script><script src="/sa-proof.js"></script>'
assert s.count('<head>')==1; open(p,'w',encoding='utf-8').write(s.replace('<head>','<head>'+tag,1))
PY
import sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read()
tag='<script src="/sa-proof-config.js"></script><script src="/sa-proof.js"></script>'
assert s.count('<head>')==1; open(p,'w',encoding='utf-8').write(s.replace('<head>','<head>'+tag,1))
PY2
echo "window.SA_PROOF = null;" > "$out/sa-proof-config.js"
grep -c 'sa-proof.js' "$out/index.html"
# The audit, posted to a listener when the config names one (the iOS
# simulator has no inspector a runner can reach), then the page scrolled to
# its end for a second shot.
{ printf 'window.addEventListener("load", function () { setTimeout(function () { var c = window.SA_PROOF; if (!c || !c.report) return; var r = '
  cat "$here/audit.js"
  printf '; fetch(c.report, { method: "POST", body: JSON.stringify(r) }).then(function () { setTimeout(function () { window.scrollTo(0, document.documentElement.scrollHeight); }, 3000); }); }, 6000); });\n'; } > "$out/sa-report.js"
python3 - "$out/index.html" <<'PY' || python - "$out/index.html" <<'PY2'
import sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read(); t='<script src="/sa-proof.js"></script>'
open(p,'w',encoding='utf-8').write(s.replace(t, t+'<script src="/sa-report.js"></script>',1))
PY
import sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read(); t='<script src="/sa-proof.js"></script>'
open(p,'w',encoding='utf-8').write(s.replace(t, t+'<script src="/sa-report.js"></script>',1))
PY2

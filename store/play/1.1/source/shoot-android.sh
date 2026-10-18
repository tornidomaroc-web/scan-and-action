#!/usr/bin/env bash
# shoot-android.sh <out dir> <name> <route> [click-selector]
#
# One Play capture from the Android emulator: the fixture APK (the Apple set's
# store/app-store/1.0/source/sa-proof.js and sa-receipt.jpg injected into a
# build whose network points at .invalid hosts) already running, light theme,
# English, System UI demo mode on. Saves <out>/<name>.png (the whole device
# screen), and the layout audit and the contrast audit
# (store/app-store/1.0/source/audit.js and contrast.js) evaluated in the
# WebView over CDP.
#
# Env: ADB (path to adb), SERIAL (emulator serial), PORT (local CDP port).
# Demo mode, once per boot, before the first shot:
#   adb shell settings put global sysui_demo_allowed 1
#   adb shell am broadcast -a com.android.systemui.demo -e command enter
#   ... -e command clock -e hhmm 0941
#   ... -e command battery -e level 100 -e plugged false
#   ... -e command network -e wifi show -e level 4 -e fully true
#   ... -e command network -e mobile hide
#   ... -e command notifications -e visible false
set -u
export MSYS_NO_PATHCONV=1
here="$(cd "$(dirname "$0")" && pwd)"; apple="$here/../../../app-store/1.0/source"
A="${ADB:-adb}"; D="${SERIAL:-emulator-5554}"; PORT="${PORT:-9336}"
O=$1; NAME=$2; ROUTE=$3; CLICK=${4:-}; mkdir -p "$O"
pid=$("$A" -s "$D" shell pidof com.scanaction.app | tr -d '\r')
sock=$("$A" -s "$D" shell cat /proc/net/unix | tr -d '\r' | grep -o "webview_devtools_remote_$pid" | head -1)
"$A" -s "$D" forward tcp:$PORT localabstract:$sock >/dev/null
cdp() { node "$here/cdp.mjs" "$PORT" eval "$1"; }
cdp "localStorage.setItem('sa-proof-config', JSON.stringify({lang:'en',theme:'light',route:'$ROUTE'})); location.href='$ROUTE'; 1" >/dev/null
sleep 7
if [ -n "$CLICK" ]; then cdp "(()=>{const b=document.querySelector('$CLICK'); if(!b) return 'missing'; b.click(); return 'clicked'})()"; sleep 3; fi
"$A" -s "$D" exec-out screencap -p > "$O/$NAME.png"
cdp "$apple/audit.js" > "$O/$NAME.audit.json"
cdp "$apple/contrast.js" > "$O/$NAME.contrast.json"

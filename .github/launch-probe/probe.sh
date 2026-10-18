#!/usr/bin/env bash
# Usage: probe.sh <apps/frontend dir> <out dir>
# Builds the launch probe around THIS tree's LaunchScreen.storyboard and asset
# catalog, runs it on the smallest and the largest iPhone simulator available,
# in light and dark, and fails when the mark is outside 38%..46% of the screen
# width or the background is not #0F1014. Prints one PROBE line per run.
set -euo pipefail
app_dir="$(cd "$1" && pwd)"; out="$2"; here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"; work="$(mktemp -d)"; bundle="$work/LaunchProbe.app"; mkdir -p "$bundle/Base.lproj"
ios="$app_dir/ios/App/App"

# The storyboard and the catalog, compiled the way Xcode compiles them.
xcrun ibtool --compile "$bundle/Base.lproj/LaunchScreen.storyboardc" "$ios/Base.lproj/LaunchScreen.storyboard" \
  --target-device iphone --minimum-deployment-target 15.0 --module LaunchProbe
xcrun actool "$ios/Assets.xcassets" --compile "$bundle" --platform iphonesimulator --minimum-deployment-target 15.0 \
  --target-device iphone --output-partial-info-plist "$work/assets.plist" >/dev/null
test -f "$bundle/Assets.car"

xcrun -sdk iphonesimulator swiftc -O -target "$(uname -m)-apple-ios15.0-simulator" "$here/main.swift" -o "$bundle/LaunchProbe"
cat > "$bundle/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.scanaction.launchprobe</string>
  <key>CFBundleExecutable</key><string>LaunchProbe</string>
  <key>CFBundleName</key><string>LaunchProbe</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>MinimumOSVersion</key><string>15.0</string>
  <key>UIDeviceFamily</key><array><integer>1</integer></array>
  <key>UILaunchStoryboardName</key><string>LaunchScreen</string>
  <key>UIRequiredDeviceCapabilities</key><array><string>arm64</string></array>
</dict></plist>
PLIST
codesign --force --sign - "$bundle" >/dev/null

# The narrowest and the widest iPhone the runner has.
read -r small large < <(xcrun simctl list devicetypes -j | python3 -c '
import json,sys
want={"iPhone SE (3rd generation)":0,"iPhone 16e":1,"iPhone 17":2,"iPhone 16":2,"iPhone 17 Pro Max":3,"iPhone 16 Pro Max":3}
t=[d for d in json.load(sys.stdin)["devicetypes"] if d["name"] in want]
t.sort(key=lambda d: want[d["name"]]); print(t[0]["identifier"], t[-1]["identifier"])')
runtime=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x["isAvailable"] and x["platform"]=="iOS"]; print(r[-1]["identifier"])')

fail=0
for type in "$small" "$large"; do
  udid=$(xcrun simctl create "probe-$(basename "$type")" "$type" "$runtime")
  xcrun simctl boot "$udid"; xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl install "$udid" "$bundle"
  for theme in light dark; do
    xcrun simctl ui "$udid" appearance "$theme"
    line=$(xcrun simctl launch --console "$udid" com.scanaction.launchprobe 2>/dev/null | grep -m1 '^PROBE ' || true)
    echo "$(basename "$type") $theme $line"
    data=$(xcrun simctl get_app_container "$udid" com.scanaction.launchprobe data 2>/dev/null || true)
    [ -n "$data" ] && cp "$data/Documents/launch.png" "$out/launch-$(basename "$type")-$theme.png" 2>/dev/null || true
    python3 - "$line" <<'PY' || fail=1
import json, sys
line = sys.argv[1]
if not line.startswith("PROBE "): sys.exit("  FAIL: the probe printed nothing")
r = json.loads(line[6:])
share, bg = r["markShare"], r["background"]
ok_share = 0.38 <= share <= 0.46
ok_bg = bg == "#0F1014"
print(f"  mark {share*100:.1f}% of the width ({'ok' if ok_share else 'OUTSIDE 38-46%'}), background {bg} ({'ok' if ok_bg else 'NOT #0F1014'})")
sys.exit(0 if ok_share and ok_bg else 1)
PY
  done
  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true; xcrun simctl delete "$udid" >/dev/null 2>&1 || true
done
[ "$fail" = 0 ] && echo "LAUNCH SCREEN GEOMETRY PASSED" || { echo "LAUNCH SCREEN GEOMETRY FAILED"; exit 1; }

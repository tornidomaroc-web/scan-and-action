#!/usr/bin/env bash
# Mutation test for assemble.sh: an untouched artifact assembles, and each
# tampered copy fails BEFORE anything is archived, naming what was tampered.
# Runs where no key exists (ios-audit.yml, and locally). Every case gets a
# fresh git worktree of HEAD, so a case that fails late leaves nothing behind
# for the next one.
#
#   bash ios/ci/assemble-mutations.sh <artifact-dir> <repo-root>
#
#   artifact-dir  a staged copy of what job `web` uploads (ios/ synced, and
#                 node_modules/<the five plugin packages>)
#   repo-root     the repository checkout; HEAD is what the worktrees hold,
#                 and ios/ci from the working tree is what is exercised
set -euo pipefail
ART=${1:?artifact dir}
ROOT=${2:?repo root}
WORK=$(mktemp -d)
pass=0
cleanup() { for w in "$WORK"/wt-*; do [ -d "$w" ] && git -C "$ROOT" worktree remove --force "$w" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

# run_case <name> <expect: 0|fail> <expected message regex or ''> <mutation shell>
run_case() {
  local name=$1 expect=$2 want=$3 mutate=$4
  local art="$WORK/art-$name" wt="$WORK/wt-$name" log="$WORK/log-$name"
  cp -R "$ART" "$art"
  git -C "$ROOT" worktree add -q "$wt" HEAD
  rm -rf "$wt/apps/frontend/ios/ci"
  cp -R "$ROOT/apps/frontend/ios/ci" "$wt/apps/frontend/ios/ci"
  ( cd "$art" && eval "$mutate" )
  local rc=0
  bash "$wt/apps/frontend/ios/ci/assemble.sh" "$art" "$wt/apps/frontend" > "$log" 2>&1 || rc=$?
  if [ "$expect" = 0 ]; then
    [ "$rc" -eq 0 ] || { echo "CASE $name: expected success, got exit $rc"; cat "$log"; exit 1; }
    grep -q '^ASSEMBLED from the commit' "$log" || { echo "CASE $name: no ASSEMBLED line"; cat "$log"; exit 1; }
    # the assembled tree is what the archive reads
    local fe="$wt/apps/frontend"
    test -f "$fe/ios/App/App/public/index.html"
    test -f "$fe/ios/App/App/capacitor.config.json"
    test -f "$fe/ios/App/App/config.xml"
    test "$(ls "$fe/node_modules" | sort | tr '\n' ' ')" = "@capacitor @capgo "
    grep -q '#if canImport(FBSDKLoginKit) && canImport(AppTrackingTransparency)' "$fe/node_modules/@capgo/capacitor-social-login/ios/Sources/SocialLoginPlugin/FacebookProvider.swift"
    test "$(grep -cE '^\s*//.*(facebook-ios-sdk|FacebookCore|FacebookLogin)' "$fe/node_modules/@capgo/capacitor-social-login/Package.swift")" -eq 3
    test ! -e "$fe/node_modules/.bin"
    echo "CASE $name: assembled ($(grep '^ASSEMBLED' "$log"))"
  else
    [ "$rc" -ne 0 ] || { echo "CASE $name: expected failure, got exit 0"; cat "$log"; exit 1; }
    grep -qE "^ASSEMBLE FAIL: .*($want)" "$log" || { echo "CASE $name: failed, but not for the expected reason ($want):"; cat "$log"; exit 1; }
    # a failed case never leaves an archivable tree: no web bundle copied in,
    # or no plugin packages, is enough to stop xcodebuild
    if [ -f "$wt/apps/frontend/ios/App/App/public/index.html" ] && [ -d "$wt/apps/frontend/node_modules/@capgo/capacitor-social-login/ios" ] && [ -f "$wt/apps/frontend/ios/App/App/capacitor.config.json" ]; then
      echo "CASE $name: failed, yet left a complete tree behind"; exit 1
    fi
    echo "CASE $name: refused: $(grep -oE '^ASSEMBLE FAIL: .*' "$log" | head -c 160)"
  fi
  pass=$((pass + 1))
}

run_case untouched 0 '' 'true'

# a harmless Run Script build phase appended to the Xcode project
run_case pbxproj-build-phase fail 'tracked file differs from the commit: ios/App/App.xcodeproj/project.pbxproj' \
  'printf "\n/* Begin PBXShellScriptBuildPhase section */\n\t\tDEADBEEF = {isa = PBXShellScriptBuildPhase; shellPath = /bin/sh; shellScript = \"echo tampered\"; };\n/* End PBXShellScriptBuildPhase section */\n" >> ios/App/App.xcodeproj/project.pbxproj'

# the export options flipped (internal-only off)
run_case export-options fail 'tracked file differs from the commit: ios/ExportOptions.plist' \
  'sed -i.bak "s#<true/>#<false/>#" ios/ExportOptions.plist && rm -f ios/ExportOptions.plist.bak'

# the pinned package graph moved
run_case package-resolved fail 'tracked file differs from the commit: ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved' \
  'printf "\n" >> ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'

# a tracked file dropped from the artifact
run_case entitlements-missing fail 'tracked file missing from the artifact: ios/App/App/App.entitlements' \
  'rm ios/App/App/App.entitlements'

# a script, a plist and a hidden file smuggled into the web bundle
run_case web-bundle-script fail 'file type not allowed in the web bundle: .*evil\.sh' \
  'printf "#!/bin/sh\necho tampered\n" > ios/App/App/public/evil.sh'
run_case web-bundle-plist fail 'file type not allowed in the web bundle: .*Info\.plist' \
  'printf "<plist/>" > ios/App/App/public/assets/Info.plist'
run_case web-bundle-hidden fail 'hidden file in the web bundle' \
  'mkdir -p ios/App/App/public/.well-known && printf "x" > ios/App/App/public/.well-known/x.txt'
# a symlink cannot be created by an unprivileged user on Windows, where this
# runs locally; CI sets REQUIRE_SYMLINK_CASE=1 so a skip there is a failure
if ln -s "$WORK" "$WORK/symlink-probe" 2>/dev/null; then
  rm -f "$WORK/symlink-probe"
  run_case web-bundle-symlink fail 'symlink in the web bundle|non-regular file in the web bundle' \
    'ln -s /etc/hosts ios/App/App/public/hosts.txt'
elif [ "${REQUIRE_SYMLINK_CASE:-0}" = 1 ]; then
  echo "CASE web-bundle-symlink: this runner cannot create a symlink, and the case is required here"; exit 1
else
  echo "CASE web-bundle-symlink: SKIPPED (no symlink privilege on this machine; CI runs it)"
fi

# the runtime config pointed at a remote server
run_case capacitor-config-server fail 'capacitor\.config\.json differs from ios/ci/expected' \
  'python3 - <<PY
import json
p = "ios/App/App/capacitor.config.json"
c = json.load(open(p)); c["server"] = {"url": "https://evil.example"}
json.dump(c, open(p, "w"), indent=1)
PY'

# the plugin manifest with Facebook linked again, and a plugin source edited
run_case plugin-manifest fail 'Package\.swift differs from the registry build: @capgo/capacitor-social-login' \
  'sed -i.bak "s#^\(\s*\)// \.package(url: \"https://github.com/facebook#\1.package(url: \"https://github.com/facebook#" node_modules/@capgo/capacitor-social-login/Package.swift && rm -f node_modules/@capgo/capacitor-social-login/Package.swift.bak'
run_case plugin-source fail 'ios/ sources differ from the registry build: @capacitor/camera' \
  'printf "\n// tampered\n" >> "$(find node_modules/@capacitor/camera/ios -name "*.swift" | head -n 1)"'
run_case plugin-swift-added fail 'ios/ sources differ from the registry build: @capacitor/app' \
  'printf "import Foundation\n" > node_modules/@capacitor/app/ios/Sources/Extra.swift'

echo "MUTATIONS PASSED: $pass cases (1 untouched assembled, $((pass - 1)) tampered artifacts refused before any archive)"

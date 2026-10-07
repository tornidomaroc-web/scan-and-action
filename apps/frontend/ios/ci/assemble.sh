#!/usr/bin/env bash
# Assemble the iOS project the signing job archives, FROM THE COMMIT, taking
# from the web job's artifact only what the commit cannot hold.
#
#   bash ios/ci/assemble.sh <artifact-dir> <frontend-dir>
#
#   artifact-dir  what job `web` uploaded: ios/ (synced) and node_modules/<the
#                 five plugin packages>. Produced on a runner that ran npm, so
#                 every byte of it is treated as untrusted.
#   frontend-dir  apps/frontend of a git checkout of the commit being built.
#                 The script runs here and writes here.
#
# WHY (2026-10-07). Job `web` runs npm ci and `cap sync`; a package script
# there can rewrite anything in the artifact: a Run Script build phase in
# project.pbxproj, a Package.swift that SwiftPM evaluates, a source Xcode
# compiles, ExportOptions.plist. Job `testflight` used to archive the artifact
# as received, with the App Store Connect key on the runner. Now it checks the
# commit out and archives THAT, and this script decides, file by file, what
# the artifact may contribute:
#
#   1. Every file git tracks under ios/ must be byte-identical in the
#      artifact. The checkout copy is what Xcode reads either way; a
#      difference is evidence of a tampered web job and FAILS the build
#      loudly instead of being quietly ignored.
#   2. The web bundle (ios/App/App/public) is the one thing only the web job
#      can make. Xcode treats `public` as a folder reference in the Resources
#      phase (project.pbxproj: lastKnownFileType = folder, "public in
#      Resources"): CpResource copies it verbatim and compiles nothing in it.
#      The allowlist below bars, on top of that, every type Xcode would
#      process anywhere (.plist, .strings, .storyboard, .xcassets, .mlmodel,
#      .swift, scripts), symlinks, and hidden files.
#   3. The two generated config files cap sync writes (capacitor.config.json,
#      read by the Capacitor runtime on the device; config.xml, a resource)
#      must equal the committed copies in ios/ci/expected. A change to
#      capacitor.config.ts changes the fixture in the same pull request, and
#      ios-audit.yml proves the fixture against a real cap sync on every PR.
#   4. The five plugin packages are NOT taken from the artifact. They are
#      fetched from the npm registry at the exact tarball package-lock.json
#      names and verified against its sha512 integrity, extracted with tar,
#      then shaped the way the web job shapes them: patches/ applied with
#      patch(1), and the social-login manifest replaced by the committed copy
#      of what the plugin's sync hook writes (its Facebook lines commented
#      out; the fixture must differ from the tarball's manifest in those
#      lines and nothing else). The artifact's copies of what Xcode reads
#      from them (Package.swift, ios/) are then compared to the result and
#      any difference fails, for the same reason as 1.
#
# Nothing here runs node, npm or any file from the artifact. python3, curl,
# tar, patch, cmp, diff and git come from the runner image.
set -euo pipefail

ART=${1:?artifact dir}
FE=${2:?frontend checkout dir}
# A refusal leaves nothing an archive could read: every output this script
# writes into the checkout is removed before exiting.
fail() {
  echo "ASSEMBLE FAIL: $*" >&2
  rm -rf node_modules ios/App/App/public ios/App/App/capacitor.config.json ios/App/App/config.xml
  exit 1
}

cd "$FE"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "$FE is not a git checkout"
test -d "$ART/ios" || fail "no ios/ in the artifact"
test ! -e node_modules || fail "node_modules already exists in the checkout; this script expects a clean tree"

# ---- 1. tracked files: the commit, byte for byte ----------------------------
tracked=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  test -f "$ART/$f" || fail "tracked file missing from the artifact: $f"
  cmp -s "$f" "$ART/$f" || fail "tracked file differs from the commit: $f"
  tracked=$((tracked + 1))
done < <(git ls-files ios)
test "$tracked" -ge 20 || fail "only $tracked tracked files under ios/: the reading is empty"

# ---- 2. the web bundle: inert files only -------------------------------------
PUB="$ART/ios/App/App/public"
test -f "$PUB/index.html" || fail "no index.html in the web bundle"
links=$(find "$PUB" -type l)
test -z "$links" || fail "symlink in the web bundle: $links"
odd=$(find "$PUB" ! -type f ! -type d)
test -z "$odd" || fail "non-regular file in the web bundle: $odd"
hidden=$(find "$PUB" -name '.*')
test -z "$hidden" || fail "hidden file in the web bundle: $hidden"
ALLOWED='\.(html|js|css|json|webmanifest|map|txt|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$'
bad=$(find "$PUB" -type f | grep -vE "$ALLOWED" || true)
test -z "$bad" || fail "file type not allowed in the web bundle: $bad"
rm -rf ios/App/App/public
cp -R "$PUB" ios/App/App/public
webfiles=$(find ios/App/App/public -type f | wc -l | tr -d ' ')

# ---- 3. generated config files: the committed expectation -------------------
for pair in "capacitor.config.json:ios/ci/expected/capacitor.config.json" "config.xml:ios/ci/expected/config.xml"; do
  gen=${pair%%:*}; exp=${pair#*:}
  test -f "$ART/ios/App/App/$gen" || fail "$gen missing from the artifact"
  cmp -s "$ART/ios/App/App/$gen" "$exp" || fail "$gen differs from $exp"
  cp "$exp" "ios/App/App/$gen"
done

# ---- 4. the plugin packages: the registry, pinned by package-lock.json ------
plugins=$(grep -oE 'path: "\.\./\.\./\.\./node_modules/[^"]+"' ios/App/CapApp-SPM/Package.swift | sed -E 's#.*node_modules/([^"]+)"#\1#')
test "$(printf '%s\n' "$plugins" | wc -l | tr -d ' ')" -ge 5 || fail "fewer than five plugin packages in CapApp-SPM/Package.swift"
TGZ=$(mktemp -d)
for p in $plugins; do
  spec=$(python3 - package-lock.json "$p" 2>&1 <<'PY'
import json, sys
lock = json.load(open(sys.argv[1]))
e = lock["packages"].get("node_modules/" + sys.argv[2])
if not e or not e.get("resolved") or not e.get("integrity"):
    sys.exit(f"package-lock.json has no resolved+integrity for {sys.argv[2]}")
print(e["resolved"], e["integrity"])
PY
  ) || fail "$spec"
  url=${spec%% *}; integrity=${spec#* }
  case "$url" in https://registry.npmjs.org/*) ;; *) fail "$p resolves outside registry.npmjs.org: $url";; esac
  case "$integrity" in sha512-*) ;; *) fail "$p integrity is not sha512: $integrity";; esac
  tgz="$TGZ/$(echo "$p" | tr '/' '_').tgz"
  curl -sSfL --retry 3 --retry-delay 5 -o "$tgz" "$url" || fail "could not fetch $url"
  actual=$(python3 -c 'import base64, hashlib, sys; print("sha512-" + base64.b64encode(hashlib.sha512(open(sys.argv[1], "rb").read()).digest()).decode())' "$tgz")
  test "$actual" = "$integrity" || fail "$p tarball does not match package-lock.json integrity"
  mkdir -p "node_modules/$p"
  tar -xzf "$tgz" -C "node_modules/$p" --strip-components=1
  test -f "node_modules/$p/Package.swift" || fail "$p tarball carries no Package.swift"
done
rm -rf "$TGZ"

# patches/: what postinstall (patch-package) applies in the web job
patched=0
for patch in patches/*.patch; do
  [ -f "$patch" ] || continue
  patch -p1 --forward --batch --silent < "$patch" || fail "patch did not apply cleanly: $patch"
  patched=$((patched + 1))
done

# the social-login manifest: the sync hook's output, committed. Prove the
# fixture is this tarball's manifest with only the Facebook lines commented.
HOOKED=ios/ci/expected/capgo-capacitor-social-login.Package.swift
TARGET=node_modules/@capgo/capacitor-social-login/Package.swift
FB='facebook-ios-sdk|FacebookCore|FacebookLogin'
test "$(grep -cE "^\s*//.*($FB)" "$HOOKED")" -eq 3 || fail "the fixture $HOOKED does not comment out exactly three Facebook lines"
if grep -qE "^\s*\.(package|product)\(.*($FB)" "$HOOKED"; then fail "the fixture $HOOKED still links Facebook"; fi
diff <(grep -vE "$FB" "$TARGET") <(grep -vE "$FB" "$HOOKED") >/dev/null || fail "the fixture $HOOKED differs from the tarball's Package.swift outside the Facebook lines: the plugin moved, re-sync and commit the new fixture"
cp "$HOOKED" "$TARGET"

# the artifact's copies of what Xcode reads from the plugins must now match
for p in $plugins; do
  cmp -s "node_modules/$p/Package.swift" "$ART/node_modules/$p/Package.swift" || fail "the artifact's Package.swift differs from the registry build: $p"
  diff -r "node_modules/$p/ios" "$ART/node_modules/$p/ios" >/dev/null || fail "the artifact's ios/ sources differ from the registry build: $p"
done

# ---- 5. the state the archive relies on ---------------------------------------
test ! -e node_modules/.bin || fail "node_modules/.bin exists"
test ! -e node_modules/.package-lock.json || fail "node_modules/.package-lock.json exists"
test "$(ls node_modules | sort | tr '\n' ' ')" = "@capacitor @capgo " || fail "unexpected entries in node_modules: $(ls node_modules | tr '\n' ' ')"
test -f ios/App/App/public/index.html
test -f ios/App/App/capacitor.config.json
test -f ios/App/App/config.xml
test -f ios/App/CapApp-SPM/Package.swift
echo "ASSEMBLED from the commit: $tracked tracked files under ios/ identical in the artifact; web bundle $webfiles files taken; $(printf '%s\n' "$plugins" | wc -l | tr -d ' ') plugin packages from the registry; $patched patch(es) applied; social-login manifest from the fixture."

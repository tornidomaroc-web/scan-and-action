#!/usr/bin/env bash
# render-c.sh <captures dir> <out dir>
#
# Composes the store set, direction C: each simulator capture inside the phone
# that frame-c.html draws, under its caption, rendered by headless Chrome at
# device scale factor 3 so every PNG comes out at the slot's exact pixels
# (large: 440 x 956 CSS -> 1320 x 2868; medium: 402 x 874 CSS -> 1206 x 2622).
#
# Captures: <captures dir>/{large,medium}-0N-<name>-en-light.png, as the
# store-shots workflow's artifact names them (light, English, status bar 9:41).
# Output: <out dir>/<slot folder>/0N-<name>.png, and next to each a
# .check.json that frame-c.html measured in the page itself: the caption text
# as rendered, its line counts, the phone inside the canvas, the whole screen
# inside the phone, the margins and the screen scale.
#
# Chrome: $CHROME, default the Windows install path. The caption font is Inter
# from Google Fonts, so the first render needs the network; without it the
# caption falls back to the system font and the check still passes, so look.
set -eu
winpath() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }
here="$(winpath "$(dirname "$0")")"
cap="$(winpath "$1")"
mkdir -p "$2"; out="$(winpath "$2")"
chrome="${CHROME:-C:/Program Files/Google/Chrome/Application/chrome.exe}"
profile="$(winpath "${TMPDIR:-/tmp}")/render-c-profile"
names=(x 01-home 02-capture 03-detail 04-queue 05-search)
for size in large medium; do
  case $size in
    large) w=440; h=956; slot=iphone-dynamic-island-large-1320x2868 ;;
    medium) w=402; h=874; slot=iphone-dynamic-island-medium-1206x2622 ;;
  esac
  mkdir -p "$out/$slot"
  for n in 1 2 3 4 5; do
    img="$cap/$size-${names[$n]}-en-light.png"
    [ -f "$img" ] || { echo "missing capture: $img" >&2; exit 1; }
    url="file:///$here/frame-c.html?w=$w&h=$h&n=$n&img=file:///$img"
    MSYS_NO_PATHCONV=1 "$chrome" --headless=new --hide-scrollbars --disable-gpu --no-first-run \
      --user-data-dir="$profile" --force-device-scale-factor=3 --window-size=$w,$h \
      --virtual-time-budget=8000 --allow-file-access-from-files \
      --screenshot="$out/$slot/${names[$n]}.png" "$url" >/dev/null 2>&1
    MSYS_NO_PATHCONV=1 "$chrome" --headless=new --disable-gpu --no-first-run \
      --user-data-dir="$profile" --window-size=$w,$h --virtual-time-budget=8000 \
      --allow-file-access-from-files --dump-dom "$url" 2>/dev/null \
      | sed -n 's:.*<pre id="check">\(.*\)</pre>.*:\1:p' > "$out/$slot/${names[$n]}.check.json"
    echo "$slot/${names[$n]}.png"
  done
done

#!/usr/bin/env bash
# render-play.sh <captures dir> <mark svg> <out dir>
# The Play phone set (1080 x 1920) and the feature graphic (1024 x 500), by
# headless Chrome, with each page's own .check.json beside every PNG.
set -eu
winpath() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }
here="$(winpath "$(dirname "$0")")"; cap="$(winpath "$1")"; mark="$(winpath "$(dirname "$2")")/$(basename "$2")"
mkdir -p "$3/phone-1080x1920" "$3/feature-graphic-1024x500"; out="$(winpath "$3")"
chrome="${CHROME:-C:/Program Files/Google/Chrome/Application/chrome.exe}"
profile="$(winpath "${TMPDIR:-/tmp}")/render-play-profile"
shot() { # url w h scale png
  MSYS_NO_PATHCONV=1 "$chrome" --headless=new --hide-scrollbars --disable-gpu --no-first-run --user-data-dir="$profile" \
    --force-device-scale-factor=$4 --window-size=$2,$3 --virtual-time-budget=8000 --allow-file-access-from-files --screenshot="$5" "$1" >/dev/null 2>&1
  MSYS_NO_PATHCONV=1 "$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" --window-size=$2,$3 \
    --virtual-time-budget=8000 --allow-file-access-from-files --dump-dom "$1" 2>/dev/null | sed -n 's:.*<pre id="check">\(.*\)</pre>.*:\1:p' > "${5%.png}.check.json"
  echo "$5"
}
for f in 1:01-home 2:02-capture 2a:02-capture 3:03-detail 4:04-queue 5:05-search; do
  n=${f%%:*}; name=${f#*:}; file=$name; [ "$n" = 2a ] && file=02-capture-alt
  shot "file:///$here/frame-play.html?w=360&h=640&n=$n&img=file:///$cap/$name.png" 360 640 3 "$out/phone-1080x1920/$file.png"
done
shot "file:///$here/feature.html?img=file:///$mark" 1024 500 1 "$out/feature-graphic-1024x500/feature-graphic.png"

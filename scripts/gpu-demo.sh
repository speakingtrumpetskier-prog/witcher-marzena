#!/usr/bin/env bash
# The render loop on your own GPU, timed against software rendering (what the cloud container uses).
# Shows the latest gameplay tweak: running in snow kicks up powder at each footfall.
#   scripts/gpu-demo.sh            GPU render, then the same frame in software, with timings
#   scripts/gpu-demo.sh gpu        GPU only
set -euo pipefail
cd "$(dirname "$0")/.."
Q="cam=-38.8,1.9,27.2&look=-40,0.7,31&hour=15.2&fov=50&hud=0"
EVAL="__G.player.teleport(-40,30,3.14); await new Promise(r=>setTimeout(r,1500)); for (let i=0;i<10;i++){ __G.events.emit('player:step',{surface:'snow',foot:i%2?'R':'L',speed:6.4}); await new Promise(r=>setTimeout(r,90)); }"
mkdir -p shots/gpu-demo
run() {
  local label=$1; shift
  local t0=$(date +%s)
  "$@" node scripts/shot.mjs --w 1280 --h 720 --q "$Q" --eval "$EVAL" --out "shots/gpu-demo/$label.png" --timeout 1500000 | grep -E "renderer|OK|FAIL"
  echo "  $label: $(( $(date +%s) - t0 )) s wall"
}
run gpu env MZ_GPU=1
[ "${1:-}" = "gpu" ] || run software env
command -v open >/dev/null && open shots/gpu-demo/gpu.png || true

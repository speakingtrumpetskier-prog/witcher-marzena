#!/usr/bin/env bash
# Fetch the official Kokoro-82M v1.0 ONNX export and the British voice packs from Hugging Face
# (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0) into scripts/voice/models/kokoro/, and pack the
# voices into voices.npz for kokoro-onnx. Then:
#   pip install kokoro-onnx soundfile
#   python scripts/voice/generate.py --engine kokoro-onnx
set -euo pipefail
cd "$(dirname "$0")"
DIR=models/kokoro
BASE=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main
mkdir -p "$DIR/voices"
[ -s "$DIR/model.onnx" ] || curl -fL --retry 3 -o "$DIR/model.onnx" "$BASE/onnx/model.onnx"
for v in bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis; do
  [ -s "$DIR/voices/$v.bin" ] || curl -fL --retry 3 -o "$DIR/voices/$v.bin" "$BASE/voices/$v.bin"
done
python - "$DIR" <<'PY'
import sys, glob, os
import numpy as np
d = sys.argv[1]
packs = {os.path.basename(f)[:-4]: np.fromfile(f, dtype=np.float32).reshape(-1, 1, 256) for f in sorted(glob.glob(f"{d}/voices/*.bin"))}
np.savez(f"{d}/voices.npz", **packs)
print("voices.npz:", ", ".join(packs))
PY

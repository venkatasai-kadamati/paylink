#!/usr/bin/env bash
# Stitch organized screenshot pack into a deployment showcase MP4.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOTS="${ROOT}/artifacts/screenshots"
OUT_DIR="${ROOT}/artifacts/video"
WORKDIR="${OUT_DIR}/work"
MANIFEST="${OUT_DIR}/manifest.txt"
mkdir -p "$WORKDIR" "$OUT_DIR"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST"
  exit 1
fi

rm -f "$WORKDIR"/clip_*.mp4 "$WORKDIR"/list.txt
i=0
while IFS='|' read -r file secs caption; do
  [[ -z "${file:-}" || "$file" =~ ^# ]] && continue
  img="${SHOTS}/${file}"
  if [[ ! -f "$img" ]]; then
    echo "Skip missing: $img"
    continue
  fi
  i=$((i + 1))
  clip=$(printf '%s/clip_%02d.mp4' "$WORKDIR" "$i")
  ffmpeg -y -loop 1 -i "$img" -t "$secs" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0f172a" \
    -c:v libx264 -pix_fmt yuv420p -r 30 "$clip" </dev/null 2>/dev/null
  echo "file '$(basename "$clip")'" >> "$WORKDIR/list.txt"
done < "$MANIFEST"

OUT="${OUT_DIR}/paylink-aws-deployment-showcase.mp4"
(cd "$WORKDIR" && ffmpeg -y -f concat -safe 0 -i list.txt -c copy "$OUT" 2>/dev/null)
ls -lh "$OUT"

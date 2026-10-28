#!/usr/bin/env bash
# Stitch frame screencast tiap topik panduan jadi MP4.
# Input : /home/aljadugh/jurnalku/tmp/panduan-frames/<topik>/frame_%04d.jpg
# Output: /home/aljadugh/Downloads/jurnalku-tutorial-video/<topik>.mp4
set -u

FFMPEG=/tmp/ffmpeg-7.0.2-amd64-static/ffmpeg
FRAMES_DIR=/home/aljadugh/jurnalku/tmp/panduan-frames
OUT_DIR=/home/aljadugh/Downloads/jurnalku-tutorial-video
FPS="${1:-15}"

mkdir -p "$OUT_DIR"
if [ ! -x "$FFMPEG" ]; then
  echo "ffmpeg tidak ditemukan di $FFMPEG"
  exit 1
fi

count=0
for dir in "$FRAMES_DIR"/*/; do
  name=$(basename "$dir")
  nframes=$(ls "$dir"frame_*.jpg 2>/dev/null | wc -l)
  if [ "$nframes" -lt 2 ]; then
    echo "LEWAT  $name (frame=$nframes)"
    continue
  fi
  "$FFMPEG" -y -loglevel error -framerate "$FPS" -i "$dir/frame_%04d.jpg" \
    -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart \
    "$OUT_DIR/$name.mp4"
  size=$(du -h "$OUT_DIR/$name.mp4" 2>/dev/null | cut -f1)
  dur=$("$FFMPEG" -i "$OUT_DIR/$name.mp4" 2>&1 | grep -o 'Duration: [0-9:.]*' | head -1)
  echo "OK  $name.mp4  ($size, $dur, $nframes frame)"
  count=$((count+1))
done
echo "---"
echo "Selesai: $count video di $OUT_DIR"

#!/bin/sh
# Downloads and builds everything the demo plays, into DIR (default: media):
#   DIR/tears_of_steel_720p.mp4  the movie, (CC) Blender Foundation, CC BY 3.0
#   DIR/poster.jpg               a frame of the movie for the details screen
#   DIR/fonts/Inter.ttf          Inter, SIL Open Font License, with OFL.txt
#   DIR/ads/*.mp4                the five demo ads, drawn by make_ads.py
#   DIR/ads/brewnord_pause.png, brewnord_qr.png  the pause ad and its QR code
#   DIR/loudness.json            integrated loudness (LUFS, EBU R128) of the movie and the ads
# Needs curl, shasum, ffmpeg with libx264 and aac, and Python 3 (Pillow and segno go into DIR/.venv).
# Usage: sh get_media.sh [DIR]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${1:-media}
MOVIE_URL=https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov
MOVIE_SHA256=efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f
FONT_URL='https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf'
FONT_SHA256=29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031
OFL_URL=https://github.com/google/fonts/raw/main/ofl/inter/OFL.txt

# download URL FILE [SHA256]: skips a file that is already there and checks the hash.
download() {
  if [ ! -s "$2" ]; then
    echo "download $1"
    curl -fL --retry 3 -o "$2.part" "$1"
    mv "$2.part" "$2"
  fi
  if [ -n "${3:-}" ] && [ "$(shasum -a 256 "$2" | cut -d' ' -f1)" != "$3" ]; then
    echo "wrong SHA-256 for $2; delete it and run again" >&2
    exit 1
  fi
}

mkdir -p "$DIR/fonts" "$DIR/ads"

download "$MOVIE_URL" "$DIR/tears_of_steel_720p.mov" "$MOVIE_SHA256"
if [ ! -s "$DIR/tears_of_steel_720p.mp4" ]; then
  # The video stays as it is (H.264 Main); w3cmedia needs AAC instead of MP3, and the index first.
  # The sound is brought to -24 LUFS, the TV level of ATSC A/85 and the IAB CTV guidelines
  # (the web release is about -12 LUFS, far louder than TV programmes).
  ffmpeg -hide_banner -loglevel error -y -i "$DIR/tears_of_steel_720p.mov" \
    -c:v copy -af loudnorm=I=-24:TP=-2:LRA=15 -ar 48000 -c:a aac -b:a 160k -movflags +faststart \
    "$DIR/tears_of_steel_720p.part.mp4"
  mv "$DIR/tears_of_steel_720p.part.mp4" "$DIR/tears_of_steel_720p.mp4"
  rm -f "$DIR/loudness.json"
fi
if [ ! -s "$DIR/poster.jpg" ]; then
  ffmpeg -hide_banner -loglevel error -y -ss 00:06:25 -i "$DIR/tears_of_steel_720p.mp4" \
    -frames:v 1 -q:v 3 "$DIR/poster.jpg"
fi

download "$FONT_URL" "$DIR/fonts/Inter.ttf" "$FONT_SHA256"
download "$OFL_URL" "$DIR/fonts/OFL.txt"
if [ ! -x "$DIR/.venv/bin/python" ]; then
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -q --disable-pip-version-check pillow==12.3.0 segno==1.6.6
fi
need_ads=no
for file in kettlo_1080p.mp4 kettlo_720p.mp4 brewnord_1080p.mp4 brewnord_720p.mp4 voltaro_1080p.mp4 voltaro_720p.mp4 \
  ferntop_1080p.mp4 ferntop_720p.mp4 quillary_1080p.mp4 quillary_720p.mp4 brewnord_pause.png brewnord_qr.png; do
  [ -s "$DIR/ads/$file" ] || need_ads=yes
done
if [ "$need_ads" = yes ]; then
  "$DIR/.venv/bin/python" "$HERE/make_ads.py" --font "$DIR/fonts/Inter.ttf" --out "$DIR/ads"
  rm -f "$DIR/loudness.json"
fi

# lufs FILE: the integrated loudness that ffmpeg's EBU R128 meter reports.
lufs() {
  ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1 | awk '/I:/ { value = $2 } END { print value }'
}
if [ ! -s "$DIR/loudness.json" ]; then
  echo "measure loudness"
  {
    printf '{\n  "tears_of_steel_720p.mp4": %s' "$(lufs "$DIR/tears_of_steel_720p.mp4")"
    for ad in kettlo brewnord voltaro ferntop quillary; do
      printf ',\n  "ads/%s_720p.mp4": %s' "$ad" "$(lufs "$DIR/ads/${ad}_720p.mp4")"
    done
    printf '\n}\n'
  } > "$DIR/loudness.json.part"
  mv "$DIR/loudness.json.part" "$DIR/loudness.json"
fi

echo "done: $DIR"
ls -l "$DIR" "$DIR/ads"

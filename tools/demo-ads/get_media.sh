#!/bin/sh
# Downloads and builds everything the demo plays, into DIR (default: media):
#   DIR/tears_of_steel_720p.mp4  the movie, (CC) Blender Foundation, CC BY 3.0
#   DIR/poster.jpg               a frame of the movie for the details screen
#   DIR/sintel_720p.mp4          the second title, (c) Blender Foundation | durian.blender.org, CC BY 3.0
#   DIR/poster_sintel.jpg        a frame of Sintel
#   DIR/fonts/Inter.ttf          Inter, SIL Open Font License, with OFL.txt
#   DIR/ads/*.mp4                the five demo ads, drawn by make_ads.py
#   DIR/ads/brewnord_pause.png, brewnord_qr.png  the pause ad and its QR code
#   DIR/loudness.json            integrated loudness (LUFS, EBU R128) of the movie and the ads
# Needs curl, shasum, unzip, ffmpeg with libx264 and aac, and Python 3 (Pillow and segno go into DIR/.venv).
# Usage: sh get_media.sh [DIR]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${1:-media}
MOVIE_URL=https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov
MOVIE_SHA256=efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f
SINTEL_URL=https://download.blender.org/durian/movies/Sintel.2010.720p.mkv.zip
SINTEL_SHA256=d252f898641b20f51c64206f31063e659c28b152a9d988936736d1b56e6e4db3
FONT_URL='https://github.com/google/fonts/raw/e1d6480102fed30739fead0faee463101f892c8f/ofl/inter/Inter%5Bopsz,wght%5D.ttf'
FONT_SHA256=29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031
OFL_URL=https://github.com/google/fonts/raw/b0928647ba26c8d55548aa19feb2f7aeba622d4a/ofl/inter/OFL.txt
OFL_SHA256=5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57

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

download "$SINTEL_URL" "$DIR/Sintel.2010.720p.mkv.zip" "$SINTEL_SHA256"
if [ ! -s "$DIR/sintel_720p.mp4" ]; then
  # H.264 High stays; the 5.1 AC-3 sound becomes stereo AAC at -24 LUFS, as above. No subtitles.
  unzip -p "$DIR/Sintel.2010.720p.mkv.zip" Sintel.2010.720p.mkv > "$DIR/Sintel.2010.720p.mkv"
  ffmpeg -hide_banner -loglevel error -y -i "$DIR/Sintel.2010.720p.mkv" -map 0:v:0 -map 0:a:0 \
    -c:v copy -af loudnorm=I=-24:TP=-2:LRA=15 -ac 2 -ar 48000 -c:a aac -b:a 160k -movflags +faststart \
    "$DIR/sintel_720p.part.mp4"
  mv "$DIR/sintel_720p.part.mp4" "$DIR/sintel_720p.mp4"
  rm -f "$DIR/Sintel.2010.720p.mkv" "$DIR/loudness.json"
fi
if [ ! -s "$DIR/poster_sintel.jpg" ]; then
  ffmpeg -hide_banner -loglevel error -y -ss 00:05:07 -i "$DIR/sintel_720p.mp4" \
    -frames:v 1 -q:v 3 "$DIR/poster_sintel.jpg"
fi

download "$FONT_URL" "$DIR/fonts/Inter.ttf" "$FONT_SHA256"
download "$OFL_URL" "$DIR/fonts/OFL.txt" "$OFL_SHA256"
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
    printf ',\n  "sintel_720p.mp4": %s' "$(lufs "$DIR/sintel_720p.mp4")"
    for ad in kettlo brewnord voltaro ferntop quillary; do
      printf ',\n  "ads/%s_720p.mp4": %s' "$ad" "$(lufs "$DIR/ads/${ad}_720p.mp4")"
    done
    printf '\n}\n'
  } > "$DIR/loudness.json.part"
  mv "$DIR/loudness.json.part" "$DIR/loudness.json"
fi

echo "done: $DIR"
ls -l "$DIR" "$DIR/ads"

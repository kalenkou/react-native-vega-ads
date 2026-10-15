#!/bin/sh
# Downloads the IAB Tech Lab VAST samples (github.com/InteractiveAdvertisingBureau/VAST_Samples)
# at a fixed commit into ./samples. They are not part of this repository: their licence file
# is a warranty disclaimer only.
# Needs curl, shasum and tar. Usage: sh get_samples.sh
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
COMMIT=6a60797f3b17f6d371ebe8ee3f511e9944078073
URL=https://github.com/InteractiveAdvertisingBureau/VAST_Samples/archive/$COMMIT.tar.gz
SHA256=65a2e721c01bfbef8dba8091bf6b101b9cdcbd2a2d444b63efb06b57e7395b50

if [ -d "$HERE/samples" ]; then
  echo "samples already in $HERE/samples"
  exit 0
fi
curl -fL --retry 3 -o "$HERE/samples.tar.gz" "$URL"
echo "$SHA256  $HERE/samples.tar.gz" | shasum -a 256 -c -
mkdir -p "$HERE/samples"
tar -xzf "$HERE/samples.tar.gz" -C "$HERE/samples" --strip-components 1
rm "$HERE/samples.tar.gz"
echo "samples in $HERE/samples"

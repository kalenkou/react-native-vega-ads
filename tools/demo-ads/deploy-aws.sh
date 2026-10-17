#!/usr/bin/env bash
# Puts the demo on AWS: deploys tools/pixel-collector (S3 + CloudFront + Lambda + DynamoDB),
# uploads the movies, the ads and their posters, and the VAST, VMAP and WebVTT documents that
# point to CloudFront and to the pixel collector. Run it again after a change: the stack is
# updated and only changed media files are uploaded.
#
# Usage: tools/demo-ads/deploy-aws.sh MEDIA_DIR [export-static.mjs options, such as --midrolls 139.9,441.2]
# Needs: AWS credentials (aws login), the AWS SAM CLI, `npm run build` in tools/make-vmap.
# STACK (default vega-ads-demo) and AWS_REGION (default eu-west-1) choose the stack.
# DRY_RUN=1 prints the AWS commands instead of running them.
set -euo pipefail

MEDIA=${1:?Usage: deploy-aws.sh MEDIA_DIR [export-static options]}
shift
STACK=${STACK:-vega-ads-demo}
REGION=${AWS_REGION:-eu-west-1}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

run() {
  if [[ -n "${DRY_RUN:-}" ]]; then echo "+ $*"; else "$@"; fi
}
output() {
  if [[ -n "${DRY_RUN:-}" ]]; then
    case $1 in
      MediaBucketName) echo "dry-run-bucket" ;;
      MediaBaseUrl) echo "https://dry-run.cloudfront.net" ;;
      PixelBaseUrl) echo "https://dry-run.lambda-url.$REGION.on.aws/" ;;
    esac
    return
  fi
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

echo "1/4 stack $STACK in $REGION"
(cd "$HERE/../pixel-collector" && run npm run sam:build && run sam deploy --stack-name "$STACK" --region "$REGION" \
  --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset)

BUCKET=$(output MediaBucketName)
MEDIA_BASE="$(output MediaBaseUrl)/"
PIXEL_BASE=$(output PixelBaseUrl)

echo "2/4 documents for $MEDIA_BASE, pixels to $PIXEL_BASE"
node "$HERE/export-static.mjs" --dir "$MEDIA" --media-base "$MEDIA_BASE" --pixel-base "$PIXEL_BASE" --out "$OUT" "$@"

echo "3/4 media to s3://$BUCKET (only new or changed files)"
run aws s3 sync "$MEDIA" "s3://$BUCKET/" --region "$REGION" --exclude '*' \
  --include 'ads/*.mp4' --include 'ads/*.png' --include 'tears_of_steel_720p.mp4' --include 'sintel_720p.mp4' \
  --include 'poster.jpg' --include 'poster_sintel.jpg'

echo "4/4 documents (cached 60 s, so a new upload shows within a minute)"
run aws s3 cp "$OUT/" "s3://$BUCKET/" --recursive --region "$REGION" --exclude '*' --include '*.xml' \
  --content-type application/xml --cache-control max-age=60
run aws s3 cp "$OUT/" "s3://$BUCKET/" --recursive --region "$REGION" --exclude '*' --include '*.vtt' \
  --content-type text/vtt --cache-control max-age=60

echo
echo "MEDIA_BASE for apps/demo/src/media.local.ts: $MEDIA_BASE"
echo "VMAP:   ${MEDIA_BASE}vmap/movie.xml"
echo "Report: ${PIXEL_BASE}report"

# On AWS

No ad server yet? The demo's whole ad backend runs on AWS from one script, and the library
needs nothing AWS-specific: it reads the VAST and VMAP files from any HTTPS host.

```
make-vmap (on your computer, or with Rekognition) ───────────────► VMAP with break times
                                                                       │
deploy-aws.sh ──► S3 (movies, ad creatives, VAST, VMAP, WebVTT) ──► CloudFront (HTTPS) ──► Fire TV app
                                                                                             │
                  DynamoDB ◄── Lambda function URL ◄────── IAB tracking pixels ◄─────────────┘
                     └──► /report: impressions, quartiles, completion, ads left out, errors
```

1. [`tools/make-vmap`](../tools/make-vmap) writes the VMAP. The demo runs it on your computer (`--local`). With `--bucket B --key movie.mp4` it can instead send a movie in S3 to Amazon Rekognition segment detection, which also finds the end credits. That mode is unit-tested but has not run on AWS yet.
2. `tools/demo-ads/deploy-aws.sh MEDIA_DIR` deploys [`tools/pixel-collector`](../tools/pixel-collector) with AWS SAM: S3, CloudFront with origin access control, a Lambda function URL and DynamoDB on demand. It also uploads the media. Then it writes VAST, VMAP and WebVTT files that point to CloudFront and to the pixel collector.
3. The app needs only the CloudFront URL. HTTPS media needs no cleartext entry in `manifest.toml`.
4. `<pixel url>report` shows the day's counts per ad.

The template has no keys or account IDs. `sam delete` removes it all.

Checked on 18.10.2026 in eu-north-1 (`AWS_REGION` picks the region, default eu-west-1): one run
deployed the stack and 960 MB of media in about 10 minutes. Then 3 of 3 runs on a Fire TV Stick
4K Select played the movie and every ad from CloudFront, and the report counted every pixel:
pre-roll, a two-ad mid-roll pod, the repeated ad left out.

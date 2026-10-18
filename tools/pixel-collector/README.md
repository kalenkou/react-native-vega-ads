# pixel-collector

A small AWS backend for a vega-ads demo:

- **Ad creatives and VMAP files** in a private S3 bucket, served through CloudFront.
- **Tracking pixel collector.** A Lambda function URL counts VAST and VMAP pixels per ad, event and day in DynamoDB.
- **Daily report.** An HTML table with impressions, quartiles, completion rate, ads left out of breaks, pause ad views and error codes.

## Endpoints

| Path | What it does |
|---|---|
| `GET /p?ad=<id>&e=<event>` | Counts one event and answers with a 1×1 GIF (`cache-control: no-store`). |
| `GET /p?ad=<id>&e=error&code=[ERRORCODE]` | Counts an error by its code. An unfilled macro counts as `unknown`. |
| `GET /report?day=YYYY-MM-DD` | Shows the HTML report for one day (UTC). Without `day` it shows today. |

Rules for the parameters:

- `ad` may use only letters, digits, `.`, `_` and `-`, up to 64 characters.
- `e` must be one of these events:
  - VAST: `impression`, `start`, `firstQuartile`, `midpoint`, `thirdQuartile`, `complete`, `pause`, `resume`, `skip`, `notUsed` (an ad left out of a break), `error`
  - VAST pause ads: `creativeView`, `overlayViewDuration`, `close`
  - VMAP: `breakStart`, `breakEnd`.
- Any other request gets HTTP 400 and is not counted.

Use the pixel URLs in your own VAST files:

```xml
<Impression><![CDATA[https://<pixel url>/p?ad=tos-30s&e=impression]]></Impression>
<Error><![CDATA[https://<pixel url>/p?ad=tos-30s&e=error&code=[ERRORCODE]]]></Error>
<Tracking event="start"><![CDATA[https://<pixel url>/p?ad=tos-30s&e=start]]></Tracking>
```

## Deploy

You need:

- an AWS account
- the AWS SAM CLI
- your own credentials in the standard AWS credential chain.

The template contains no keys and no account IDs.

1. Build: `npm run sam:build` (from this folder). It runs `sam build` with the repo's esbuild on the `PATH`, which bundles `src/index.ts`. A plain `sam build` stops with "Cannot find esbuild" unless esbuild is installed globally.
2. Deploy: `sam deploy --guided`. Choose a stack name and a region. `samconfig.toml` stays local. Git ignores it.
3. Read the stack outputs:
   - `MediaBucketName`: upload creatives and VMAP files here.
   - `MediaBaseUrl`: the CloudFront URL of the uploaded files.
   - `PixelBaseUrl`: the base URL of the pixel collector and the report.
4. Upload the files:
   - a creative: `aws s3 cp ad.mp4 s3://<bucket>/ads/ad.mp4 --content-type video/mp4`
   - a VMAP file: `aws s3 cp breaks.vmap s3://<bucket>/vmap/movie.xml --content-type application/xml --cache-control max-age=60`.
5. Open `<PixelBaseUrl>report` to see the counts.

To remove everything, run `sam delete`. Empty the bucket first.

## Cost and limits

- DynamoDB is on-demand, and Lambda uses 128 MB. Demo traffic should stay inside the AWS free tier, but check your account's prices.
- The function URL is public, because TV devices send pixels without credentials. So anyone can add counts.
- This is a demo collector, not an ad server. A production setup needs request signing or deduplication, a time-to-live on old days, and its own access rules for the report.

## Code

- `src/collector.ts`: request handling and the report. It has no AWS imports and is fully unit tested.
- `src/dynamo.ts`: the DynamoDB adapter. Table: key `day` + `key` (`<ad>#<event>`), atomic `ADD count :one`.
- `src/lambda.ts` and `src/index.ts`: the Lambda function URL event (payload 2.0) and the entry point.
- `template.yaml`: the AWS SAM template. Check it with `cfn-lint template.yaml`.

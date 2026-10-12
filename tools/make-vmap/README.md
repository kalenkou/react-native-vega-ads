# make-vmap

A small command-line tool. It finds mid-roll points in a video and writes a VMAP 1.0 file for the vega-ads player.

## What it does

1. Starts Amazon Rekognition Video segment detection on a video in S3. It asks for two segment types: `SHOT` (hard cuts between camera shots) and `TECHNICAL_CUE` (black frames, opening and end credits, colour bars, slates, studio logos).
2. Waits for the job and reads all result pages.
3. Chooses mid-roll times:
   - black frames win over a plain shot cut when they are within 60 s of it;
   - no mid-roll inside opening credits, colour bars, slates or studio logos;
   - no mid-roll from the start of the end credits to the end of the video;
   - no mid-roll in the first 120 s or in the last 60 s;
   - at least 300 s between two mid-rolls.
4. Writes VMAP 1.0: an optional pre-roll (`timeOffset="start"`), the mid-rolls (`hh:mm:ss.mmm`) and an optional post-roll (`timeOffset="end"`). Every break is `linear` and points to a VAST tag (`templateType="vast4"`).
5. Optionally puts the VMAP file to S3 with `Content-Type: application/xml`.

The steps are separate functions in `src/`: `rekognitionSegments` (`rekognition.ts`), `pickBreaks` (`pickBreaks.ts`) and `buildVmap` (`buildVmap.ts`). `buildVmap` also accepts `custParams` per break, for example scene labels. It appends them to the tag URL as one URL-encoded `cust_params` value.

## Cost and limits

Segment detection is a paid API. It is **not** in the Rekognition free tier.

| Segment type | Price (us-east-1, eu-west-1) |
|---|---|
| `SHOT` | $0.05 per minute of video |
| `TECHNICAL_CUE` | $0.05 per minute of video |

This tool requests both types, so one run costs about **$0.10 per minute of video**. A 90-minute film costs about $9. Check the current price on the Amazon Rekognition pricing page before a large run.

Video limits for stored video:

- codec: H.264;
- container: MPEG-4 (`.mp4`) or MOV;
- size: up to 10 GB;
- length: up to 6 hours.

## Credentials and IAM

The tool reads credentials from the default AWS credential chain: environment variables, `~/.aws` profiles, SSO, or an instance or task role. Never put keys in arguments or files in this repository.

The identity needs these actions:

| Action | Resource |
|---|---|
| `rekognition:StartSegmentDetection` | `*` |
| `rekognition:GetSegmentDetection` | `*` |
| `s3:GetObject` | the source video, for example `arn:aws:s3:::my-media/movies/*` |
| `s3:PutObject` | only with `--upload`, for example `arn:aws:s3:::my-ads/vmap/*` |

Rekognition reads the video from S3 with the caller's permissions, so `s3:GetObject` must allow the video object. The bucket must be in the same region as the Rekognition call.

## Usage

```sh
npm run build -w tools/make-vmap

AWS_PROFILE=demo node tools/make-vmap/dist/main.js \
  --region us-east-1 \
  --bucket my-media --key movies/film.mp4 \
  --vast-url 'https://ads.example.com/vast?pos=mid' \
  --preroll 'https://ads.example.com/vast?pos=pre' \
  --postroll 'https://ads.example.com/vast?pos=post' \
  --out breaks.vmap \
  --upload s3://my-ads/vmap/
```

Progress goes to standard error. Without `--out`, the VMAP goes to standard output. With `--upload` and a path that ends in `/`, the file name is the `--out` name, or the video name with `.vmap`.

Options:

| Flag | Default | Meaning |
|---|---|---|
| `--min-gap S` | 300 | minimum seconds between mid-rolls |
| `--first-break-after S` | 120 | no mid-roll before this time |
| `--max-breaks N` | no limit | at most N mid-rolls |
| `--avoid-last S` | 60 | no mid-roll in the last S seconds |
| `--region R` | from the AWS environment | AWS region |

With `--local FILE --speech-model ggml-base.en.bin`, the tool also finds speech with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`whisper-cli` on the `PATH`, no cloud, no cost). No mid-roll goes inside speech or within 1 s of it, so an ad never cuts a line. The tool uses word times, not sentence times, and skips sound labels such as `[MUSIC PLAYING]`. The model file is not in this repository: download a ggml model from the whisper.cpp project. A 12-minute film takes about 10 s on an Apple Silicon Mac.

With `--context-model` and `--context-mmproj` as well, a local vision model ([llama.cpp](https://github.com/ggml-org/llama.cpp) `llama-mtmd-cli`; we use Qwen3.6-35B-A3B, chosen in [the eval](eval/README.md)) looks at three frames and the last minute of dialogue before each break. It reports sensitive content with evidence: death, grief, violence, weapons, vehicle crash, injury, drinking, child in danger. Fixed rules in `src/breakContext.ts` (`SENSITIVITY_RULES`) turn each signal into IAB Ad Product Taxonomy 2.0 codes to block after that scene, for example a vehicle crash blocks car ads. The VMAP carries them in a `vega-ads:context` extension. About 7 s per break, no cloud. See [eval/](eval/README.md) for how often it is right.

Exit codes: `0` success, `1` AWS or job error, `2` bad arguments.

## Tests

```sh
cd tools/make-vmap && npx jest
```

The tests use fake ports. They make no AWS calls and need no credentials. One test reads the generated VMAP with `requestVmap` from `packages/core` to check that the player accepts it.

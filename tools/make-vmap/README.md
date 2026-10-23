# make-vmap

A command-line tool. It finds good points for mid-roll ads in a video and writes a VMAP 1.0 file that the `react-native-vega-ads` player plays.

You run it on your computer, once per video, before you publish the video. It is not in the npm packages, and the player does not need it: the player works with any VMAP.

## Local mode

Everything runs on your computer. No cloud, no cost, no viewer data. You choose how much the tool does. Each level adds to the one before.

| Level | Flags | Needs | What it adds | AI |
|---|---|---|---|---|
| 1. Shots | `--local FILE` | [ffmpeg](https://ffmpeg.org) | breaks at shot changes and silent black frames | no |
| 2. Speech | `--speech-model FILE` | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | no break inside a line of dialogue | a small speech model |
| 3. Scene | `--context-model FILE --context-mmproj FILE` | [llama.cpp](https://github.com/ggml-org/llama.cpp) | each break blocks ad categories that do not fit the scene before it | a vision model, about 24 GB of memory |

```sh
npm run build -w tools/make-vmap

node tools/make-vmap/dist/main.js \
  --local film.mp4 \
  --speech-model ggml-base.en.bin \
  --vast-url 'https://ads.example.com/vast?pos=mid' \
  --preroll 'https://ads.example.com/vast?pos=pre' \
  --postroll 'https://ads.example.com/vast?pos=post' \
  --out film.vmap
```

### Speech

With `--local FILE --speech-model ggml-base.en.bin`, the tool also finds speech with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`whisper-cli` on the `PATH`, no cloud, no cost). No mid-roll goes inside speech or within 1 s of it, so an ad never cuts a line. The tool uses word times, not sentence times, and skips sound labels such as `[MUSIC PLAYING]`. The model file is not in this repository: `sh ./models/download-ggml-model.sh base.en` in a whisper.cpp checkout gives `ggml-base.en.bin`. A 12-minute film takes about 10 s on an Apple Silicon Mac.

### Scene

With `--context-model` and `--context-mmproj` as well, a local vision model looks at three frames and the last minute of dialogue before each break. It runs with `llama-mtmd-cli` from [llama.cpp](https://github.com/ggml-org/llama.cpp). I use Qwen3.6-35B-A3B, chosen in [the eval](eval/README.md). The model reports sensitive content with evidence: death, grief, violence, weapons, vehicle crash, injury, drinking, child in danger. Fixed rules in `src/breakContext.ts` (`SENSITIVITY_RULES`) turn each signal into IAB Ad Product Taxonomy 2.0 codes to block after that scene, for example a vehicle crash blocks car ads. The VMAP carries them in a `vega-ads:context` extension. The model files are not in this repository: [ggml-org/Qwen3.6-35B-A3B-GGUF](https://huggingface.co/ggml-org/Qwen3.6-35B-A3B-GGUF) on Hugging Face (Apache-2.0), `Qwen3.6-35B-A3B-Q4_K_M.gguf` (20.4 GB) for `--context-model` and `mmproj-Qwen3.6-35B-A3B-Q8_0.gguf` for `--context-mmproj`. Plan for about 24 GB of free memory. On an Apple M5 Pro, Sintel (15 min, 2 breaks) takes 31 s in all, no cloud. See [eval/](eval/README.md) for how often it is right.

## How the breaks are chosen

- A break goes on a shot change. Black frames win over a plain shot change when they are within 60 s of it.
- No mid-roll in the first 120 s or in the last 60 s.
- At least 300 s between two mid-rolls.
- With the Rekognition mode below, also: no mid-roll inside opening credits, colour bars, slates or studio logos, and none from the start of the end credits to the end of the video. The local mode does not detect credits.

The VMAP has an optional pre-roll (`timeOffset="start"`), the mid-rolls (`hh:mm:ss.mmm`) and an optional post-roll (`timeOffset="end"`). Every break is `linear` and points to a VAST tag (`templateType="vast4"`).

Options:

| Flag | Default | Meaning |
|---|---|---|
| `--min-gap S` | 300 | minimum seconds between mid-rolls |
| `--first-break-after S` | 120 | no mid-roll before this time |
| `--max-breaks N` | no limit | at most N mid-rolls |
| `--avoid-last S` | 60 | no mid-roll in the last S seconds |
| `--out FILE` | standard output | where the VMAP goes |
| `--upload s3://B/PATH` | none | also put the VMAP to S3 with `Content-Type: application/xml`. A `PATH` that ends in `/` gets the `--out` name, or the video name with `.vmap`. Needs AWS credentials, see below |

Progress goes to standard error. Exit codes: `0` success, `1` AWS or job error, `2` bad arguments.

## Rekognition mode (AWS, paid)

Not run on real AWS yet. Its code is covered only by tests with fake AWS clients.

Instead of ffmpeg, the tool can use Amazon Rekognition Video segment detection on a video in S3:

1. It starts a job with two segment types: `SHOT` (hard cuts between camera shots) and `TECHNICAL_CUE` (black frames, opening and end credits, colour bars, slates, studio logos).
2. It waits for the job and reads all result pages.
3. It chooses the breaks by the rules above and writes the VMAP.

```sh
AWS_PROFILE=demo node tools/make-vmap/dist/main.js \
  --region us-east-1 \
  --bucket my-media --key movies/film.mp4 \
  --vast-url 'https://ads.example.com/vast?pos=mid' \
  --out breaks.vmap \
  --upload s3://my-ads/vmap/
```

`--region R` sets the AWS region (default: from the AWS environment). Speech and scene levels work only with `--local`.

### Cost and limits

Segment detection is a paid API. It is **not** in the Rekognition free tier.

| Segment type | Price (us-east-1, eu-west-1) |
|---|---|
| `SHOT` | $0.05 per minute of video |
| `TECHNICAL_CUE` | $0.05 per minute of video |

The tool requests both types, so one run costs about **$0.10 per minute of video**. A 90-minute film costs about $9. Check the current price on the Amazon Rekognition pricing page before a large run.

Video limits for stored video:

- codec: H.264
- container: MPEG-4 (`.mp4`) or MOV
- size: up to 10 GB
- length: up to 6 hours.

### Credentials and IAM

The tool reads credentials from the default AWS credential chain: environment variables, `~/.aws` profiles, SSO, or an instance or task role. Never put keys in arguments or files in this repository.

The identity needs these actions:

| Action | Resource |
|---|---|
| `rekognition:StartSegmentDetection` | `*` |
| `rekognition:GetSegmentDetection` | `*` |
| `s3:GetObject` | the source video, for example `arn:aws:s3:::my-media/movies/*` |
| `s3:PutObject` | only with `--upload`, for example `arn:aws:s3:::my-ads/vmap/*` |

Rekognition reads the video from S3 with the caller's permissions, so `s3:GetObject` must allow the video object. The bucket must be in the same region as the Rekognition call.

## What your ad server needs

The player can leave out an ad only when it knows the ad's category.


- An IAB category in each ad's VAST (`<Category>`). `make-vmap` uses IAB Ad Product Taxonomy 2.0 codes, for example `1571` for electric vehicles. An ad without a category is never left out.
- `[BLOCKEDADCATEGORIES]` in your VAST tag URL. The player fills it with the blocked categories of the break, so the ad server can send fitting ads up front.
- Spare ads in the response are a good idea: ads without `sequence` (a VAST 4 "ad buffet"). One of them takes the place of a blocked ad, in a pod too. Without them the break plays one ad less.

## Code

The steps are separate functions in `src/`: `ffmpegSegments` (`ffmpegSegments.ts`), `whisperTranscript` (`whisperSpeech.ts`), `rekognitionSegments` (`rekognition.ts`), `pickBreaks` (`pickBreaks.ts`), `breakContexts` (`breakContext.ts`) and `buildVmap` (`buildVmap.ts`). `buildVmap` also accepts `custParams` per break, for example scene labels. It appends them to the tag URL as one URL-encoded `cust_params` value.

## Tests

```sh
cd tools/make-vmap && npx jest
```

The tests use fake ports. They make no AWS calls and need no credentials. One test reads the generated VMAP with `requestVmap` from `packages/core` to check that the player accepts it.

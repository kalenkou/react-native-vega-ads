# Break context eval

How well does the vision model describe the scene before an ad break? This folder has the break points, a page to label them, and a script that runs the model on the labels.

## The set

`breaks.json` has 24 mid-roll points from three open films. make-vmap chose them with `--local --speech-model ggml-base.en.bin --min-gap 50 --first-break-after 40`, so the set has more breaks than a real schedule would.

- Tears of Steel (9) and Sintel (8): the set we choose the model and the prompt on.
- Big Buck Bunny (7): held out. It is not used for any choice; it is run once with the final model and prompt.

## Labels

The author labelled every break blind with `label-kit.mjs`: a page that shows the 30 s of film before each break and a checkbox per signal (`SENSITIVITY_RULES` in `src/breakContext.ts`). The page shows no model answers. The labels were saved before we compared any model with them, and were not changed after.

```sh
node eval/label-kit.mjs --media DIR --labels eval/breaks.json --out /tmp/label-kit
open /tmp/label-kit/index.html
```

"Save labels" downloads the labels in the format of `labels.json`.

## Run

```sh
cd tools/make-vmap && npm run build
node eval/run.mjs --media DIR --labels eval/labels.json \
  --context-model MODEL.gguf --context-mmproj MMPROJ.gguf \
  --speech-model ggml-base.en.bin
```

`DIR` holds `tears_of_steel_720p.mp4`, `sintel_720p.mp4` and `big_buck_bunny_720p.mp4`. The script needs `ffmpeg`, `whisper-cli` and `llama-mtmd-cli` on the `PATH`. It prints a Markdown table to standard output. Everything runs on this computer, with no cloud and no cost.

## Result

Not run yet on these labels.

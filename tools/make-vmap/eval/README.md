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
# One model at a time, thinking turned off (Gemma 4 and Qwen3.6 have a thinking channel).
llama-server -m MODEL.gguf --mmproj MMPROJ.gguf --reasoning off --port 8091 &
node eval/run.mjs --media DIR --labels eval/labels.json \
  --films tears_of_steel_720p.mp4,sintel_720p.mp4 \
  --context-server http://127.0.0.1:8091 --speech-model ggml-base.en.bin \
  --answers-out answers.json
```

`DIR` holds `tears_of_steel_720p.mp4`, `sintel_720p.mp4` and `big_buck_bunny_720p.mp4`. The script needs `ffmpeg`, `whisper-cli` and a running `llama-server` (or `llama-mtmd-cli` with `--context-model` and `--context-mmproj`). It prints a Markdown table to standard output; `--answers-out` saves the model's answers and `--answers-in` compares saved answers with the labels again without a model. `--frames`, `--frame-width` and `--plain-prompt` repeat the variants below. Everything runs on this computer, with no cloud and no cost: on an Apple M5 Pro a model takes about a minute for 17 breaks, transcription included.

## Result

Labels by the author, 12.10.2026, blind (no model answers shown before they were saved). 12 of the 24 labels are marked "unsure". The set is small: read the numbers as a direction, not as accuracy.

Metrics count signals: a signal the model reported that the label has (true), one the label does not have (false), one the label has that the model missed. "Sensitive or not" asks only whether a break has any signal.

### 1. Model, on the selection set (Tears of Steel + Sintel, 17 breaks: 13 sensitive, 4 calm)

Same prompt and frames (3 frames, 640 px), greedy decoding, answer bound to the JSON schema.

| Model (GGUF, Q4) | Signal precision | Signal recall | F1 | Sensitive or not | Calm breaks blocked | Sensitive breaks missed |
|---|---|---|---|---|---|---|
| Qwen2.5-VL-7B-Instruct | 0.20 | 0.11 | 0.14 | 5/17 | 2 of 4 | 10 of 13 |
| Gemma 4 26B-A4B-it | 0.36 | 0.21 | 0.27 | 8/17 | 3 of 4 | 6 of 13 |
| **Qwen3.6-35B-A3B** | **0.44** | **0.42** | **0.43** | **12/17** | 3 of 4 | **2 of 13** |

### 2. Frames and prompt, Qwen3.6, same 17 breaks

| Variant | Signal precision | Signal recall | F1 | Sensitive or not | Calm blocked | Missed |
|---|---|---|---|---|---|---|
| 3 frames, 640 px (as in step 1) | 0.44 | 0.42 | 0.43 | 12/17 | 3 | 2 |
| 5 frames (28, 21, 14, 7, 2 s before), 640 px | 0.36 | 0.42 | 0.39 | 13/17 | 3 | 1 |
| 5 frames, 1280 px | 0.32 | 0.32 | 0.32 | 13/17 | 2 | 2 |
| **3 frames, 640 px, the prompt says what counts as each signal** | **0.56** | **0.47** | **0.51** | 11/17 | 3 | 3 |

Chosen by signal F1, because each signal decides which ad categories are blocked: Qwen3.6-35B-A3B, 3 frames, and the signal definitions in the prompt (`SIGNAL_DEFINITIONS`, the same words the labelling page shows). This is now the default; `--plain-prompt` gives the old prompt.

### 3. Held-out film, run once with the chosen model and prompt (Big Buck Bunny, 7 breaks)

Nothing was chosen on this film. 5 of its 7 labels are "unsure".

| Break | Labelled | Model | Match |
|---|---|---|---|
| 0:52 | violence (unsure) | death | partly |
| 1:44 | none (unsure) | none | yes |
| 2:40 | none | none | yes |
| 3:31 | violence, death | violence | partly |
| 5:04 | weapons (unsure) | weapons | yes |
| 6:17 | violence (unsure) | weapons | partly |
| 7:45 | violence (unsure) | none | no |

Signal precision 0.50, recall 0.33, F1 0.40. Sensitive or not: 6/7. Calm breaks blocked: 0 of 2. Sensitive breaks missed: 1 of 5.

### 4. Only the labels the author was sure of

Same answers, the "unsure" breaks left out (selection set: 10 of 17 breaks, 8 sensitive, 2 calm).

| Model | Signal precision | Signal recall | Sensitive or not | Calm blocked | Missed |
|---|---|---|---|---|---|
| Qwen2.5-VL-7B-Instruct | 0.40 | 0.17 | 5/10 | 0 of 2 | 5 of 8 |
| Qwen3.6-35B-A3B, chosen prompt | 0.55 | 0.50 | 7/10 | 2 of 2 | 1 of 8 |

The choice holds without the unsure labels.

### What this means

- The chosen setting finds most sensitive breaks (10 of 13 on the selection set, 4 of 5 on the held-out film); the older model found 3 of 13.
- It still names the wrong signal often, and on the selection set it blocked 3 of the 4 calm breaks. A blocked break only drops some ad categories (rules in `SENSITIVITY_RULES`), it does not drop the break.
- One person labelled the breaks, half of them unsure, on three animated or effects-heavy open films. A second labeller and more films would be the next step.

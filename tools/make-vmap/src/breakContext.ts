import type { BreakContext } from './buildVmap';
import type { TimedLine } from './whisperSpeech';

/** IAB Ad Product Taxonomy 2.0 codes the default rules use, with their names. */
export const AD_CATEGORIES: Readonly<Record<string, string>> = {
  '1002': 'Alcohol',
  '1003': 'Bars',
  '1004': 'Beer',
  '1005': 'Hard Sodas, Seltzers, Alco Pops',
  '1006': 'Spirits',
  '1007': 'Wine',
  '1248': 'Toys and Games',
  '1343': 'Life Insurance',
  '1524': 'Sporting Goods',
  '1551': 'Vehicles',
  '1571': 'Electric Vehicles',
};

const ALCOHOL = ['1002', '1003', '1004', '1005', '1006', '1007'];

/**
 * What the model may say is in a scene, and the ad categories each one blocks right after it.
 * The model only reports what it sees and hears; these rules decide, so every block can be
 * explained and a publisher can change them.
 */
export const SENSITIVITY_RULES: Readonly<Record<string, readonly string[]>> = {
  death: ['1343', '1248', ...ALCOHOL],
  grief: ['1248', ...ALCOHOL],
  violence: ['1248', ...ALCOHOL],
  weapons: ['1248'],
  'vehicle crash': ['1551', '1571'],
  injury: ['1343', '1524'],
  drinking: ['1551', '1571'],
  'child in danger': ['1248'],
};

export const MOODS = ['calm', 'happy', 'romantic', 'sad', 'tense', 'violent'] as const;

const SCENE_MAX = 200;

/** Words of a guess: evidence that only "suggests" something does not block an ad. */
const GUESS = /\b(suggests?|suggesting|potential(ly)?|possibl[ey]|could|may|might|appears?|seems?|likely|resembl\w*|indicat\w*|impl(y|ies))\b/i;

/** Evidence that the thing is not there; the schema makes the model fill the field anyway. */
const ABSENT = /\b(no evidence|there (is|are) no|no (signs?|mention)|(is|are) not (visible|shown|seen|present|mentioned)|none)\b|^no \w+ (is|are)\b/i;

/** Seconds before the break of the frames the model looks at. */
const FRAME_OFFSETS = [28, 15, 2];

/** Seconds of dialogue before the break the model reads. */
const DIALOGUE_SECONDS = 60;

/** The times of the frames before a break at `at` seconds; none before the start. */
export function frameTimes(at: number): number[] {
  return FRAME_OFFSETS.map((offset) => at - offset).filter((time) => time >= 0);
}

/** ffmpeg arguments that write the frame at `time` seconds as a 640-pixel-wide JPEG. */
export function frameArgs(file: string, time: number, out: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', out];
}

/** The lines spoken (and sound labels) in the minute before a break at `at` seconds. */
export function dialogueBefore(lines: readonly TimedLine[], at: number): string {
  const from = (at - DIALOGUE_SECONDS) * 1000;
  const to = at * 1000;
  return lines
    .filter((line) => line.startMs >= from && line.startMs < to)
    .map((line) => line.text)
    .join(' ');
}

/** JSON schema for llama.cpp: the model can answer only with known moods and codes. */
export function contextSchema(): object {
  return {
    type: 'object',
    properties: {
      scene: { type: 'string', maxLength: SCENE_MAX },
      mood: { enum: [...MOODS] },
      signals: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: { signal: { enum: Object.keys(SENSITIVITY_RULES) }, evidence: { type: 'string', maxLength: 100 } },
          required: ['signal', 'evidence'],
        },
      },
    },
    required: ['scene', 'mood', 'signals'],
  };
}

export function contextPrompt(dialogue: string, frames: number): string {
  const said = dialogue ? `The dialogue of the minute before it: "${dialogue}".` : 'There is no dialogue in the minute before it.';
  return [
    `You place TV ad breaks. ${frames} frames from the 30 seconds before an ad break are attached. ${said}`,
    'Describe the scene in under 20 words and give its mood. Then list sensitive content the scene clearly',
    `shows or talks about, from: ${Object.keys(SENSITIVITY_RULES).join(', ')}. For each, give the evidence:`,
    'what exactly is visible in a frame or said in a line. Do not guess: if you cannot point to it, leave it',
    'out. Most scenes have none.',
  ].join(' ');
}

/**
 * The model's answer as a break context, or null when it cannot be trusted: no JSON, an unknown
 * mood or signal. The rules turn the signals into blocked categories. A break without context
 * plays every ad, as before.
 */
export function parseContext(output: string): BreakContext | null {
  let answer: { scene?: unknown; mood?: unknown; signals?: unknown };
  try {
    answer = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)) as typeof answer;
  } catch {
    return null;
  }
  const { scene, mood, signals } = answer;
  if (
    typeof scene !== 'string' ||
    !MOODS.includes(mood as (typeof MOODS)[number]) ||
    !Array.isArray(signals) ||
    !signals.every((s: { signal?: unknown; evidence?: unknown } | null) => {
      return typeof s?.signal === 'string' && s.signal in SENSITIVITY_RULES && typeof s.evidence === 'string';
    })
  ) {
    return null;
  }
  const found = new Map<string, string>();
  for (const { signal, evidence } of signals as Array<{ signal: string; evidence: string }>) {
    const seen = evidence.trim();
    if (seen !== '' && !GUESS.test(seen) && !ABSENT.test(seen) && !found.has(signal)) {
      found.set(signal, seen);
    }
  }
  const blocked = [...found.keys()].flatMap((signal) => SENSITIVITY_RULES[signal] ?? []);
  return {
    scene: scene.trim().slice(0, SCENE_MAX),
    mood: mood as string,
    signals: [...found].map(([name, evidence]) => ({ name, evidence })),
    blockedAdCategories: [...new Set(blocked)],
  };
}

export interface VisionModel {
  /** A GGUF vision-language model, for example Qwen2.5-VL-7B-Instruct. */
  model: string;
  /** Its multimodal projector (mmproj GGUF). */
  mmproj: string;
}

/** Arguments for llama.cpp's `llama-mtmd-cli`: greedy decoding, the answer bound to the schema. */
export function llamaVisionArgs(vision: VisionModel, prompt: string, images: readonly string[], schemaFile: string): string[] {
  return [
    '-m', vision.model,
    '--mmproj', vision.mmproj,
    ...images.flatMap((image) => ['--image', image]),
    '-p', prompt,
    '-jf', schemaFile,
    '--temp', '0',
    '-n', '256',
  ];
}

/**
 * A chat request for llama.cpp's `llama-server` (OpenAI-compatible `/v1/chat/completions`):
 * the frames as JPEG data URLs, then the prompt; greedy decoding, the answer bound to the schema.
 * Start the server with `--reasoning off`: models with a thinking channel (Gemma 4, Qwen3.6)
 * then answer with the JSON only.
 */
export function llamaServerRequest(prompt: string, jpegs: readonly Uint8Array[], schema: object): object {
  return {
    messages: [
      {
        role: 'user',
        content: [
          ...jpegs.map((jpeg) => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}` },
          })),
          { type: 'text', text: prompt },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 256,
    response_format: { type: 'json_schema', json_schema: { name: 'break_context', schema } },
  };
}

export interface BreakContextDeps {
  /** Writes the frames before a break at `at` seconds and resolves with their files. */
  frames(at: number): Promise<string[]>;
  /** The transcript, from whisper.cpp. */
  lines: readonly TimedLine[];
  /** Asks the vision model and resolves with its raw output. */
  ask(prompt: string, images: string[]): Promise<string>;
}

/** The context of each break, in order; null where the model failed or gave no usable answer. */
export async function breakContexts(times: readonly number[], deps: BreakContextDeps): Promise<Array<BreakContext | null>> {
  const result: Array<BreakContext | null> = [];
  for (const at of times) {
    try {
      const images = await deps.frames(at);
      result.push(parseContext(await deps.ask(contextPrompt(dialogueBefore(deps.lines, at), images.length), images)));
    } catch {
      result.push(null);
    }
  }
  return result;
}

import type { BreakContext } from './buildVmap';
import type { TimedLine } from './whisperSpeech';

/**
 * Ad categories the model may block, from the IAB Ad Product Taxonomy 2.0: the products of the
 * demo ads and a few that often clash with a scene. `children` are blocked with their parent.
 */
export const AD_CATEGORIES: ReadonlyArray<{ code: string; name: string; children?: readonly string[] }> = [
  { code: '1002', name: 'Alcohol', children: ['1003', '1004', '1005', '1006', '1007'] },
  { code: '1070', name: 'Footwear' },
  { code: '1133', name: 'Coffee and Tea' },
  { code: '1203', name: 'Office/School Supplies' },
  { code: '1248', name: 'Toys and Games' },
  { code: '1343', name: 'Life Insurance' },
  { code: '1524', name: 'Sporting Goods' },
  { code: '1551', name: 'Vehicles', children: ['1571'] },
  { code: '1571', name: 'Electric Vehicles' },
];

export const MOODS = ['calm', 'happy', 'romantic', 'sad', 'tense', 'violent'] as const;

const SCENE_MAX = 200;

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
      avoid: { type: 'array', items: { enum: AD_CATEGORIES.map((c) => c.code) } },
    },
    required: ['scene', 'mood', 'avoid'],
  };
}

export function contextPrompt(dialogue: string, frames: number): string {
  const said = dialogue ? `The dialogue of the minute before it: "${dialogue}".` : 'There is no dialogue in the minute before it.';
  return [
    `You place TV ad breaks. ${frames} frames from the 30 seconds before an ad break are attached. ${said}`,
    'Describe the scene in under 20 words, give its mood, and list the ad categories that would feel',
    'wrong or insensitive right after this scene (brand safety). Leave the list empty if all fit.',
    `Categories: ${AD_CATEGORIES.map((c) => `${c.code} ${c.name}`).join('; ')}.`,
  ].join(' ');
}

/**
 * The model's answer as a break context, or null when it cannot be trusted: no JSON, an unknown
 * mood or category. A break without context plays every ad, as before.
 */
export function parseContext(output: string): BreakContext | null {
  let answer: { scene?: unknown; mood?: unknown; avoid?: unknown };
  try {
    answer = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)) as typeof answer;
  } catch {
    return null;
  }
  const { scene, mood, avoid } = answer;
  const known = new Map(AD_CATEGORIES.map((c) => [c.code, c]));
  if (
    typeof scene !== 'string' ||
    !MOODS.includes(mood as (typeof MOODS)[number]) ||
    !Array.isArray(avoid) ||
    !avoid.every((code) => typeof code === 'string' && known.has(code))
  ) {
    return null;
  }
  const blocked = (avoid as string[]).flatMap((code) => [code, ...(known.get(code)?.children ?? [])]);
  return { scene: scene.trim().slice(0, SCENE_MAX), mood: mood as string, blockedAdCategories: [...new Set(blocked)] };
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

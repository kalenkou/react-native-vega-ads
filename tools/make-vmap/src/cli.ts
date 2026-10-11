import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { breakContexts, contextSchema, frameArgs, frameTimes, llamaVisionArgs, VisionModel } from './breakContext';
import { BreakContext, buildVmap, formatTimeOffset } from './buildVmap';
import { FfmpegRunner, ffmpegSegments } from './ffmpegSegments';
import { pickBreaks, PickBreaksOptions, SpeechInterval } from './pickBreaks';
import { RekognitionPort, rekognitionSegments } from './rekognition';
import type { Segment } from './segments';
import { TimedLine, WhisperTools, whisperTranscript } from './whisperSpeech';

export const USAGE = `Usage: make-vmap --bucket B --key K --vast-url URL [options]
       make-vmap --local FILE --vast-url URL [options]

Finds mid-roll points in a video and writes a VMAP 1.0 document: with Amazon
Rekognition segment detection for a video in S3, or with ffmpeg on this computer
(shot changes and silent black frames, no cloud, no cost). With --speech-model,
whisper.cpp also finds speech on this computer, and no mid-roll cuts a line.

Required:
  --bucket B              S3 bucket of the video (Rekognition)
  --key K                 S3 key of the video (H.264 .mp4 or .mov)
  --local FILE            a video file on this computer instead (needs ffmpeg)
  --vast-url URL          VAST tag URL for every mid-roll

Options:
  --speech-model FILE     whisper.cpp model (ggml .bin) for --local: keep mid-rolls
                          out of speech (needs whisper-cli)
  --context-model FILE    vision-language model (GGUF) for --local: from the frames and
                          lines before each mid-roll, write its mood and the ad
                          categories it blocks (needs llama-mtmd-cli)
  --context-mmproj FILE   the model's multimodal projector (GGUF)
  --preroll URL           VAST tag URL for a pre-roll
  --postroll URL          VAST tag URL for a post-roll
  --out FILE              write the VMAP to FILE (default: standard output)
  --upload s3://B/PATH    also put the VMAP to S3 (a PATH ending in / gets a file name)
  --region R              AWS region (default: from the AWS environment)
  --min-gap S             minimum seconds between mid-rolls (default 300)
  --first-break-after S   no mid-roll before S seconds (default 120)
  --max-breaks N          at most N mid-rolls (default: no limit)
  --avoid-last S          no mid-roll in the last S seconds (default 60)
  -h, --help              show this help`;

/** A command-line mistake: the CLI prints usage and exits with code 2. */
export class UsageError extends Error {
  override name = 'UsageError';
}

export interface S3Location {
  bucket: string;
  key: string;
}

export interface CliOptions {
  bucket?: string;
  key?: string;
  /** A local video file: breaks come from ffmpeg instead of Rekognition. */
  local?: string;
  /** A whisper.cpp model: breaks keep out of speech (with `local` only). */
  speechModel?: string;
  /** A vision-language model: each break gets its context (with `local` only). */
  context?: VisionModel;
  vastUrl: string;
  preroll?: string;
  postroll?: string;
  out?: string;
  upload?: S3Location;
  region?: string;
  breaks: Omit<PickBreaksOptions, 'durationSeconds' | 'speech'>;
}

export interface PutObjectRequest {
  Bucket: string;
  Key: string;
  Body: string;
  ContentType: string;
}

export interface StoragePort {
  putObject(request: PutObjectRequest): Promise<void>;
}

export interface CliDeps {
  /** Creates the AWS clients. Credentials come from the default AWS credential chain. */
  createPorts(region: string | undefined): { rekognition: RekognitionPort; storage: StoragePort };
  writeFile(path: string, text: string): Promise<void>;
  stdout(text: string): void;
  stderr(text: string): void;
  sleep?: (ms: number) => Promise<void>;
  /** Runs ffmpeg and resolves with its stderr; needed for --local. */
  runFfmpeg?: FfmpegRunner;
  /** Runs whisper-cli and handles its temporary files; needed for --speech-model. */
  whisper?: Omit<WhisperTools, 'runFfmpeg'>;
  /** Runs llama-mtmd-cli (resolves with its stdout) and handles temporary files; needed for --context-model. */
  vision?: {
    run(args: string[]): Promise<string>;
    makeTempDir(): Promise<string>;
    removeDir(path: string): Promise<void>;
  };
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `s3://bucket/key`. When the key is empty or ends with `/`, `fileName` is added to it. */
export function parseS3Url(url: string, fileName?: string): S3Location {
  const match = /^s3:\/\/([^/]+)(?:\/(.*))?$/.exec(url);
  if (!match) throw new UsageError(`Not an s3://bucket/path URL: ${url}`);
  const bucket = match[1]!;
  let key = match[2] ?? '';
  if (key === '' || key.endsWith('/')) {
    if (!fileName) throw new UsageError(`No file name in ${url}`);
    key += fileName;
  }
  return { bucket, key };
}

function number(name: string, text: string | undefined, integer = false): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new UsageError(`--${name} needs a non-negative ${integer ? 'integer' : 'number'}, got "${text}"`);
  }
  return value;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new UsageError(`--${name} is required`);
  return value;
}

/** Drops undefined fields so the result compares and prints cleanly. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

const FLAGS = {
  bucket: { type: 'string' },
  key: { type: 'string' },
  local: { type: 'string' },
  'speech-model': { type: 'string' },
  'context-model': { type: 'string' },
  'context-mmproj': { type: 'string' },
  'vast-url': { type: 'string' },
  preroll: { type: 'string' },
  postroll: { type: 'string' },
  out: { type: 'string' },
  upload: { type: 'string' },
  region: { type: 'string' },
  'min-gap': { type: 'string' },
  'first-break-after': { type: 'string' },
  'max-breaks': { type: 'string' },
  'avoid-last': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

function readFlags(argv: string[]) {
  try {
    return parseArgs({ args: argv, options: FLAGS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

export function parseCliArgs(argv: string[]): CliOptions {
  const flags = readFlags(argv);
  const local = flags.local;
  if (local !== undefined && (flags.bucket !== undefined || flags.key !== undefined)) {
    throw new UsageError('--local reads a file on this computer: leave out --bucket and --key');
  }
  if (flags['speech-model'] !== undefined && local === undefined) {
    throw new UsageError('--speech-model needs the video on this computer: use it with --local');
  }
  const model = flags['context-model'];
  const mmproj = flags['context-mmproj'];
  if ((model === undefined) !== (mmproj === undefined)) {
    throw new UsageError('--context-model and --context-mmproj go together');
  }
  if (model !== undefined && local === undefined) {
    throw new UsageError('--context-model needs the video on this computer: use it with --local');
  }
  const key = local === undefined ? required('key', flags.key) : undefined;
  const bucket = local === undefined ? required('bucket', flags.bucket) : undefined;
  const vastUrl = required('vast-url', flags['vast-url']);
  const source = local ?? key!;
  const fileName = flags.out ? baseName(flags.out) : `${baseName(source).replace(/\.[^.]*$/, '')}.vmap`;

  return defined({
    bucket,
    key,
    local,
    speechModel: flags['speech-model'],
    context: model === undefined || mmproj === undefined ? undefined : { model, mmproj },
    vastUrl,
    preroll: flags.preroll,
    postroll: flags.postroll,
    out: flags.out,
    upload: flags.upload === undefined ? undefined : parseS3Url(flags.upload, fileName),
    region: flags.region,
    breaks: defined({
      minGapSeconds: number('min-gap', flags['min-gap']),
      firstBreakAfterSeconds: number('first-break-after', flags['first-break-after']),
      maxBreaks: number('max-breaks', flags['max-breaks'], true),
      avoidLastSeconds: number('avoid-last', flags['avoid-last']),
    }),
  });
}

/** Runs the tool and returns the process exit code: 0 success, 1 failure, 2 bad arguments. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let options: CliOptions;
  try {
    if (readFlags(argv).help) {
      deps.stdout(USAGE);
      return 0;
    }
    options = parseCliArgs(argv);
  } catch (error) {
    deps.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }

  try {
    let ports: ReturnType<CliDeps['createPorts']> | undefined;
    const aws = () => (ports ??= deps.createPorts(options.region));
    let detection: { segments: Segment[]; durationSeconds?: number };
    let speech: SpeechInterval[] | undefined;
    let lines: TimedLine[] = [];
    if (options.local !== undefined) {
      if (!deps.runFfmpeg) throw new Error('ffmpeg is not available');
      deps.stderr(`Finding shot changes, black frames and silence in ${options.local} with ffmpeg`);
      detection = await ffmpegSegments(options.local, deps.runFfmpeg);
      deps.stderr(`${detection.segments.length} segments`);
      if (options.speechModel !== undefined) {
        if (!deps.whisper) throw new Error('whisper-cli is not available');
        deps.stderr(`Finding speech in ${options.local} with whisper.cpp`);
        ({ speech, lines } = await whisperTranscript(options.local, options.speechModel, { ...deps.whisper, runFfmpeg: deps.runFfmpeg }));
        deps.stderr(`${speech.length} ${speech.length === 1 ? 'stretch' : 'stretches'} of speech`);
      }
    } else {
      deps.stderr(`Starting segment detection for s3://${options.bucket}/${options.key}`);
      const job = await rekognitionSegments(
        aws().rekognition,
        { bucket: options.bucket!, key: options.key! },
        { sleep: deps.sleep },
      );
      deps.stderr(`Job ${job.jobId}: ${job.segments.length} segments`);
      detection = job;
    }

    const times = pickBreaks(detection.segments, { ...options.breaks, durationSeconds: detection.durationSeconds, speech });
    deps.stderr(`${times.length} mid-rolls: ${times.map(formatTimeOffset).join(', ') || 'none'}`);

    const contexts = options.context ? await contextOf(times, options, lines, deps) : [];

    const xml = buildVmap({
      preroll: options.preroll,
      midrolls: times.map((time, index) => ({ time, vastUrl: options.vastUrl, context: contexts[index] ?? undefined })),
      postroll: options.postroll,
    });

    if (options.out) {
      await deps.writeFile(options.out, xml);
      deps.stderr(`Wrote ${options.out}`);
    } else {
      deps.stdout(xml);
    }
    if (options.upload) {
      const { bucket, key } = options.upload;
      await aws().storage.putObject({ Bucket: bucket, Key: key, Body: xml, ContentType: 'application/xml' });
      deps.stderr(`Uploaded s3://${bucket}/${key}`);
    }
    return 0;
  } catch (error) {
    deps.stderr(`make-vmap failed: ${(error as Error).message}`);
    return 1;
  }
}

/** Asks the vision model about each break; frames and the schema live in a temporary folder. */
async function contextOf(
  times: readonly number[],
  options: CliOptions,
  lines: readonly TimedLine[],
  deps: CliDeps,
): Promise<Array<BreakContext | null>> {
  const vision = deps.vision;
  const runFfmpeg = deps.runFfmpeg;
  if (!vision || !runFfmpeg) throw new Error('llama-mtmd-cli is not available');
  const model = options.context!;
  const dir = await vision.makeTempDir();
  try {
    const schema = join(dir, 'schema.json');
    await deps.writeFile(schema, JSON.stringify(contextSchema()));
    deps.stderr(`Reading the scene before each mid-roll with ${model.model}`);
    const contexts = await breakContexts(times, {
      lines,
      frames: async (at) => {
        const files = frameTimes(at).map((time) => join(dir, `frame-${time}.jpg`));
        for (const [index, time] of frameTimes(at).entries()) {
          await runFfmpeg(frameArgs(options.local!, time, files[index]!));
        }
        return files;
      },
      ask: (prompt, images) => vision.run(llamaVisionArgs(model, prompt, images, schema)),
    });
    contexts.forEach((context, index) => {
      const at = formatTimeOffset(times[index]!);
      const blocked = context?.blockedAdCategories.length
        ? `${context.signals?.map((s) => `${s.name} (${s.evidence})`).join(', ')} → blocks ${context.blockedAdCategories.join(' ')}`
        : 'blocks nothing';
      deps.stderr(context ? `${at} · ${context.mood} · ${blocked} · ${context.scene ?? ''}` : `${at} · no context`);
    });
    return contexts;
  } finally {
    await vision.removeDir(dir);
  }
}


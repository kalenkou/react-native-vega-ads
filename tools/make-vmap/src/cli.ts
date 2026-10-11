import { parseArgs } from 'node:util';
import { buildVmap, formatTimeOffset } from './buildVmap';
import { pickBreaks, PickBreaksOptions } from './pickBreaks';
import { RekognitionPort, rekognitionSegments } from './rekognition';

export const USAGE = `Usage: make-vmap --bucket B --key K --vast-url URL [options]

Finds mid-roll points in a video in S3 with Amazon Rekognition segment detection
and writes a VMAP 1.0 document.

Required:
  --bucket B              S3 bucket of the video
  --key K                 S3 key of the video (H.264 .mp4 or .mov)
  --vast-url URL          VAST tag URL for every mid-roll

Options:
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
  bucket: string;
  key: string;
  vastUrl: string;
  preroll?: string;
  postroll?: string;
  out?: string;
  upload?: S3Location;
  region?: string;
  breaks: Omit<PickBreaksOptions, 'durationSeconds'>;
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
  const key = required('key', flags.key);
  const bucket = required('bucket', flags.bucket);
  const vastUrl = required('vast-url', flags['vast-url']);
  const fileName = flags.out ? baseName(flags.out) : `${baseName(key).replace(/\.[^.]*$/, '')}.vmap`;

  return defined({
    bucket,
    key,
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
    const { rekognition, storage } = deps.createPorts(options.region);
    deps.stderr(`Starting segment detection for s3://${options.bucket}/${options.key}`);
    const detection = await rekognitionSegments(
      rekognition,
      { bucket: options.bucket, key: options.key },
      { sleep: deps.sleep },
    );
    deps.stderr(`Job ${detection.jobId}: ${detection.segments.length} segments`);

    const times = pickBreaks(detection.segments, { ...options.breaks, durationSeconds: detection.durationSeconds });
    deps.stderr(`${times.length} mid-rolls: ${times.map(formatTimeOffset).join(', ') || 'none'}`);

    const xml = buildVmap({
      preroll: options.preroll,
      midrolls: times.map((time) => ({ time, vastUrl: options.vastUrl })),
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
      await storage.putObject({ Bucket: bucket, Key: key, Body: xml, ContentType: 'application/xml' });
      deps.stderr(`Uploaded s3://${bucket}/${key}`);
    }
    return 0;
  } catch (error) {
    deps.stderr(`make-vmap failed: ${(error as Error).message}`);
    return 1;
  }
}

import { CliDeps, parseCliArgs, parseS3Url, PutObjectRequest, runCli, UsageError } from '../src/cli';
import type { GetSegmentDetectionResponse, RekognitionPort } from '../src/rekognition';
import { cue, shotsEvery } from './helpers';

const VAST = 'https://ads.test/vast?pos=mid';
const REQUIRED = ['--bucket', 'media', '--key', 'movies/film.mp4', '--vast-url', VAST];

function fakeDeps(response: GetSegmentDetectionResponse) {
  const puts: PutObjectRequest[] = [];
  const files = new Map<string, string>();
  const out: string[] = [];
  const err: string[] = [];
  const regions: Array<string | undefined> = [];
  const rekognition: RekognitionPort = {
    startSegmentDetection: () => Promise.resolve({ JobId: 'job-9' }),
    getSegmentDetection: () => Promise.resolve(response),
  };
  const deps: CliDeps = {
    createPorts: (region) => {
      regions.push(region);
      return { rekognition, storage: { putObject: (request) => (puts.push(request), Promise.resolve()) } };
    },
    writeFile: (path, text) => (files.set(path, text), Promise.resolve()),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    sleep: () => Promise.resolve(),
  };
  return { deps, puts, files, out, err, regions };
}

const FILM: GetSegmentDetectionResponse = {
  JobStatus: 'SUCCEEDED',
  VideoMetadata: [{ DurationMillis: 1_800_000 }],
  Segments: [...shotsEvery(50, 1800), cue('BlackFrames', 470, 472), cue('EndCredits', 1500, 1800)],
};

describe('parseS3Url', () => {
  it('splits an s3:// URL into bucket and key', () => {
    expect(parseS3Url('s3://my-bucket/vmap/film.vmap')).toEqual({ bucket: 'my-bucket', key: 'vmap/film.vmap' });
  });

  it('adds a file name to a key that ends with a slash', () => {
    expect(parseS3Url('s3://my-bucket/vmap/', 'film.vmap')).toEqual({ bucket: 'my-bucket', key: 'vmap/film.vmap' });
    expect(parseS3Url('s3://my-bucket', 'film.vmap')).toEqual({ bucket: 'my-bucket', key: 'film.vmap' });
  });

  it('rejects other URLs', () => {
    expect(() => parseS3Url('https://my-bucket/a')).toThrow(UsageError);
    expect(() => parseS3Url('s3:///a')).toThrow(UsageError);
  });
});

describe('parseCliArgs', () => {
  it('reads the required and optional flags', () => {
    expect(
      parseCliArgs([
        ...REQUIRED,
        '--preroll',
        'https://ads.test/pre',
        '--postroll',
        'https://ads.test/post',
        '--out',
        'film.vmap',
        '--upload',
        's3://out-bucket/vmap/',
        '--region',
        'eu-west-1',
        '--min-gap',
        '420',
        '--first-break-after',
        '90',
        '--max-breaks',
        '3',
        '--avoid-last',
        '30',
      ]),
    ).toEqual({
      bucket: 'media',
      key: 'movies/film.mp4',
      vastUrl: VAST,
      preroll: 'https://ads.test/pre',
      postroll: 'https://ads.test/post',
      out: 'film.vmap',
      upload: { bucket: 'out-bucket', key: 'vmap/film.vmap' },
      region: 'eu-west-1',
      breaks: { minGapSeconds: 420, firstBreakAfterSeconds: 90, maxBreaks: 3, avoidLastSeconds: 30 },
    });
  });

  it('names the upload file after the video when there is no --out', () => {
    expect(parseCliArgs([...REQUIRED, '--upload', 's3://out-bucket/']).upload).toEqual({
      bucket: 'out-bucket',
      key: 'film.vmap',
    });
  });

  it.each([
    [['--key', 'k', '--vast-url', VAST], /--bucket/],
    [['--bucket', 'b', '--vast-url', VAST], /--key/],
    [['--bucket', 'b', '--key', 'k'], /--vast-url/],
    [[...REQUIRED, '--max-breaks', 'many'], /--max-breaks/],
    [[...REQUIRED, '--min-gap', '-5'], /--min-gap/],
    [[...REQUIRED, '--colour', 'red'], /colour/],
    [[...REQUIRED, 'extra'], /extra/],
    [['--bucket', 'b', '--key', 'k', '--vast-url', 'not a url'], /--vast-url/],
    [[...REQUIRED, '--preroll', 'ftp://ads.test/pre.xml'], /--preroll/],
    [[...REQUIRED, '--postroll', 'post.xml'], /--postroll/],
    [['--local', 'film.mp4', '--vast-url', VAST, '--context-model', 'm.gguf', '--context-mmproj', 'p.gguf'], /--speech-model/],
  ])('rejects %p', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});

describe('runCli', () => {
  it('prints the VMAP to stdout when there is no --out', async () => {
    const { deps, out, err, puts, regions } = fakeDeps(FILM);
    await expect(runCli(REQUIRED, deps)).resolves.toBe(0);
    expect(regions).toEqual([undefined]);
    expect(puts).toEqual([]);
    expect(out).toHaveLength(1);
    // Cuts every 50 s, black frames at 471 s, end credits from 1500 s: 150, 471, 800, 1100, 1400.
    const offsets = [...out[0]!.matchAll(/timeOffset="([^"]+)"/g)].map((match) => match[1]);
    expect(offsets).toEqual(['00:02:30.000', '00:07:51.000', '00:13:20.000', '00:18:20.000', '00:23:20.000']);
    expect(err.join('\n')).toContain('s3://media/movies/film.mp4');
    expect(err.join('\n')).toContain('job-9');
    expect(err.join('\n')).toContain('5 mid-rolls');
  });

  it('writes the file, uploads it as XML and adds pre- and post-rolls', async () => {
    const { deps, files, puts, out } = fakeDeps(FILM);
    const argv = [
      ...REQUIRED,
      '--preroll',
      'https://ads.test/pre',
      '--postroll',
      'https://ads.test/post',
      '--out',
      'breaks.vmap',
      '--upload',
      's3://out-bucket/vmap/film.vmap',
      '--region',
      'us-east-1',
    ];
    await expect(runCli(argv, deps)).resolves.toBe(0);
    const xml = files.get('breaks.vmap');
    expect(xml).toContain('timeOffset="start"');
    expect(xml).toContain('timeOffset="end"');
    expect(puts).toEqual([{ Bucket: 'out-bucket', Key: 'vmap/film.vmap', Body: xml, ContentType: 'application/xml' }]);
    expect(out).toEqual([]);
  });

  it('prints usage and returns 2 on bad arguments', async () => {
    const { deps, err } = fakeDeps(FILM);
    await expect(runCli(['--bucket', 'b'], deps)).resolves.toBe(2);
    expect(err.join('\n')).toMatch(/Usage: make-vmap/);
  });

  it('prints usage and returns 0 for --help', async () => {
    const { deps, out } = fakeDeps(FILM);
    await expect(runCli(['--help'], deps)).resolves.toBe(0);
    expect(out.join('\n')).toMatch(/Usage: make-vmap/);
  });

  it('returns 1 and prints the error when the job fails', async () => {
    const { deps, err } = fakeDeps({ JobStatus: 'FAILED', StatusMessage: 'Access denied to S3 object' });
    await expect(runCli(REQUIRED, deps)).resolves.toBe(1);
    expect(err.join('\n')).toContain('Access denied to S3 object');
  });
});

describe('local mode (ffmpeg, no AWS)', () => {
  const LOCAL_LOG = [
    '  Duration: 00:30:00.00, start: 0.000000, bitrate: 4000 kb/s',
    '[Parsed_silencedetect_0 @ 0x1] silence_start: 469.5',
    '[Parsed_blackdetect_0 @ 0x2] black_start:470 black_end:472 black_duration:2',
    '[Parsed_silencedetect_0 @ 0x1] silence_end: 473 | silence_duration: 3.5',
  ].join('\n');

  it('needs only --local and --vast-url', () => {
    expect(parseCliArgs(['--local', 'film.mp4', '--vast-url', VAST])).toEqual({ local: 'film.mp4', vastUrl: VAST, breaks: {} });
  });

  it('rejects --local together with --bucket or --key', () => {
    expect(() => parseCliArgs(['--local', 'film.mp4', '--bucket', 'b', '--vast-url', VAST])).toThrow(/--local/);
  });

  it('finds breaks with ffmpeg and creates no AWS client', async () => {
    const ctx = fakeDeps(FILM);
    const runs: string[][] = [];
    ctx.deps.runFfmpeg = async (args) => (runs.push(args), LOCAL_LOG);
    const created: unknown[] = [];
    const createPorts = ctx.deps.createPorts;
    ctx.deps.createPorts = (region) => (created.push(region), createPorts(region));
    expect(await runCli(['--local', 'film.mp4', '--vast-url', VAST], ctx.deps)).toBe(0);
    expect(runs[0]).toEqual(expect.arrayContaining(['-i', 'film.mp4']));
    expect(created).toEqual([]);
    expect(ctx.out.join('')).toContain('timeOffset="00:07:51.000"');
  });
});

describe('speech (whisper.cpp, no AWS)', () => {
  // Silent black frames at 471 s and a shot change at 500 s; someone speaks from 469 s to 474 s.
  const LOG = [
    '  Duration: 00:30:00.00, start: 0.000000, bitrate: 4000 kb/s',
    '[Parsed_silencedetect_0 @ 0x1] silence_start: 469.5',
    '[Parsed_blackdetect_0 @ 0x2] black_start:470 black_end:472 black_duration:2',
    '[Parsed_silencedetect_0 @ 0x1] silence_end: 473 | silence_duration: 3.5',
    '[Parsed_showinfo_2 @ 0x3] n:   0 pts: 0 pts_time:500 duration:512',
  ].join('\n');
  const WHISPER_JSON = JSON.stringify({
    transcription: [{ offsets: { from: 469000, to: 474000 }, tokens: [{ text: ' Hello', offsets: { from: 469000, to: 474000 } }] }],
  });
  const ARGV = ['--local', 'film.mp4', '--vast-url', VAST, '--speech-model', 'models/ggml-base.en.bin'];

  function speechDeps() {
    const ctx = fakeDeps(FILM);
    const runs: string[][] = [];
    const removed: string[] = [];
    ctx.deps.runFfmpeg = async (args) => (runs.push(args), args.includes('null') ? LOG : '');
    ctx.deps.whisper = {
      runWhisper: async (args) => void runs.push(args),
      readFile: async () => WHISPER_JSON,
      makeTempDir: async () => '/tmp/make-vmap-x',
      removeDir: async (path) => void removed.push(path),
    };
    return { ...ctx, runs, removed };
  }

  it('reads --speech-model with --local', () => {
    expect(parseCliArgs(ARGV)).toEqual({ local: 'film.mp4', vastUrl: VAST, speechModel: 'models/ggml-base.en.bin', breaks: {} });
  });

  it('rejects --speech-model without --local', () => {
    expect(() => parseCliArgs([...REQUIRED, '--speech-model', 'model.bin'])).toThrow(/--speech-model/);
  });

  it('keeps the break out of speech', async () => {
    const ctx = speechDeps();
    expect(await runCli(ARGV, ctx.deps)).toBe(0);
    // Without speech the black frames at 471 s win; they are under a line, so the cut at 500 s is used.
    expect(ctx.out.join('')).toContain('timeOffset="00:08:20.000"');
    expect(ctx.out.join('')).not.toContain('00:07:51');
    expect(ctx.runs.some((args) => args.includes('models/ggml-base.en.bin'))).toBe(true);
    expect(ctx.removed).toEqual(['/tmp/make-vmap-x']);
    expect(ctx.err.join('\n')).toContain('1 stretch of speech');
  });

  it('places breaks as before without --speech-model', async () => {
    const ctx = speechDeps();
    expect(await runCli(ARGV.slice(0, 4), ctx.deps)).toBe(0);
    expect(ctx.out.join('')).toContain('timeOffset="00:07:51.000"');
    expect(ctx.removed).toEqual([]);
  });

  it('fails when whisper is not available', async () => {
    const ctx = speechDeps();
    delete ctx.deps.whisper;
    expect(await runCli(ARGV, ctx.deps)).toBe(1);
    expect(ctx.err.join('\n')).toContain('whisper');
  });
});

describe('break context (local vision model, no AWS)', () => {
  const LOG = [
    '  Duration: 00:30:00.00, start: 0.000000, bitrate: 4000 kb/s',
    '[Parsed_showinfo_2 @ 0x3] n:   0 pts: 0 pts_time:500 duration:512',
  ].join('\n');
  const WHISPER_JSON = JSON.stringify({
    transcription: [{ offsets: { from: 469000, to: 470000 }, text: ' Get down!', tokens: [{ text: ' Get', offsets: { from: 469000, to: 470000 } }] }],
  });
  const CONTEXT = ['--context-model', 'vl.gguf', '--context-mmproj', 'mmproj.gguf'];
  const ARGV = ['--local', 'film.mp4', '--vast-url', VAST, '--speech-model', 'base.bin', ...CONTEXT];

  function contextDeps(answer: () => Promise<string>) {
    const ctx = fakeDeps(FILM);
    const runs: string[][] = [];
    const asked: string[][] = [];
    const removed: string[] = [];
    ctx.deps.runFfmpeg = async (args) => (runs.push(args), args.includes('null') ? LOG : '');
    ctx.deps.whisper = {
      runWhisper: async () => undefined,
      readFile: async () => WHISPER_JSON,
      makeTempDir: async () => '/tmp/whisper-x',
      removeDir: async () => undefined,
    };
    ctx.deps.vision = {
      run: async (args) => (asked.push(args), answer()),
      makeTempDir: async () => '/tmp/context-x',
      removeDir: async (path) => void removed.push(path),
    };
    return { ...ctx, runs, asked, removed };
  }

  it('reads the model flags, only both together and only with --local', () => {
    expect(parseCliArgs(['--local', 'film.mp4', '--vast-url', VAST, '--speech-model', 'base.bin', ...CONTEXT])).toMatchObject({ context: { model: 'vl.gguf', mmproj: 'mmproj.gguf' } });
    expect(() => parseCliArgs(['--local', 'film.mp4', '--vast-url', VAST, '--context-model', 'vl.gguf'])).toThrow(/--context-mmproj/);
    expect(() => parseCliArgs([...REQUIRED, ...CONTEXT])).toThrow(/--local/);
  });

  it('asks the model about the frames and lines before each break and writes its answer into the VMAP', async () => {
    const ctx = contextDeps(async () => 'llama log\n{ "scene": "A car hits a wall.", "mood": "violent", "signals": [{ "signal": "vehicle crash", "evidence": "A red car hits a wall." }] }');
    expect(await runCli(ARGV, ctx.deps)).toBe(0);
    const xml = ctx.out.join('');
    expect(xml).toContain('<Mood>violent</Mood>');
    expect(xml).toContain('>1551 1571</BlockedAdCategories>');
    // three frames before the break at 500 s, written into the temporary folder
    expect(ctx.runs.filter((args) => args.includes('-frames:v')).map((args) => args[args.indexOf('-ss') + 1])).toEqual(['472', '485', '498']);
    const args = ctx.asked[0] as string[];
    expect(args.filter((a) => a.startsWith('/tmp/context-x/'))).toHaveLength(4); // 3 frames + the schema
    expect(args[args.indexOf('-p') + 1]).toContain('Get down!');
    expect(ctx.files.has('/tmp/context-x/schema.json')).toBe(true);
    expect(ctx.removed).toEqual(['/tmp/context-x']);
    expect(ctx.err.join('\n')).toContain('00:08:20.000 · violent · vehicle crash (A red car hits a wall.) → blocks 1551 1571 · A car hits a wall.');
  });

  it('writes the break without context when the model fails', async () => {
    const ctx = contextDeps(() => Promise.reject(new Error('out of memory')));
    expect(await runCli(ARGV, ctx.deps)).toBe(0);
    expect(ctx.out.join('')).not.toContain('vega-ads:context');
    expect(ctx.err.join('\n')).toContain('00:08:20.000 · no context');
    expect(ctx.removed).toEqual(['/tmp/context-x']);
  });

  it('fails when llama.cpp is not available', async () => {
    const ctx = contextDeps(async () => '');
    delete ctx.deps.vision;
    expect(await runCli(ARGV, ctx.deps)).toBe(1);
    expect(ctx.err.join('\n')).toContain('llama-mtmd-cli');
  });
});


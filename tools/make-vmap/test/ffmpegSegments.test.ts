import { ffmpegArgs, ffmpegSegments, parseFfmpegLog } from '../src/ffmpegSegments';
import { pickBreaks } from '../src/pickBreaks';

// Real ffmpeg 8 output (first 40 s of Tears of Steel), trimmed.
const LOG = `
  Duration: 00:12:14.17, start: 0.000000, bitrate: 4025 kb/s
[Parsed_silencedetect_0 @ 0x1] silence_start: 0
[Parsed_silencedetect_0 @ 0x1] silence_end: 0.91356 | silence_duration: 0.91356
[Parsed_blackdetect_0 @ 0x2] black_start:0 black_end:8.916667 black_duration:8.916667
[Parsed_showinfo_2 @ 0x3] n:   0 pts: 109568 pts_time:8.916667 duration:512
[Parsed_showinfo_2 @ 0x3] n:   1 pts: 165376 pts_time:13.458333 duration:512
[Parsed_silencedetect_0 @ 0x1] silence_start: 299.5
[Parsed_blackdetect_0 @ 0x2] black_start:300 black_end:301.2 black_duration:1.2
[Parsed_silencedetect_0 @ 0x1] silence_end: 302 | silence_duration: 2.5
[Parsed_blackdetect_0 @ 0x2] black_start:420 black_end:420.5 black_duration:0.5
[Parsed_showinfo_2 @ 0x3] n:   2 pts: 0 pts_time:200.25 duration:512
`;

describe('parseFfmpegLog', () => {
  it('reads the duration, shot changes and black frames that are silent', () => {
    const result = parseFfmpegLog(LOG);
    expect(result.durationSeconds).toBeCloseTo(734.17, 2);
    expect(result.segments.filter((s) => s.Type === 'SHOT').map((s) => s.StartTimestampMillis)).toEqual([8917, 13458, 200250]);
    const black = result.segments.filter((s) => s.TechnicalCueSegment?.Type === 'BlackFrames');
    // 0–8.9 s overlaps silence, 300–301.2 s overlaps silence, 420 s has sound: not a quiet place for an ad.
    expect(black.map((s) => [s.StartTimestampMillis, s.EndTimestampMillis])).toEqual([
      [0, 8917],
      [300000, 301200],
    ]);
  });

  it('keeps every black run when the file has no audio (no silence lines)', () => {
    const result = parseFfmpegLog('[Parsed_blackdetect_0 @ 0x2] black_start:10 black_end:11 black_duration:1\n');
    expect(result.segments).toHaveLength(1);
  });

  it('drops black runs when the file has sound that is never silent', () => {
    const log = [
      '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s',
      '[Parsed_blackdetect_0 @ 0x2] black_start:10 black_end:11 black_duration:1',
    ].join('\n');
    expect(parseFfmpegLog(log).segments).toHaveLength(0);
  });

  it('feeds pickBreaks: the silent black run wins over a nearby cut', () => {
    const { segments, durationSeconds } = parseFfmpegLog(LOG);
    expect(pickBreaks(segments, { durationSeconds, firstBreakAfterSeconds: 120, minGapSeconds: 300 })).toEqual([200.25]);
    expect(pickBreaks(segments, { durationSeconds, firstBreakAfterSeconds: 250 })).toEqual([300.6]);
  });
});

describe('ffmpegSegments', () => {
  it('runs one ffmpeg pass with scene, black and silence detection and parses its log', async () => {
    const calls: string[][] = [];
    const result = await ffmpegSegments('movie.mp4', async (args) => {
      calls.push(args);
      return LOG;
    });
    expect(calls).toEqual([ffmpegArgs('movie.mp4')]);
    expect(calls[0]).toEqual(expect.arrayContaining(['-i', 'movie.mp4', '-f', 'null']));
    expect(result.segments.length).toBeGreaterThan(0);
  });
});

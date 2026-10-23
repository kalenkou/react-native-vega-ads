import { captionAt, captionFileUrl, parseWebVtt } from '../../src/vast/captions';
import type { LinearAd } from '../../src/vast';

function withCaptions(closedCaptionFiles: unknown): LinearAd {
  return { creative: { closedCaptionFiles } } as unknown as LinearAd;
}

const file = (fileURL: string | null, type: string | null, language: string | null = null) => ({
  fileURL,
  type,
  language,
});

describe('parseWebVtt', () => {
  it('reads cue times and text, with or without hours and cue ids', () => {
    const vtt = [
      'WEBVTT',
      '',
      '1',
      '00:00:01.000 --> 00:00:03.500',
      'Kettlebells that last',
      '',
      '00:03.500 --> 00:06.250 align:center line:85%',
      'a lifetime.',
      '',
    ].join('\n');
    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 3.5, text: 'Kettlebells that last' },
      { start: 3.5, end: 6.25, text: 'a lifetime.' },
    ]);
  });

  it('keeps line breaks inside a cue and drops voice and style tags', () => {
    const vtt = 'WEBVTT\r\n\r\n00:00.000 --> 00:02.000\r\n<v Narrator>Slow coffee</v>\r\n<i>for long evenings</i>\r\n';
    expect(parseWebVtt(vtt)).toEqual([{ start: 0, end: 2, text: 'Slow coffee\nfor long evenings' }]);
  });

  // The WebVTT parsing rules end a cue's text at a line with "-->", even without a blank line.
  it('starts a new cue at a timing line that follows the text directly', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst\n00:00:02.000 --> 00:00:03.000\nSecond\n';
    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: 'First' },
      { start: 2, end: 3, text: 'Second' },
    ]);
  });

  it('leaves no tag behind when tags are nested in each other', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:02.000\n<<i>b>Slow<</i>/b> coffee\n';
    const [cue] = parseWebVtt(vtt);
    expect(cue?.text).not.toMatch(/<[^>]*>/);
    expect(cue?.text).toContain('coffee');
  });

  it('keeps a "<" that opens no tag, and reads a long line of them in linear time', () => {
    expect(parseWebVtt('WEBVTT\n\n00:00.000 --> 00:02.000\n3 < 4 cups\n')[0]?.text).toBe('3 < 4 cups');
    expect(parseWebVtt('WEBVTT\n\n00:00.000 --> 00:02.000\n4 > 3 <i>cups</i>\n')[0]?.text).toBe('4 > 3 cups');
    // An ad server's caption file is untrusted: 50k "<" without ">" took seconds with a regex.
    const line = '<'.repeat(50_000);
    const started = Date.now();
    expect(parseWebVtt(`WEBVTT\n\n00:00.000 --> 00:02.000\n${line}\n`)[0]?.text).toBe(line);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('skips NOTE and STYLE blocks and cues it cannot read', () => {
    const vtt = [
      'WEBVTT - demo',
      '',
      'NOTE made by whisper.cpp',
      '',
      'STYLE',
      '::cue { color: yellow }',
      '',
      '00:00:01.000 --> soon',
      'broken',
      '',
      '00:00:02.000 --> 00:00:01.000',
      'ends before it starts',
      '',
      '00:00:04.000 --> 00:00:05.000',
      'kept',
    ].join('\n');
    expect(parseWebVtt(vtt)).toEqual([{ start: 4, end: 5, text: 'kept' }]);
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(parseWebVtt('\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n')).toEqual([
      { start: 1, end: 2, text: 'Hello' },
    ]);
  });

  it('is empty for a file that is not WebVTT', () => {
    expect(parseWebVtt('1\n00:00:01,000 --> 00:00:02,000\nSRT text\n')).toEqual([]);
    expect(parseWebVtt('')).toEqual([]);
  });
});

describe('captionAt', () => {
  const cues = [
    { start: 1, end: 3.5, text: 'first' },
    { start: 3.5, end: 6, text: 'second' },
    { start: 5, end: 7, text: 'overlap' },
  ];

  it('gives the cue that covers the time, from its start up to its end', () => {
    expect(captionAt(cues, 0.9)).toBe('');
    expect(captionAt(cues, 1)).toBe('first');
    expect(captionAt(cues, 3.49)).toBe('first');
    expect(captionAt(cues, 3.5)).toBe('second');
    expect(captionAt(cues, 7)).toBe('');
  });

  it('joins cues that overlap, in file order', () => {
    expect(captionAt(cues, 5.5)).toBe('second\noverlap');
  });
});

describe('captionFileUrl', () => {
  it('picks the WebVTT file in the viewer language, else the first WebVTT file', () => {
    const ad = withCaptions([
      file('https://cdn.test/a.ttml', 'application/ttml+xml', 'en'),
      file('https://cdn.test/a.de.vtt', 'text/vtt', 'de'),
      file('https://cdn.test/a.en.vtt', 'text/vtt', 'en'),
    ]);
    expect(captionFileUrl(ad, 'en')).toBe('https://cdn.test/a.en.vtt');
    expect(captionFileUrl(ad, 'EN-us')).toBe('https://cdn.test/a.en.vtt');
    expect(captionFileUrl(ad, 'pl')).toBe('https://cdn.test/a.de.vtt');
    expect(captionFileUrl(ad)).toBe('https://cdn.test/a.de.vtt');
  });

  it('accepts a .vtt URL without a type, and trims the URL', () => {
    expect(captionFileUrl(withCaptions([file('  https://cdn.test/b.vtt?x=1 ', null)]))).toBe(
      'https://cdn.test/b.vtt?x=1',
    );
  });

  it('is null without a WebVTT file', () => {
    expect(captionFileUrl(withCaptions(undefined))).toBeNull();
    expect(captionFileUrl(withCaptions([file('https://cdn.test/a.ttml', 'application/ttml+xml')]))).toBeNull();
    expect(captionFileUrl(withCaptions([file(null, 'text/vtt')]))).toBeNull();
  });
});

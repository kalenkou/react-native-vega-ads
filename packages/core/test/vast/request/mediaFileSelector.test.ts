import { selectMediaFile } from '../../../src/vast/request/mediaFileSelector';
import type { VastMediaFile } from '../../../src/vast/request/types';

function file(overrides: Partial<VastMediaFile>): VastMediaFile {
  return {
    fileURL: 'https://cdn.test/a.mp4',
    mimeType: 'video/mp4',
    codec: null,
    deliveryType: 'progressive',
    width: 1280,
    height: 720,
    bitrate: 2500,
    minBitrate: 0,
    maxBitrate: 0,
    apiFramework: null,
    ...overrides,
  };
}

const mp4 = (height: number, bitrate: number, extra: Partial<VastMediaFile> = {}): VastMediaFile =>
  file({ fileURL: `https://cdn.test/${height}-${bitrate}.mp4`, height, width: Math.round((height * 16) / 9), bitrate, ...extra });

describe('selectMediaFile (R6, R25)', () => {
  it('picks the mp4 whose bitrate is closest to the target', () => {
    const files = [mp4(360, 800), mp4(720, 2500), mp4(1080, 5000)];
    expect(selectMediaFile(files, { targetBitrateKbps: 2400 }).file?.height).toBe(720);
    expect(selectMediaFile(files, { targetBitrateKbps: 6000 }).file?.height).toBe(1080);
  });

  it('does not pick a file taller than the screen', () => {
    const files = [mp4(720, 2500), mp4(2160, 16000)];
    expect(selectMediaFile(files, { maxHeight: 1080, targetBitrateKbps: 20000 }).file?.height).toBe(720);
  });

  it('falls back to the smallest file when every file is taller than the screen', () => {
    const files = [mp4(2160, 16000), mp4(1440, 9000)];
    expect(selectMediaFile(files, { maxHeight: 1080 }).file?.height).toBe(1440);
  });

  it('uses the default target of 2500 kbps and screen of 1080 lines', () => {
    const files = [mp4(360, 800), mp4(720, 2500), mp4(1080, 5000)];
    expect(selectMediaFile(files).file?.height).toBe(720);
  });

  it('prefers the taller file when bitrates are equally close', () => {
    const files = [mp4(540, 2000), mp4(720, 3000)];
    expect(selectMediaFile(files, { targetBitrateKbps: 2500 }).file?.height).toBe(720);
  });

  it('prefers the taller file when bitrate is unknown', () => {
    const files = [mp4(360, 0), mp4(720, 0)];
    expect(selectMediaFile(files).file?.height).toBe(720);
  });

  it('ignores WebM, VPAID and files without a URL', () => {
    const files = [
      file({ mimeType: 'video/webm' }),
      file({ mimeType: 'application/javascript', apiFramework: 'VPAID' }),
      mp4(720, 2500, { apiFramework: 'VPAID' }),
      mp4(720, 2500, { fileURL: null }),
      mp4(480, 1200),
    ];
    expect(selectMediaFile(files).file?.height).toBe(480);
  });

  it('plays a file marked apiFramework="VAST" (a plain video, as in the IAB samples), not SIMID or VPAID', () => {
    expect(selectMediaFile([mp4(720, 2500, { apiFramework: 'VAST' })]).file).toBeDefined();
    expect(selectMediaFile([mp4(720, 2500, { apiFramework: 'vast' })]).file).toBeDefined();
    expect(selectMediaFile([mp4(720, 2500, { apiFramework: 'SIMID' })])).toEqual({ errorCode: 403 });
  });

  it('accepts H.264 codecs and an empty codec, rejects other codecs', () => {
    expect(selectMediaFile([mp4(720, 2500, { codec: 'avc1.4D401F' })]).file).toBeDefined();
    expect(selectMediaFile([mp4(720, 2500, { codec: '' })]).file).toBeDefined();
    expect(selectMediaFile([mp4(720, 2500, { codec: 'av01.0.05M.08' })])).toEqual({ errorCode: 403 });
  });

  it('accepts the H.264 names ad servers write besides RFC 6381 (the IAB VAST samples use "H.264", and "0" for none)', () => {
    for (const codec of ['H.264', 'h264', 'H264', 'avc', 'AVC1', ' H.264 ', '0']) {
      expect(selectMediaFile([mp4(720, 2500, { codec })]).file).toBeDefined();
    }
    for (const codec of ['H.265', 'hevc', 'hvc1.1.6.L93.B0', 'vp9']) {
      expect(selectMediaFile([mp4(720, 2500, { codec })])).toEqual({ errorCode: 403 });
    }
  });

  it('accepts HLS but prefers a progressive mp4 when both exist', () => {
    const hls = file({ fileURL: 'https://cdn.test/a.m3u8', mimeType: 'application/x-mpegURL', deliveryType: 'streaming', bitrate: 2500 });
    expect(selectMediaFile([hls]).file?.fileURL).toBe('https://cdn.test/a.m3u8');
    expect(selectMediaFile([hls, mp4(480, 1200)]).file?.height).toBe(480);
    const appleHls = file({ fileURL: 'https://cdn.test/b.m3u8', mimeType: 'application/vnd.apple.mpegurl', deliveryType: 'streaming' });
    expect(selectMediaFile([appleHls]).file?.fileURL).toBe('https://cdn.test/b.m3u8');
  });

  it('matches mime types without case sensitivity', () => {
    expect(selectMediaFile([mp4(720, 2500, { mimeType: 'VIDEO/MP4' })]).file).toBeDefined();
  });

  it('returns error 403 when nothing is playable', () => {
    expect(selectMediaFile([])).toEqual({ errorCode: 403 });
    expect(selectMediaFile([file({ mimeType: 'video/webm' })])).toEqual({ errorCode: 403 });
  });

  it('lets the app replace the whole rule (R25)', () => {
    const files = [mp4(360, 800), mp4(720, 2500)];
    const custom = selectMediaFile(files, { select: (all) => all[0] });
    expect(custom.file?.height).toBe(360);
    expect(selectMediaFile(files, { select: () => undefined })).toEqual({ errorCode: 403 });
  });
});

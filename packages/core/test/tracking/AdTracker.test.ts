import { readFileSync } from 'fs';
import { AdTracker, adIdMacros } from '../../src/tracking/AdTracker';
import { installImagePolyfill } from '../../src/polyfill/image';
import { requestVast, LinearAd } from '../../src/request/VastRequester';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const URL = 'https://ads.test/inline.xml';
const INLINE = readFileSync(`${__dirname}/../../fixtures/vast/inline.xml`, 'utf8');

const g = globalThis as Record<string, unknown>;
let pixels: FakeHttp;
beforeEach(() => {
  pixels = new FakeHttp();
  g.window = g;
  delete g.Image;
  installImagePolyfill(pixels, g);
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

async function loadAd(body = INLINE): Promise<LinearAd> {
  const result = await requestVast(URL, { http: new FakeHttp().on(URL, { body }), clock: new FakeClock() });
  if (result.status !== 'ok' || !result.ads[0]) throw new Error(result.status);
  return result.ads[0];
}

const sent = (): string[] => pixels.requests.splice(0);

describe('AdTracker (R1, R2, R8, R20)', () => {
  it('sends every impression URL once, on the first frame', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.firstFrame();
    tracker.firstFrame();
    const urls = sent();
    expect(urls.filter((u) => u.includes('/impression'))).toHaveLength(2);
    expect(urls.some((u) => u.includes('cb=') && !u.includes('[CACHEBUSTING]'))).toBe(true);
  });

  it('sends start and quartiles from the ad position, each once', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.firstFrame();
    sent();
    tracker.progress(0.5);
    expect(sent()).toEqual(['https://t.test/start']);
    tracker.progress(2.6);
    expect(sent()).toEqual(['https://t.test/q1']);
    tracker.progress(5.1);
    tracker.progress(5.4);
    expect(sent()).toEqual(['https://t.test/mid']);
    tracker.progress(7.6);
    expect(sent()).toEqual(['https://t.test/q3']);
    tracker.ended();
    tracker.ended();
    expect(sent()).toEqual(['https://t.test/complete']);
  });

  it('sends pause and resume only on a change', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.firstFrame();
    sent();
    tracker.paused();
    tracker.paused();
    tracker.resumed();
    expect(sent()).toEqual(['https://t.test/pause', 'https://t.test/resume']);
  });

  it('does not send resume when playback starts (vast-client starts with paused undefined)', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.firstFrame();
    tracker.resumed();
    expect(sent().some((u) => u.includes('/resume'))).toBe(false);
  });

  it('allows skip only after skipAfter (R8)', async () => {
    const tracker = new AdTracker(await loadAd(INLINE.replace('<Linear>', '<Linear skipoffset="00:00:05"><TrackingEvents><Tracking event="skip"><![CDATA[https://t.test/skip]]></Tracking></TrackingEvents>')));
    tracker.firstFrame();
    tracker.progress(4.9);
    expect(tracker.canSkip()).toBe(false);
    expect(tracker.skip()).toBe(false);
    tracker.progress(5);
    expect(tracker.canSkip()).toBe(true);
    sent();
    expect(tracker.skip()).toBe(true);
    expect(sent()).toContain('https://t.test/skip');
  });

  it('never allows skip on a non-skippable ad', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.progress(9);
    expect(tracker.canSkip()).toBe(false);
    expect(tracker.skip()).toBe(false);
  });

  it('reports the seconds left until skip', async () => {
    const tracker = new AdTracker(await loadAd(INLINE.replace('<Linear>', '<Linear skipoffset="00:00:05">')));
    tracker.progress(1.2);
    expect(tracker.secondsUntilSkip()).toBeCloseTo(3.8);
    tracker.progress(6);
    expect(tracker.secondsUntilSkip()).toBe(0);
  });

  it('sends the Error URL with the code (R7, R20)', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.error(405);
    expect(sent()).toEqual(['https://t.test/error?code=405']);
  });

  it('sends nothing more after the ad finished, was skipped or failed', async () => {
    const tracker = new AdTracker(await loadAd());
    tracker.firstFrame();
    tracker.error(405);
    sent();
    tracker.progress(5);
    tracker.paused();
    tracker.ended();
    tracker.error(405);
    expect(sent()).toEqual([]);
  });

  it('fills ad id macros in every URL (R15)', async () => {
    const body = INLINE.replace('https://t.test/impression2?ad=1', 'https://t.test/imp?lmt=[LIMITADTRACKING]&ifa=[IFA]&type=[IFATYPE]');
    const tracker = new AdTracker(await loadAd(body), { macros: { LIMITADTRACKING: '0', IFA: 'abc-123', IFATYPE: 'afai' } });
    tracker.firstFrame();
    expect(sent()).toContain('https://t.test/imp?lmt=0&ifa=abc-123&type=afai');
  });

  it('reports each IAB event it sends, for the debug panel', async () => {
    const events: string[] = [];
    const tracker = new AdTracker(await loadAd(), { onEvent: (name) => events.push(name) });
    tracker.firstFrame();
    tracker.progress(0.5);
    tracker.progress(2.6);
    tracker.ended();
    expect(events).toEqual(['impression', 'start', 'firstQuartile', 'complete']);
  });
});

describe('adIdMacros (R15)', () => {
  it('sends the id with LIMITADTRACKING=0 when tracking is allowed', () => {
    expect(adIdMacros({ isTrackingEnabled: () => true, fetchId: () => 'id-1' })).toEqual({ LIMITADTRACKING: '0', IFA: 'id-1', IFATYPE: 'afai' });
  });

  it('checks tracking before reading the id and sends no id after opt-out', () => {
    const fetchId = jest.fn(() => 'id-1');
    expect(adIdMacros({ isTrackingEnabled: () => false, fetchId })).toEqual({ LIMITADTRACKING: '1', IFA: '', IFATYPE: '' });
    expect(fetchId).not.toHaveBeenCalled();
  });

  it('treats a failing ad id service as opt-out instead of breaking playback', () => {
    expect(
      adIdMacros({
        isTrackingEnabled: () => {
          throw new Error('service down');
        },
        fetchId: () => 'id-1',
      }),
    ).toEqual({ LIMITADTRACKING: '1', IFA: '', IFATYPE: '' });
    expect(
      adIdMacros({
        isTrackingEnabled: () => true,
        fetchId: () => {
          throw new Error('no id');
        },
      }),
    ).toEqual({ LIMITADTRACKING: '1', IFA: '', IFATYPE: '' });
  });
});

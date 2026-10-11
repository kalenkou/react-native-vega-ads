import { readFileSync } from 'fs';
import { requestPauseAd } from '../../../src/vast/request/PauseAdRequester';
import { PauseAdTracker } from '../../../src/vast/tracking/PauseAdTracker';
import { installImagePolyfill } from '../../../src/vast/polyfill/image';
import { FakeClock } from '../../fakes/FakeClock';
import { FakeHttp } from '../../fakes/FakeHttp';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../../fixtures/vast/${name}`, 'utf8');
const TAG = 'https://ads.test/pause.xml?ifa=[IFA]';
const ASKED = 'https://ads.test/pause.xml?ifa=abc';

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

const sent = (): string[] => pixels.requests.splice(0);

async function load(body: string) {
  const http = new FakeHttp().on(ASKED, { body });
  return requestPauseAd(TAG, { http, clock: new FakeClock(), macros: { IFA: 'abc' } });
}

describe('requestPauseAd (IAB CTV Ad Portfolio: pause)', () => {
  it('reads the image, its size, the click-through and the QR code of a NonLinear ad', async () => {
    const result = await load(fixture('pause.xml'));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.ad).toMatchObject({
      imageUrl: 'https://cdn.test/pause.png',
      width: 600,
      height: 600,
      clickThroughUrl: 'https://brand.test/try',
      qr: { scanUrl: 'https://brand.test/qr', imageUrl: 'https://cdn.test/qr.png' },
    });
  });

  it('works without click-through and QR code', async () => {
    const body = fixture('pause.xml')
      .replace(/<NonLinearClickThrough>.*<\/NonLinearClickThrough>/, '')
      .replace(/<CreativeExtensions>[\s\S]*<\/CreativeExtensions>/, '');
    const result = await load(body);
    expect(result.status === 'ok' && result.ad).toMatchObject({ clickThroughUrl: null, qr: null });
  });

  it('is empty when the answer has no image NonLinear, and sends error 200 for each ad', async () => {
    const html = fixture('pause.xml').replace(
      /<StaticResource[\s\S]*?<\/StaticResource>/,
      '<HTMLResource><![CDATA[<b>x</b>]]></HTMLResource>',
    );
    expect((await load(html)).status).toBe('empty');
    expect(sent()).toContain('https://t.test/err-pause?code=200');
    expect((await load(fixture('inline.xml'))).status).toBe('empty');
  });

  it('takes only images: a StaticResource of another type does not count', async () => {
    const script = fixture('pause.xml').replace('creativeType="image/png"', 'creativeType="application/javascript"');
    expect((await load(script)).status).toBe('empty');
  });

  it('reads the QR code only from the tl_qrcode extension', async () => {
    const other = fixture('pause.xml').replace('type="tl_qrcode"', 'type="other_vendor"');
    const result = await load(other);
    expect(result.status === 'ok' && result.ad.qr).toBeNull();
  });

  it('reports a failed request', async () => {
    const http = new FakeHttp();
    const result = await requestPauseAd('https://ads.test/missing.xml', { http, clock: new FakeClock() });
    expect(result.status).toBe('failed');
  });
});

describe('PauseAdTracker', () => {
  async function tracker() {
    const result = await load(fixture('pause.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    const events: string[] = [];
    const t = new PauseAdTracker(result.ad, { macros: { IFA: 'abc' }, onEvent: (name) => events.push(name) });
    sent();
    return { t, events };
  }

  it('sends impression and creativeView once when shown', async () => {
    const { t, events } = await tracker();
    t.shown();
    t.shown();
    expect(sent()).toEqual(['https://t.test/imp-pause?ifa=abc', 'https://t.test/pause-view']);
    expect(events).toEqual(['impression', 'creativeView']);
  });

  it('sends how long the ad was on screen when it is hidden, and close when the viewer closed it', async () => {
    const { t, events } = await tracker();
    t.shown();
    sent();
    t.hidden(12_345, { closedByViewer: true });
    t.hidden(20_000, { closedByViewer: true });
    expect(sent()).toEqual(['https://t.test/pause-duration?d=00%3A00%3A12.345', 'https://t.test/pause-close']);
    expect(events).toEqual(['impression', 'creativeView', 'overlayViewDuration', 'close']);
  });

  it('sends no close when the movie simply plays on, and nothing for an ad never shown', async () => {
    const { t } = await tracker();
    t.hidden(5_000, { closedByViewer: true });
    expect(sent()).toEqual([]);
    t.shown();
    sent();
    t.hidden(5_000, { closedByViewer: false });
    expect(sent()).toEqual(['https://t.test/pause-duration?d=00%3A00%3A05.000']);
  });
});

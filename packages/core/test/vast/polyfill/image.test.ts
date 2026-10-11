import { installImagePolyfill } from '../../../src/vast/polyfill/image';
import { FakeHttp } from '../../fakes/FakeHttp';

const PIXEL = 'https://t.test/impression?cb=1';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('installImagePolyfill (R14)', () => {
  it('installs Image when the runtime has none', () => {
    const target: Record<string, unknown> = {};
    expect(installImagePolyfill(new FakeHttp(), target)).toBe(true);
    expect(typeof target.Image).toBe('function');
  });

  it('does not overwrite an existing Image', () => {
    class NativeImage {}
    const target: Record<string, unknown> = { Image: NativeImage };
    expect(installImagePolyfill(new FakeHttp(), target)).toBe(false);
    expect(target.Image).toBe(NativeImage);
  });

  it('sends a GET when src is set and keeps the value', () => {
    const http = new FakeHttp().on(PIXEL, { body: '' });
    const target: Record<string, unknown> = {};
    installImagePolyfill(http, target);
    const Image = target.Image as new () => { src: string };
    const image = new Image();
    image.src = PIXEL;
    expect(http.requests).toEqual([PIXEL]);
    expect(image.src).toBe(PIXEL);
  });

  it('retries once after a network error and never throws', async () => {
    const http = new FakeHttp().fail(PIXEL);
    const target: Record<string, unknown> = {};
    installImagePolyfill(http, target);
    const Image = target.Image as new () => { src: string };
    expect(() => {
      new Image().src = PIXEL;
    }).not.toThrow();
    await settle();
    expect(http.requests).toEqual([PIXEL, PIXEL]);
  });

  it('does not retry after an HTTP answer, even an error status', async () => {
    const http = new FakeHttp().on(PIXEL, { status: 500, body: '' });
    const target: Record<string, unknown> = {};
    installImagePolyfill(http, target);
    const Image = target.Image as new () => { src: string };
    new Image().src = PIXEL;
    await settle();
    expect(http.requests).toEqual([PIXEL]);
  });

  it('ignores an empty src', () => {
    const http = new FakeHttp();
    const target: Record<string, unknown> = {};
    installImagePolyfill(http, target);
    const Image = target.Image as new () => { src: string };
    new Image().src = '';
    expect(http.requests).toEqual([]);
  });
});

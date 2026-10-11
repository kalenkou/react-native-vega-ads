import { createUrlHandler, LoadFailure, describeFailure } from '../../src/request/urlHandler';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const URL = 'https://ads.test/vast.xml';
const VAST = '<VAST version="4.2"><Ad id="1"><InLine/></Ad></VAST>';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('urlHandler (R4, R16)', () => {
  it('returns a parsed document and details in the shape vast-client expects', async () => {
    const handler = createUrlHandler({ http: new FakeHttp().on(URL, { body: VAST }), clock: new FakeClock() });
    const result = await handler.get(URL, {});
    if (!('xml' in result)) throw new Error('expected xml');
    expect(result.xml.documentElement.nodeName).toBe('VAST');
    expect(result.details).toEqual({ byteLength: VAST.length, statusCode: 200, rawXml: VAST });
  });

  it('returns an error with the status for a non-2xx answer', async () => {
    const handler = createUrlHandler({ http: new FakeHttp().on(URL, { status: 500, body: 'oops' }), clock: new FakeClock() });
    const result = await handler.get(URL, {});
    expect(result).toMatchObject({ statusCode: 500 });
    expect(describeFailure((result as { error: Error }).error)).toEqual<LoadFailure>({ kind: 'http', status: 500 });
  });

  it('aborts after the timeout and reports 408', async () => {
    const clock = new FakeClock();
    const http = new FakeHttp().hang(URL);
    const handler = createUrlHandler({ http, clock, timeoutMs: 4000 });
    const pending = handler.get(URL, {});
    clock.advance(3999);
    await settle();
    let done = false;
    void pending.then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    clock.advance(1);
    const result = await pending;
    expect(result).toMatchObject({ statusCode: 408 });
    expect(describeFailure((result as { error: Error }).error)).toEqual({ kind: 'timeout' });
  });

  it('uses the timeout that vast-client passes when it is shorter', async () => {
    const clock = new FakeClock();
    const handler = createUrlHandler({ http: new FakeHttp().hang(URL), clock, timeoutMs: 4000 });
    const pending = handler.get(URL, { timeout: 1000 });
    clock.advance(1000);
    await expect(pending).resolves.toMatchObject({ statusCode: 408 });
  });

  it('reports malformed XML as an XML failure', async () => {
    const handler = createUrlHandler({ http: new FakeHttp().on(URL, { body: '<VAST><Ad>' }), clock: new FakeClock() });
    const result = await handler.get(URL, {});
    expect(describeFailure((result as { error: Error }).error)).toEqual({ kind: 'xml' });
  });

  it('reports an empty body as an XML failure', async () => {
    const handler = createUrlHandler({ http: new FakeHttp().on(URL, { body: '   ' }), clock: new FakeClock() });
    const result = await handler.get(URL, {});
    expect(describeFailure((result as { error: Error }).error)).toEqual({ kind: 'xml' });
  });

  it('reports a network failure without a status', async () => {
    const handler = createUrlHandler({ http: new FakeHttp().fail(URL), clock: new FakeClock() });
    const result = await handler.get(URL, {});
    expect(result).toMatchObject({ statusCode: null });
    expect(describeFailure((result as { error: Error }).error)).toEqual({ kind: 'network' });
  });

  it('clears the timer after an answer', async () => {
    const clock = new FakeClock();
    const clear = jest.spyOn(clock, 'clearTimeout');
    const handler = createUrlHandler({ http: new FakeHttp().on(URL, { body: VAST }), clock });
    await handler.get(URL, {});
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('still recognises a failure after vast-client re-wraps it with new Error(error)', () => {
    const original = new Error('vega-ads:timeout');
    expect(describeFailure(new Error(String(original)))).toEqual({ kind: 'timeout' });
    expect(describeFailure(new Error('something else'))).toEqual({ kind: 'unknown' });
  });
});

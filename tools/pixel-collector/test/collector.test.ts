import { CounterPort, handle, HttpRequest } from '../src/collector';

class FakeCounters implements CounterPort {
  readonly days = new Map<string, Map<string, number>>();
  failing = false;

  async add(day: string, key: string): Promise<void> {
    if (this.failing) {
      throw new Error('table unavailable');
    }
    const counts = this.days.get(day) ?? new Map<string, number>();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    this.days.set(day, counts);
  }

  async list(day: string): Promise<Array<{ key: string; count: number }>> {
    return [...(this.days.get(day) ?? new Map<string, number>())].map(([key, count]) => ({ key, count }));
  }
}

const NOW = Date.parse('2026-10-11T23:59:30Z');

function setup() {
  const counters = new FakeCounters();
  const send = (path: string, query: Record<string, string> = {}, method = 'GET') =>
    handle({ method, path, query } as HttpRequest, { counters, now: () => NOW });
  return { counters, send };
}

describe('pixel endpoint /p', () => {
  it('counts an event per ad and day (UTC) and answers with a 1x1 GIF that is never cached', async () => {
    const { counters, send } = setup();
    const res = await send('/p', { ad: 'tos-30s', e: 'impression' });
    await send('/p', { ad: 'tos-30s', e: 'impression' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.isBase64Encoded).toBe(true);
    expect(Buffer.from(res.body, 'base64').subarray(0, 6).toString()).toBe('GIF89a');
    expect(await counters.list('2026-10-11')).toEqual([{ key: 'tos-30s#impression', count: 2 }]);
  });

  it('counts every event the demo VAST files send: notUsed and the pause ad events too', async () => {
    const { counters, send } = setup();
    for (const e of ['notUsed', 'creativeView', 'overlayViewDuration', 'close']) {
      expect((await send('/p', { ad: 'brewnord-pause', e })).statusCode).toBe(200);
    }
    expect((await counters.list('2026-10-11')).map((row) => row.key)).toEqual([
      'brewnord-pause#notUsed',
      'brewnord-pause#creativeView',
      'brewnord-pause#overlayViewDuration',
      'brewnord-pause#close',
    ]);
  });

  it('counts errors by VAST or VMAP error code', async () => {
    const { counters, send } = setup();
    await send('/p', { ad: 'tos-30s', e: 'error', code: '405' });
    await send('/p', { ad: 'tos-30s', e: 'error', code: '[ERRORCODE]' }); // macro not filled
    expect(await counters.list('2026-10-11')).toEqual([
      { key: 'tos-30s#error:405', count: 1 },
      { key: 'tos-30s#error:unknown', count: 1 },
    ]);
  });

  it.each([
    [{ ad: 'tos-30s', e: 'teleport' }],
    [{ ad: 'bad id!', e: 'start' }],
    [{ ad: 'x'.repeat(65), e: 'start' }],
    [{ e: 'start' }],
    [{ ad: 'tos-30s' }],
  ])('refuses %p without counting', async (query) => {
    const { counters, send } = setup();
    const res = await send('/p', query as Record<string, string>);
    expect(res.statusCode).toBe(400);
    expect(counters.days.size).toBe(0);
  });

  it('answers 500 when the count cannot be stored', async () => {
    const { counters, send } = setup();
    counters.failing = true;
    expect((await send('/p', { ad: 'tos-30s', e: 'start' })).statusCode).toBe(500);
  });

  it('accepts HEAD and refuses other methods', async () => {
    const { send } = setup();
    expect((await send('/p', { ad: 'tos-30s', e: 'start' }, 'HEAD')).statusCode).toBe(200);
    expect((await send('/p', { ad: 'tos-30s', e: 'start' }, 'POST')).statusCode).toBe(405);
  });
});

describe('report /report', () => {
  it('shows one row per ad with its events, errors and completion rate', async () => {
    const { send } = setup();
    for (const e of ['impression', 'impression', 'start', 'complete']) {
      await send('/p', { ad: 'tos-30s', e });
    }
    await send('/p', { ad: 'tos-15s', e: 'error', code: '402' });
    const res = await send('/report', { day: '2026-10-11' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('<td>tos-30s</td><td>2</td><td>1</td>');
    expect(res.body).toContain('50%');
    expect(res.body).toContain('402 × 1');
  });

  it('shows the ads left out of a break and the pause ad views and closes', async () => {
    const { send } = setup();
    await send('/p', { ad: 'kettlo', e: 'notUsed' });
    for (const e of ['impression', 'creativeView', 'close']) {
      await send('/p', { ad: 'brewnord-pause', e });
    }
    const { body } = await send('/report', { day: '2026-10-11' });
    expect(body).toContain('<th>notUsed</th><th>creativeView</th><th>close</th>');
    expect(body).toMatch(/<td>kettlo<\/td>(<td>\d+<\/td>){9}<td>1<\/td><td>0<\/td><td>0<\/td>/);
    expect(body).toMatch(/<td>brewnord-pause<\/td><td>1<\/td>(<td>\d+<\/td>){8}<td>0<\/td><td>1<\/td><td>1<\/td>/);
  });

  it('shows today (UTC) by default and refuses a malformed day', async () => {
    const { send } = setup();
    await send('/p', { ad: 'tos-30s', e: 'impression' });
    expect((await send('/report')).body).toContain('2026-10-11');
    expect((await send('/report')).body).toContain('tos-30s');
    expect((await send('/report', { day: '<script>' })).statusCode).toBe(400);
  });

  it('answers 404 on other paths', async () => {
    const { send } = setup();
    expect((await send('/')).statusCode).toBe(404);
  });
});

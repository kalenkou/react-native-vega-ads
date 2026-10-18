/** Daily counters, one per ad and event. The DynamoDB adapter is in dynamo.ts. */
export interface CounterPort {
  add(day: string, key: string): Promise<void>;
  list(day: string): Promise<Array<{ key: string; count: number }>>;
}

export interface HttpRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
}

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

export interface CollectorDeps {
  counters: CounterPort;
  now: () => number;
}

/**
 * VAST 4 tracking events that vega-ads sends (`notUsed`: an ad left out of the break; the pause
 * ad's `creativeView`, `overlayViewDuration` and `close`), plus the VMAP break events.
 */
export const EVENTS = [
  'impression',
  'start',
  'firstQuartile',
  'midpoint',
  'thirdQuartile',
  'complete',
  'pause',
  'resume',
  'skip',
  'notUsed',
  'creativeView',
  'overlayViewDuration',
  'close',
  'error',
  'breakStart',
  'breakEnd',
] as const;

const REPORT_COLUMNS = [
  'impression',
  'start',
  'firstQuartile',
  'midpoint',
  'thirdQuartile',
  'complete',
  'skip',
  'pause',
  'resume',
  // An ad left out of a break (a repeat, a blocked category, over the break's length).
  'notUsed',
  // Pause ads: shown and closed.
  'creativeView',
  'close',
];
const AD_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent GIF

const text = (statusCode: number, body: string): HttpResult => ({
  statusCode,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  body,
});

const today = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** `/p?ad=<id>&e=<event>[&code=<error code>]` counts a pixel; `/report[?day=YYYY-MM-DD]` shows a day. */
export async function handle(request: HttpRequest, deps: CollectorDeps): Promise<HttpResult> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return text(405, 'method not allowed');
  }
  if (request.path === '/p') {
    return countPixel(request.query, deps);
  }
  if (request.path === '/report') {
    return report(request.query.day ?? today(deps.now()), deps);
  }
  return text(404, 'not found');
}

async function countPixel(query: HttpRequest['query'], deps: CollectorDeps): Promise<HttpResult> {
  const { ad, e: event, code } = query;
  if (!ad || !AD_ID.test(ad) || !(EVENTS as readonly string[]).includes(event ?? '')) {
    return text(400, 'expected ad=<id>&e=<event>');
  }
  // An unfilled macro ("[ERRORCODE]") still counts as an error, just without a code.
  const key = event === 'error' ? `${ad}#error:${code && /^\d{3,4}$/.test(code) ? code : 'unknown'}` : `${ad}#${event}`;
  try {
    await deps.counters.add(today(deps.now()), key);
  } catch {
    return text(500, 'not stored');
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' },
    body: PIXEL,
    isBase64Encoded: true,
  };
}

async function report(day: string, deps: CollectorDeps): Promise<HttpResult> {
  if (!DAY.test(day)) {
    return text(400, 'expected day=YYYY-MM-DD');
  }
  const ads = new Map<string, Map<string, number>>();
  for (const { key, count } of await deps.counters.list(day)) {
    const [ad = '', event = ''] = key.split('#');
    const events = ads.get(ad) ?? new Map<string, number>();
    events.set(event, count);
    ads.set(ad, events);
  }
  const rows = [...ads]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ad, events]) => {
      const cells = REPORT_COLUMNS.map((name) => `<td>${events.get(name) ?? 0}</td>`).join('');
      const impressions = events.get('impression') ?? 0;
      const completion = impressions > 0 ? `${Math.round(((events.get('complete') ?? 0) / impressions) * 100)}%` : '-';
      const errors = [...events]
        .filter(([name]) => name.startsWith('error:'))
        .map(([name, count]) => `${name.slice('error:'.length)} × ${count}`)
        .join(', ');
      // Ad ids are checked against AD_ID before they are stored, so they need no escaping.
      return `<tr><td>${ad}</td>${cells}<td>${completion}</td><td>${errors}</td></tr>`;
    });
  const head = ['ad', ...REPORT_COLUMNS, 'completion', 'errors'].map((name) => `<th>${name}</th>`).join('');
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>vega-ads pixels ${day}</title>
<style>body{font:16px system-ui,sans-serif;margin:24px;background:#0b0e14;color:#eef1f6}
table{border-collapse:collapse}th,td{border:1px solid #4a5468;padding:6px 10px;text-align:right}
th{background:#121722;color:#ff9a4d}td:first-child,th:first-child{text-align:left}</style></head><body>
<h1>Ad pixels, ${day} (UTC)</h1>
<table><tr>${head}</tr>
${rows.join('\n')}
</table></body></html>`;
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    body,
  };
}

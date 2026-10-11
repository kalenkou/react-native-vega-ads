/** Key-value targeting for one ad request. An array becomes a comma-separated list of values. */
export type CustParams = Readonly<Record<string, string | readonly string[]>>;

/** What the scene before a break means for its ads; see `breakContext.ts`. */
export interface BreakContext {
  mood: string;
  /** One sentence about the scene, for people reading the VMAP. */
  scene?: string;
  /** What the scene shows that made categories blocked, each with what the model saw. */
  signals?: ReadonlyArray<{ name: string; evidence: string }>;
  /** IAB Ad Product Taxonomy codes that must not play in this break. */
  blockedAdCategories: readonly string[];
}

export interface AdTag {
  vastUrl: string;
  custParams?: CustParams;
  /** Written as a `vega-ads:context` VMAP extension; vega-ads leaves out blocked ads. */
  context?: BreakContext;
}

export interface Midroll extends AdTag {
  /** Seconds from the start of the content. */
  time: number;
}

export interface VmapInput {
  preroll?: string | AdTag;
  midrolls: readonly Midroll[];
  postroll?: string | AdTag;
}

const VMAP_NAMESPACE = 'http://www.iab.net/videosuite/vmap';

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function toMillis(seconds: number): number {
  const ms = Math.round(seconds * 1000);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`A mid-roll time must be a positive number of seconds, got ${seconds}`);
  }
  return ms;
}

/** VMAP `timeOffset` in `hh:mm:ss.mmm`, rounded to the millisecond. */
export function formatTimeOffset(seconds: number): string {
  const ms = toMillis(seconds);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const secs = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms % 1000, 3)}`;
}

/**
 * Appends `cust_params` in the common ad server form: each key and value is URL-encoded,
 * pairs are joined with `&`, and the whole list is URL-encoded again as one query value.
 * The rest of the URL is not re-encoded, so macros such as `[timestamp]` stay as they are.
 */
export function appendCustParams(url: string, custParams: CustParams | undefined): string {
  const entries = Object.entries(custParams ?? {});
  if (entries.length === 0) return url;

  const list = entries
    .map(([key, value]) => {
      const values = typeof value === 'string' ? [value] : value;
      return `${encodeURIComponent(key)}=${values.map(encodeURIComponent).join(',')}`;
    })
    .join('&');

  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const separator = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&';
  return `${base}${separator}cust_params=${encodeURIComponent(list)}${fragment}`;
}

function checkUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Not a valid VAST tag URL: "${url}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(`A VAST tag URL must use http or https: "${url}"`);
  }
  return url;
}

function cdata(text: string): string {
  // "]]>" cannot appear inside CDATA, so the section is split around it.
  return `<![CDATA[${text.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CATEGORY_CODE = /^[A-Za-z0-9-]+$/;

function contextExtension(context: BreakContext): string[] {
  const bad = context.blockedAdCategories.find((code) => !CATEGORY_CODE.test(code));
  if (bad !== undefined) {
    throw new TypeError(`Not an ad category code: "${bad}"`);
  }
  return [
    '    <vmap:Extensions>',
    '      <vmap:Extension type="vega-ads:context">',
    `        <Mood>${escapeXml(context.mood)}</Mood>`,
    ...(context.scene ? [`        <Scene>${escapeXml(context.scene)}</Scene>`] : []),
    ...(context.signals?.length
      ? [
          '        <Signals>',
          ...context.signals.map((signal) => `          <Signal name="${escapeXml(signal.name)}">${escapeXml(signal.evidence)}</Signal>`),
          '        </Signals>',
        ]
      : []),
    ...(context.blockedAdCategories.length > 0
      ? [
          `        <BlockedAdCategories authority="https://iabtechlab.com">${context.blockedAdCategories.join(' ')}</BlockedAdCategories>`,
        ]
      : []),
    '      </vmap:Extension>',
    '    </vmap:Extensions>',
  ];
}

function adBreak(timeOffset: string, breakId: string, tag: AdTag): string {
  const url = appendCustParams(checkUrl(tag.vastUrl), tag.custParams);
  return [
    `  <vmap:AdBreak timeOffset="${timeOffset}" breakType="linear" breakId="${breakId}">`,
    `    <vmap:AdSource id="${breakId}-ad" allowMultipleAds="true" followRedirects="true">`,
    `      <vmap:AdTagURI templateType="vast4">${cdata(url)}</vmap:AdTagURI>`,
    '    </vmap:AdSource>',
    ...(tag.context ? contextExtension(tag.context) : []),
    '  </vmap:AdBreak>',
  ].join('\n');
}

function asTag(tag: string | AdTag): AdTag {
  return typeof tag === 'string' ? { vastUrl: tag } : tag;
}

/** Writes a VMAP 1.0 document: optional pre-roll, mid-rolls in time order, optional post-roll. */
export function buildVmap(input: VmapInput): string {
  const midrolls = [...input.midrolls].sort((a, b) => toMillis(a.time) - toMillis(b.time));
  midrolls.forEach((midroll, index) => {
    const previous = midrolls[index - 1];
    if (previous && toMillis(previous.time) === toMillis(midroll.time)) {
      throw new RangeError(`Two mid-rolls at the same time: ${formatTimeOffset(midroll.time)}`);
    }
  });

  const breaks: string[] = [];
  if (input.preroll !== undefined) breaks.push(adBreak('start', 'preroll', asTag(input.preroll)));
  midrolls.forEach((midroll, index) => breaks.push(adBreak(formatTimeOffset(midroll.time), `midroll-${index + 1}`, midroll)));
  if (input.postroll !== undefined) breaks.push(adBreak('end', 'postroll', asTag(input.postroll)));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<vmap:VMAP xmlns:vmap="${VMAP_NAMESPACE}" version="1.0">`,
    ...breaks,
    '</vmap:VMAP>',
    '',
  ].join('\n');
}

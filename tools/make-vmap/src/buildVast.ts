export interface MediaFileInput {
  url: string;
  width: number;
  height: number;
  bitrateKbps: number;
  /** Default `video/mp4`. */
  type?: string;
}

export interface VastAdInput {
  /** Ad id; also the `ad` value of its tracking pixels. Letters, digits, `.`, `_`, `-`. */
  id: string;
  title: string;
  durationSeconds: number;
  mediaFiles: readonly MediaFileInput[];
  /** Skip allowed after this many seconds; leave out for a non-skippable ad. */
  skipAfterSeconds?: number;
  /** Base URL of the pixel collector (tools/pixel-collector), ending with `/`. */
  pixelBaseUrl: string;
  /** `<Advertiser>`: players keep one ad per advertiser in a break. */
  advertiser?: string;
  /** `<UniversalAdId>` of the creative; "unknown" when left out (VAST 4.1+ requires the element). */
  universalAdId?: { idRegistry: string; value: string };
}

const AD_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const TRACKING_EVENTS = ['start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete', 'pause', 'resume', 'skip', 'notUsed'];

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cdata(text: string): string {
  // "]]>" cannot appear inside CDATA, so the section is split around it.
  return `<![CDATA[${text.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

/** VAST time, `hh:mm:ss.mmm`. */
function vastTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

function check(input: VastAdInput): void {
  if (!AD_ID.test(input.id)) {
    throw new TypeError(`An ad id may use letters, digits, ".", "_" and "-" only: "${input.id}"`);
  }
  if (!(input.durationSeconds > 0)) {
    throw new RangeError(`The duration of ad "${input.id}" must be positive`);
  }
  if (input.mediaFiles.length === 0) {
    throw new RangeError(`Ad "${input.id}" has no media files`);
  }
  if (!/^https?:\/\/.+\/$/.test(input.pixelBaseUrl)) {
    throw new TypeError(`The pixel base URL must be http(s) and end with "/": "${input.pixelBaseUrl}"`);
  }
}

function inlineAd(input: VastAdInput, sequence: number | null): string {
  check(input);
  const pixel = (event: string, extra = '') => cdata(`${input.pixelBaseUrl}p?ad=${input.id}&e=${event}${extra}`);
  const uaid = input.universalAdId ?? { idRegistry: 'unknown', value: 'unknown' };
  const skip = input.skipAfterSeconds === undefined ? '' : ` skipoffset="${vastTime(input.skipAfterSeconds)}"`;
  const files = input.mediaFiles.map(
    (file) =>
      `            <MediaFile delivery="progressive" type="${escapeXml(file.type ?? 'video/mp4')}" width="${file.width}" height="${file.height}" bitrate="${file.bitrateKbps}">${cdata(file.url)}</MediaFile>`,
  );
  return [
    `  <Ad id="${input.id}"${sequence === null ? '' : ` sequence="${sequence}"`}>`,
    '    <InLine>',
    '      <AdSystem>vega-ads demo</AdSystem>',
    `      <AdTitle>${escapeXml(input.title)}</AdTitle>`,
    ...(input.advertiser === undefined ? [] : [`      <Advertiser>${escapeXml(input.advertiser)}</Advertiser>`]),
    `      <Impression>${pixel('impression')}</Impression>`,
    `      <Error>${pixel('error', '&code=[ERRORCODE]')}</Error>`,
    '      <Creatives>',
    `        <Creative id="${input.id}-video">`,
    `          <UniversalAdId idRegistry="${escapeXml(uaid.idRegistry)}">${escapeXml(uaid.value)}</UniversalAdId>`,
    `          <Linear${skip}>`,
    `            <Duration>${vastTime(input.durationSeconds)}</Duration>`,
    '            <TrackingEvents>',
    ...TRACKING_EVENTS.map((event) => `              <Tracking event="${event}">${pixel(event)}</Tracking>`),
    '            </TrackingEvents>',
    '            <MediaFiles>',
    ...files,
    '            </MediaFiles>',
    '          </Linear>',
    '        </Creative>',
    '      </Creatives>',
    '    </InLine>',
    '  </Ad>',
  ].join('\n');
}

/** Writes a VAST 4.2 document: one InLine ad, or a pod (`sequence` 1..n) for several ads. */
export function buildVast(ads: readonly VastAdInput[]): string {
  if (ads.length === 0) {
    throw new RangeError('A VAST document needs at least one ad');
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<VAST version="4.2" xmlns="http://www.iab.com/VAST">',
    ...ads.map((ad, index) => inlineAd(ad, ads.length > 1 ? index + 1 : null)),
    '</VAST>',
    '',
  ].join('\n');
}

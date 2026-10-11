// Ambient typings for @dailymotion/vmap (it ships none); a reference keeps them visible when another package compiles this file.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/dailymotion-vmap.d.ts" />
import VMAP, { VMAPAdBreak } from '@dailymotion/vmap';
import { XMLSerializer } from '@xmldom/xmldom';
import type { AdSourceRef } from './types';
import { createUrlHandler, describeFailure, UrlHandlerDeps } from './urlHandler';

export type { AdSourceRef };

export type BreakOffset =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'time'; seconds: number }
  | { kind: 'percent'; percent: number };

export type VmapTrackingEvent = 'breakStart' | 'breakEnd' | 'error';

export interface BreakSource {
  id: string | null;
  source: AdSourceRef;
  allowMultipleAds: boolean;
  track(event: VmapTrackingEvent, errorCode?: number): void;
}

export interface ScheduledBreak {
  id: string;
  offset: BreakOffset;
  /** More than one source means a standard pod: one break, several ad requests. */
  sources: BreakSource[];
}

export type VmapResult =
  | { status: 'ok'; breaks: ScheduledBreak[] }
  | { status: 'empty' }
  | { status: 'failed'; errorCode: number };

export const VMAP_SCHEMA_ERROR = 1000;
export const VMAP_PARSING_ERROR = 1002;
export const VMAP_BREAK_TYPE_NOT_SUPPORTED = 1003;
export const VMAP_TEMPLATE_TYPE_NOT_SUPPORTED = 1005;
export const VMAP_AD_RESPONSE_TIMEOUT = 1007;
export const VMAP_AD_RESPONSE_ERROR = 1008;

const VAST_TEMPLATES = new Set(['vast', 'vast1', 'vast2', 'vast3', 'vast4']);

/** `start`, `end`, `hh:mm:ss(.mmm)` and `n%`. Positional `#n` is not supported in v0.1. */
export function parseTimeOffset(value: string | null): BreakOffset | null {
  const text = (value ?? '').trim();
  if (text === 'start') return { kind: 'start' };
  if (text === 'end') return { kind: 'end' };

  const percent = /^(\d+(?:\.\d+)?)%$/.exec(text);
  if (percent) {
    const amount = Number(percent[1]);
    if (amount > 100) return null;
    if (amount === 0) return { kind: 'start' };
    if (amount === 100) return { kind: 'end' };
    return { kind: 'percent', percent: amount };
  }

  const time = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d{1,3})?)$/.exec(text);
  if (time) {
    const [hours, minutes, seconds] = [Number(time[1]), Number(time[2]), Number(time[3])];
    if (minutes > 59 || seconds >= 60) return null;
    const total = hours * 3600 + minutes * 60 + seconds;
    return total === 0 ? { kind: 'start' } : { kind: 'time', seconds: total };
  }
  return null;
}

function offsetKey(offset: BreakOffset): string {
  switch (offset.kind) {
    case 'time':
      return `t${offset.seconds}`;
    case 'percent':
      return `p${offset.percent}`;
    default:
      return offset.kind;
  }
}

function isLinearBreak(adBreak: VMAPAdBreak): boolean {
  return (adBreak.breakType ?? '')
    .split(',')
    .map((type) => type.trim().toLowerCase())
    .includes('linear');
}

function sourceOf(adBreak: VMAPAdBreak): AdSourceRef | null {
  const source = adBreak.adSource;
  if (source?.adTagURI) {
    const template = (source.adTagURI.templateType ?? '').toLowerCase();
    return VAST_TEMPLATES.has(template) && source.adTagURI.uri ? { kind: 'url', url: source.adTagURI.uri } : null;
  }
  if (source?.vastAdData) {
    return { kind: 'xml', xml: new XMLSerializer().serializeToString(source.vastAdData) };
  }
  return null;
}

/**
 * Sends the break's tracking pixels. Done here, not by @dailymotion/vmap: it replaces only
 * the first `[ERRORCODE]` and not the `[ERROR_CODE]` spelling of VMAP 1.0.1.
 */
function track(adBreak: VMAPAdBreak, event: VmapTrackingEvent, errorCode?: number): void {
  for (const tracker of adBreak.trackingEvents) {
    if (tracker.event !== event) {
      continue;
    }
    const code = String(errorCode ?? '');
    const uri = event === 'error' ? tracker.uri.split('[ERRORCODE]').join(code).split('[ERROR_CODE]').join(code) : tracker.uri;
    adBreak.tracker(uri);
  }
}

export async function requestVmap(url: string, deps: UrlHandlerDeps): Promise<VmapResult> {
  const result = await createUrlHandler(deps).get(url, {});
  if (!('xml' in result)) {
    const failure = describeFailure(result.error);
    if (failure.kind === 'timeout') return { status: 'failed', errorCode: VMAP_AD_RESPONSE_TIMEOUT };
    if (failure.kind === 'xml') return { status: 'failed', errorCode: VMAP_PARSING_ERROR };
    return { status: 'failed', errorCode: VMAP_AD_RESPONSE_ERROR };
  }

  let vmap: VMAP;
  try {
    vmap = new VMAP(result.xml);
  } catch {
    return { status: 'failed', errorCode: VMAP_SCHEMA_ERROR };
  }

  const breaks = new Map<string, ScheduledBreak>();
  for (const adBreak of vmap.adBreaks) {
    if (!isLinearBreak(adBreak)) {
      track(adBreak, 'error', VMAP_BREAK_TYPE_NOT_SUPPORTED);
      continue;
    }
    const offset = parseTimeOffset(adBreak.timeOffset);
    if (!offset) {
      // Positional offsets (#n) are skipped quietly: they are valid VMAP, just not supported yet.
      if (!(adBreak.timeOffset ?? '').startsWith('#')) {
        track(adBreak, 'error', VMAP_SCHEMA_ERROR);
      }
      continue;
    }
    // An AdBreak without AdSource is valid VMAP (e.g. tracking only): nothing to play, no error.
    if (!adBreak.adSource) {
      continue;
    }
    const source = sourceOf(adBreak);
    if (!source) {
      track(adBreak, 'error', VMAP_TEMPLATE_TYPE_NOT_SUPPORTED);
      continue;
    }

    const key = offsetKey(offset);
    const scheduled = breaks.get(key) ?? { id: adBreak.breakId || key, offset, sources: [] };
    scheduled.sources.push({
      id: adBreak.adSource?.id ?? null,
      source,
      // VMAP default is "allowed"; only an explicit "false" turns it off.
      allowMultipleAds: adBreak.adSource?.allowMultipleAds !== 'false',
      track: (event, errorCode) => track(adBreak, event, errorCode),
    });
    breaks.set(key, scheduled);
  }

  return breaks.size === 0 ? { status: 'empty' } : { status: 'ok', breaks: [...breaks.values()] };
}

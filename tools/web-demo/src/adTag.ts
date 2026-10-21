import type { AdSchedule } from 'react-native-ads-core';

/** An ad tag the viewer gives: a VMAP with its breaks, or one VAST tag. */
export interface AdTag {
  kind: 'vmap' | 'vast';
  url: string;
}

/**
 * Google's public IMA sample tags. Their server sends CORS headers, so a page can read them.
 * The player fills `[CACHEBUSTING]`.
 */
export const SAMPLE_TAGS: Record<'googleVmap' | 'googleVast', AdTag> = {
  googleVmap: {
    kind: 'vmap',
    url: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/vmap_ad_samples&sz=640x480&cust_params=sample_ar%3Dpremidpost&ciu_szs=300x250&gdfp_req=1&ad_rule=1&output=vmap&unviewed_position_start=1&env=vp&impl=s&cmsid=496&vid=short_onecue&correlator=[CACHEBUSTING]',
  },
  googleVast: {
    kind: 'vast',
    url: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]',
  },
};

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/[^\s/]+/i.test(text);
}

/** A VMAP as it is; a VAST tag plays as a pre-roll. */
export function scheduleFor(tag: AdTag): AdSchedule {
  return tag.kind === 'vmap' ? { vmapUrl: tag.url } : { breaks: [{ offset: 'start', vastUrl: tag.url }] };
}

/** The tag in the page address, `?vmap=URL` or `?vast=URL`, so a test can be shared as a link. */
export function tagFromQuery(search: string): AdTag | null {
  const query = new URLSearchParams(search);
  for (const kind of ['vmap', 'vast'] as const) {
    const url = query.get(kind) ?? '';
    if (isHttpUrl(url)) {
      return { kind, url };
    }
  }
  return null;
}

export function tagQuery(tag: AdTag): string {
  return `?${tag.kind}=${encodeURIComponent(tag.url)}`;
}

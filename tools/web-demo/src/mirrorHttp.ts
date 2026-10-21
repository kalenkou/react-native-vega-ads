import type { HttpPort } from 'react-native-ads-core';

type Fetch = (url: string, init?: RequestInit) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

/**
 * HttpPort on fetch that reads the VAST, VMAP and WebVTT files of `cdnBase` from a copy at
 * `mirrorBase`. The demo CDN sends no CORS headers, so a page on another origin cannot read
 * those files. The copy is made when the page is built. Video and images still come from
 * the CDN: a video or img element needs no CORS.
 */
export function mirrorHttp(cdnBase: string, mirrorBase: string, fetchFn: Fetch = fetch): HttpPort {
  const target = (url: string): string => {
    const path = url.split('?')[0] ?? url;
    return url.startsWith(cdnBase) && /\.(xml|vtt)$/.test(path) ? mirrorBase + path.slice(cdnBase.length) : url;
  };
  return {
    get: async (url, options) => {
      const response = await fetchFn(target(url), { signal: options?.signal });
      return { status: response.status, ok: response.ok, text: () => response.text() };
    },
  };
}

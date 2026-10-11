# @vega-ads/vast

VAST 4 / VMAP 1 loading, media file choice and IAB tracking for React Native and Amazon Vega OS. No player code: use it on its own, or through [`@vega-ads/core`](../core) and [`@vega-ads/vega`](../vega).

Part of [vega-ads](https://github.com/kalenkou/vega-ads).

## Why a separate package

Vega has no `DOMParser`, and `@dailymotion/vast-client` needs one. This package wires `vast-client` and `@dailymotion/vmap` to a pure-JS parser (`@xmldom/xmldom`), adds timeouts, wrapper limits, VAST error codes and a tracking pixel sender that works without `Image`.

## Use

```ts
import { requestVast, requestVmap, selectMediaFile, AdTracker, installImagePolyfill } from '@vega-ads/vast';

const http = {
  get: async (url, options) => {
    const response = await fetch(url, { signal: options?.signal });
    return { status: response.status, ok: response.ok, text: () => response.text() };
  },
};
const clock = { now: Date.now, setTimeout, clearTimeout };

installImagePolyfill(http); // tracking pixels go through your HTTP port

const vmap = await requestVmap('https://ads.example.com/vmap.xml', { http, clock });
const vast = await requestVast('https://ads.example.com/vast.xml', { http, clock });
if (vast.status === 'ok') {
  const ad = vast.ads[0];
  const file = selectMediaFile(ad.creative.mediaFiles, { maxHeight: 1080 });
  const tracker = new AdTracker(ad);
  // tracker.firstFrame(), tracker.progress(seconds), tracker.ended(), tracker.skip(), tracker.error(code)
}
```

| Export | What it does |
|---|---|
| `requestVmap(url, deps)` | VMAP 1 → breaks (`start`, seconds, `end`), pods grouped by offset, VMAP error codes |
| `requestVast(urlOrXml, deps)` | VAST 4 InLine/Wrapper (up to 5 wrappers), pods by `sequence`, `[CACHEBUSTING]` and app macros, VAST error codes |
| `selectMediaFile(files, options)` | H.264 MP4 or HLS that fits the screen and bitrate; 403 if none |
| `AdTracker` | impression, start, quartiles, complete, pause, resume, skip, error |
| `adIdMacros(source)` | `IFA`, `IFATYPE`, `LIMITADTRACKING` from the Fire TV advertising ID |
| `installImagePolyfill(http)` | `Image` for tracking pixels on platforms without it |
| `parseXml` / `XmlParser` | the default parser, or pass your own as `parseXml` |

## License

Apache-2.0

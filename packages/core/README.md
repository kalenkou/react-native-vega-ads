# react-native-ads-core

VAST 4 / VMAP 1 and player-independent ad break logic for client-side ad insertion in React Native: ad requests, media file choice, IAB tracking, break schedule, ad pods, two-player hand-over and overlay state.

Most apps get it through [`react-native-vega-ads`](https://github.com/kalenkou/react-native-vega-ads/tree/main/packages/vega). Use it on its own for VAST/VMAP and tracking only. The break logic talks to the player through `PlayerPort`. The Vega adapter is tested on a Fire TV Stick. A browser adapter for an HTML video element is in the [web demo](https://github.com/kalenkou/react-native-vega-ads/tree/main/tools/web-demo).

Part of [react-native-vega-ads](https://github.com/kalenkou/react-native-vega-ads). On Amazon Vega OS use [`react-native-vega-ads`](https://github.com/kalenkou/react-native-vega-ads/tree/main/packages/vega), which wraps this package in a React hook.

## Ports

`core` never imports a player SDK, `fetch` or timers. Give it:

- `PlayerPort`: your content player and a factory for ad players (the interface is in [docs/architecture.md](https://github.com/kalenkou/react-native-vega-ads/blob/main/docs/architecture.md))
- `HttpPort`: `get(url, { signal })`
- `ClockPort`: `now`, `setTimeout`, `clearTimeout`.

## Use

```ts
import { AdManager, adUiState } from 'react-native-ads-core';

const manager = new AdManager({
  http,
  clock,
  content: myContentPlayer,          // PlayerPort, initialized, autoplay off
  createAdPlayer: () => new MyAdPlayer(),
  adSurface: 'ad-a',
  standbySurface: 'ad-b',            // optional: prebuffer the next ad on a second player
  onChange: (snapshot) => render(adUiState(snapshot)),
  onEvent: (name, info) => console.log(name, info.ad?.id),
});

await manager.start({ vmapUrl: 'https://ads.example.com/vmap.xml' });
// manager.skip(), manager.togglePause(), manager.back(), manager.suspend(), manager.wake(), manager.dispose()
```

What it handles:

- pre-, mid- and post-rolls. A seek over a break plays only the last skipped break
- pods in `sequence` order. The next ad starts ~500 ms before the current one ends, so no content frame shows between ads
- impression only for a visible ad. One sound at a time
- every error and timeout ends in content, with the VAST error code sent.
- the VMAP and the pre-roll can be requested before the player exists: `preloadAds(schedule, { http, clock, macros })`, then `manager.start(schedule, { preloaded })`. Answers older than five minutes are not used
- `onTimeline` gives the mid-rolls for a timeline and an "Ad in N" countdown, only for a break whose ads are loaded.

## VAST and VMAP only

Vega has no `DOMParser`. `@dailymotion/vast-client` needs one. It wires `vast-client` and `@dailymotion/vmap` to a pure-JS parser (`@xmldom/xmldom`), adds timeouts, wrapper limits, VAST error codes and a tracking pixel sender that works without `Image`.

```ts
import { requestVast, requestVmap, selectMediaFile, AdTracker, installImagePolyfill } from 'react-native-ads-core';

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
| `requestVast(urlOrXml, deps)` | VAST 4 InLine/Wrapper (up to 5 wrappers by default, `maxRedirects`), pods by `sequence`, `[CACHEBUSTING]` and app macros, VAST error codes |
| `selectMediaFile(files, options)` | H.264 MP4 or HLS that fits the screen and bitrate. 403 if none |
| `AdTracker` | impression, start, quartiles, complete, pause, resume, skip, error |
| `adIdMacros(source)` | `IFA`, `IFATYPE`, `LIMITADTRACKING` from the Fire TV advertising ID |
| `installImagePolyfill(http)` | `Image` for tracking pixels on platforms without it |
| `parseXml` / `XmlParser` | the default parser, or pass your own as `parseXml` |
| `installDOMParser()` | adds `DOMParser` and `XMLSerializer` to `globalThis` for other libraries (Vega has none) |

## License

Apache-2.0

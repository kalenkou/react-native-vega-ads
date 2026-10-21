# Changelog

All notable changes to `react-native-ads-core` and `react-native-vega-ads`. The two packages share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `maxRedirects`: how many VAST wrappers to follow before VAST error 302, as in Google IMA. Default 5, as before. For `useVegaAds`, `VegaAdsPlayer`, `preloadVegaAds`, `useStitchedAds`, `AdManager`, `preloadAds` and `requestVast`. `MAX_REDIRECTS` is the default. `WRAPPER_LIMIT` is deprecated.
- `AdEventName`: the event names of `onEvent`, so editors complete them. The handler still accepts any string.
- `useVegaVideoPlayer`: `useVideoPlayer` under a name that does not clash with react-native-video's hook.
- `useVegaAds` warns in development when its video surfaces are still missing after 3 s. Before, the screen waited without a sign.

### Documentation

- README: why the library is needed, "Try it" with the release builds, a public test VMAP, the peer versions.
- API reference: the parts you can use alone, pitfalls, all hook options, the `strings` keys, `ui.visible`.
- Guide: the hook example continues at the same place after Home and draws "Ad in 5" and the pause ad. Code samples have their imports.

## [0.1.0] - 2026-10-21

First release.

### react-native-ads-core

- VAST 4 and VMAP 1 without `DOMParser`: `requestVast`, `requestVmap` with `@xmldom/xmldom`, up to 5 wrappers, timeouts, `[CACHEBUSTING]`, `[ASSETURI]`, break limit and app macros in the VMAP and VAST URLs, VAST and VMAP error codes.
- `selectMediaFile`: H.264 MP4 or HLS that fits the screen and bitrate.
- `AdTracker`: impression only for a visible ad, start, quartiles, complete, pause, resume, skip, error. `installImagePolyfill` sends pixels without `Image`.
- `AdManager`: pre-, mid- and post-rolls through a `PlayerPort`. Pods play in `sequence` order on two players, and the next ad starts about 500 ms before the current one ends. A seek over breaks plays only the last one. Every error and timeout ends in content.
- Break events for the app: `breakStart` before a break's first ad, `breakEnd`, and `break:<id>:empty` when a break has no ad to play.
- `onEvent(name, info)`: the second argument has the break id and the ad (id, creative id, title, advertiser, duration, place in the pod). `snapshot.ad` has the same data for the ad on screen.
- Break context: a break blocks ad categories (from the VMAP or by hand). Blocked ads are left out with VAST error 205, spare ads of the response take their place, and `[BLOCKEDADCATEGORIES]` tells the ad server the list in each request of the break.
- No repeated creatives or advertisers across breaks and, with an optional memory, across titles and launches. Break limits `maxBreakAds` and `maxBreakSeconds`.
- Never louder than the movie: with `contentLoudness`, a louder ad is turned down to it, never up.
- Pause ads from VAST NonLinear (IAB CTV Ad Portfolio), with QR code and IAB tracking.
- `preloadAds`: the VMAP and the pre-roll before the player exists.
- `onTimeline`: mid-roll marks and an "Ad in N" countdown. `adPlanLabel`, `AdPlan.marks` and `watchReport` for what the viewer sees before and after a watch.
- Why line on ads: which ads were left out after the scene, repeats and volume.
- Preview: `StitchedAdTracker` and `loadStitchedAds` for ads stitched into the stream by a server: IAB pixels by the content time, with the client pod rules.

### react-native-vega-ads

- `<VegaAdsPlayer>`: content, ads, overlay, countdown and pause ad in one component on Amazon Vega OS (Fire TV). Every part can be replaced.
- `useVegaAds`, `useVideoPlayer`, `DualSurfaceView`, `AdSurfaceLayers` on `@amazon-devices/react-native-w3cmedia`.
- In the background the content player is released too, as Amazon requires, in Amazon's order: its surface first, then `deinitialize()`. Back in front, the movie continues at the same place without the ads already shown. `startAt` continues a viewing from your own saved position, for example after the system ended the app while a player was still closing.
- `AdOverlay` with D-pad focus on Skip and VoiceView announcements. VoiceView reads each ad once and Skip when it opens, not the countdown. `useAdAnnouncements` and `AdSkipButton` for your own overlay. `adStyles` for your fonts and colours on the built-in ad UI. `ads.ui.name` and `ads.ui.timeLeft` for an own layout of the label. `ads.ad` is the ad on screen, and `onEvent` gets the break and the ad of each event.
- `createAdMediaControlHandler`: "Alexa, pause" and the remote during ads. Seek and skip are blocked.
- `vegaAdIdSource` for the Fire TV advertising ID. `preloadVegaAds` and `useAdPlan` for the title page. `rnvPlayerPort` for react-native-video v7.
- Preview: `useStitchedAds` (IAB tracking of ads stitched into the stream by a server). `HeadlessPlayerService` and `HeadlessPlayerAdapter` (Amazon's headless player approach). `createAdPlayer` for ad players that are any `PlayerPort`.

[0.1.0]: https://github.com/kalenkou/react-native-vega-ads/releases/tag/v0.1.0

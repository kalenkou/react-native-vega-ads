# Changelog

All notable changes to `react-native-ads-core` and `react-native-vega-ads`. The two packages share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- WebVTT captions: tags are removed in one pass. Before, a long caption line full of "<" from an ad server took seconds to read (found by CodeQL).
- WebVTT captions: a line with "-->" starts the next cue, as the WebVTT parsing rules say, also without a blank line before it. Before, it was read as text of the previous cue (found by a property test).

## [0.1.3] - 2026-10-23

### Fixed

- `scaleStyles()` also scales the logical lengths of React Native 0.83: `inset`, block and inline margin and padding, logical corner radii, `outlineWidth` and `outlineOffset`.

### Documentation

- API reference: a pitfall on React Native 0.83. The first read of `AdIdRetriever` can hold the JavaScript thread for up to 2.6 s on a cold start (FL-38). Pass `adId` after your first screen is drawn. The demo's movie page now asks for the ad plan when its poster has loaded.
- `packages/vega/README.md`: the seek bar example ends a slide when a break starts (`breakStart` in `onEvent`).
- `SECURITY.md`: where the Dependabot alerts of the example apps come from.
- Friction log FL-38 and FL-39.

### Example apps

- The demo asks for the ad plan after the movie page is drawn. After Next it never shows the plan of the previous movie. On React Native 0.83 the P90 of fully drawn fell from 6.3 s to 5.5 s in 30 cold launches (28 counted).
- `apps/streaming-kit`: Back from a movie returns the focus to its poster.

## [0.1.2] - 2026-10-23

### Added

- `layoutScale()` and `scaleStyles()`: React Native 0.83 on Vega lays out in dp on a 960x540 canvas. Sizes written for the 1920x1080 layout of React Native 0.72 draw twice as big there. The built-in ad UI (label, Skip, countdown, captions, pause ad) now scales itself with the window width and looks the same on both. Apps can scale their own 1920x1080 styles with `scaleStyles`. Styles passed in `adStyles`, `styles` and `pauseAdStyle` are not scaled.

### Changed

- **Upgrade note:** the built-in ad UI reads the window width once, when the package loads, and scales its 1920x1080 sizes by it. In Jest, mock `Dimensions.get('window')` to 1920x1080 before the import, or the UI renders at the size of the mock's window.

### Documentation

- `packages/vega/README.md`: "React Native 0.72 and 0.83" and a seek bar example with the ad breaks from `ads.timeline.marks`.
- The demo app runs on React Native 0.83. `docs/device-results.md` has the compatibility table and the 0.83 run. Friction log FL-36 and FL-37.

### Tools

- `tools/web-demo`: a web page that runs `react-native-ads-core` with an HTML video element as the player (`HtmlVideoPort`). It plays the demo's movies and ads and logs the ad requests, events and tracking pixels. No change in the packages.
- `tools/web-demo`: your own ad tag, and shared `?vmap=` and `?vast=` links. Fixes for Back, Play, the arrow keys and screen readers.

## [0.1.1] - 2026-10-22

### Added

- `maxRedirects`: how many VAST wrappers to follow before VAST error 302, the same option as in Google IMA. Default 5, as before and as the IAB recommends (the IMA default is 4). For `useVegaAds`, `VegaAdsPlayer`, `preloadVegaAds`, `useStitchedAds`, `AdManager`, `preloadAds` and `requestVast`. `MAX_REDIRECTS` is the default, exported by both packages. `WRAPPER_LIMIT` is deprecated.
- `AdEventName`: the event names of `onEvent`, so editors complete them. The handler still accepts any string.
- `useVegaVideoPlayer`: `useVideoPlayer` under a name that does not clash with react-native-video's hook.
- `useVegaAds` warns in development when its video surfaces have not come 3 s after it gets a source and a player. Before, the screen waited without a sign. Surfaces that go away later, for example in the background, give no warning.

### Changed

- `PauseAd`: the QR code sits on a white tile with a quiet zone, so a phone reads it on a bright picture. The hints have a dark backing instead of a text shadow. The scan hint is 22 px and wraps to the tile width. If you style `pauseAdHint`, check it on the new backing. `pauseAdHint: { backgroundColor: 'transparent' }` removes it.

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
- Break context: a break blocks ad categories (from the VMAP or by hand). Blocked ads are left out with VAST error 205. Spare ads of the response take their place. `[BLOCKEDADCATEGORIES]` tells the ad server the list in each request of the break.
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

[Unreleased]: https://github.com/kalenkou/react-native-vega-ads/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/kalenkou/react-native-vega-ads/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kalenkou/react-native-vega-ads/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kalenkou/react-native-vega-ads/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kalenkou/react-native-vega-ads/releases/tag/v0.1.0

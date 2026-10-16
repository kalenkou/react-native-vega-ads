# Changelog

All notable changes to `react-native-ads-core` and `react-native-vega-ads`. The two packages share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - unreleased

First release.

### react-native-ads-core

- VAST 4 and VMAP 1 without `DOMParser`: `requestVast`, `requestVmap` with `@xmldom/xmldom`, up to 5 wrappers, timeouts, `[CACHEBUSTING]`, `[ASSETURI]`, break limit and app macros in the VMAP and VAST URLs, VAST and VMAP error codes.
- `selectMediaFile`: H.264 MP4 or HLS that fits the screen and bitrate.
- `AdTracker`: impression only for a visible ad, start, quartiles, complete, pause, resume, skip, error; `installImagePolyfill` sends pixels without `Image`.
- `AdManager`: pre-, mid- and post-rolls through a `PlayerPort`; pods in `sequence` order on two players, the next ad starts about 500 ms before the current one ends; a seek over breaks plays only the last one; every error and timeout ends in content.
- No repeated creatives or advertisers across breaks and, with an optional memory, across titles and launches; break limits `maxBreakAds` and `maxBreakSeconds`; ads of a category the break blocks are left out.
- Never louder than the movie: with `contentLoudness`, a louder ad is turned down to it, never up.
- Pause ads from VAST NonLinear (IAB CTV Ad Portfolio), with QR code and IAB tracking.
- `preloadAds`: the VMAP and the pre-roll before the player exists.
- `onTimeline`: mid-roll marks and an "Ad in N" countdown; `adPlanLabel`, `AdPlan.marks` and `watchReport` for what the viewer sees before and after a watch.
- Why line on ads: which ads were left out after the scene, repeats and volume.

### react-native-vega-ads

- `<VegaAdsPlayer>`: content, ads, overlay, countdown and pause ad in one component on Amazon Vega OS (Fire TV); every part can be replaced.
- `useVegaAds`, `useVideoPlayer`, `DualSurfaceView`, `AdSurfaceLayers` on `@amazon-devices/react-native-w3cmedia`.
- `AdOverlay` with D-pad focus on Skip and VoiceView announcements; `useAdAnnouncements` for your own overlay.
- `createAdMediaControlHandler`: "Alexa, pause" and the remote during ads; seek and skip are blocked.
- `vegaAdIdSource` for the Fire TV advertising ID; `preloadVegaAds` and `useAdPlan` for the title page; `rnvPlayerPort` for react-native-video v7.

[0.1.0]: https://github.com/kalenkou/vega-ads/releases/tag/v0.1.0

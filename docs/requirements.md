# Requirements

The rules the library was built against. Code comments and test names refer to them as `(R1)`…`(R26)`. Each one has tests that were written before the code. "Device" means it was also checked on a Fire TV Stick 4K Select ([`apps/spike/DEVICE-TESTS.md`](../apps/spike/DEVICE-TESTS.md)).

## VAST, VMAP and tracking

| ID | Requirement | Where |
|---|---|---|
| R1 | The impression is sent on the ad's first frame, all `<Impression>` URLs at once, and only for an ad that is on screen. | `core/src/machine/AdBreakSession.ts`, `AdTracker`; device |
| R2 | Quartiles come from the ad player's `currentTime` (25, 50, 75 %); `complete` comes from `ended`. | `core/src/vast/tracking/AdTracker.ts`; device |
| R3 | More than 5 wrappers: VAST error 302, the ad is skipped. | `core/src/vast/request/VastRequester.ts` (`WRAPPER_LIMIT`, counts documents) |
| R4 | A VAST request times out after 4 s: error 301, the ad is skipped. | `core/src/vast/request/urlHandler.ts` (`DEFAULT_VAST_TIMEOUT_MS`) |
| R5 | An empty VAST is skipped without an error; error 303 goes only to an `<Error>` URL if there is one. | `VastRequester.ts` |
| R6 | Media file: a playable type (MP4 H.264 or HLS), no taller than the screen, bitrate closest to the target; none fits: error 403. | `core/src/vast/request/mediaFileSelector.ts` |
| R7 | A playback error: VAST error 405, then the next ad or the content. | `AdBreakSession.ts`; device |
| R8 | Skip only after `skipoffset`; a `skip` event to tracking. | `AdBreakSession.ts`, `AdOverlay`; device |
| R14 | Tracking pixels are fire-and-forget with one retry and never block playback. vast-client sends them with `new Image()`, which Vega lacks: the library installs an `Image` that goes through the app's HTTP port. Upstream fix proposed: [vast-client-js#512](https://github.com/dailymotion/vast-client-js/pull/512) (`trackingHandler`). | `core/src/vast/polyfill/image.ts`; device |
| R15 | The user's opt-out (`isAdvertisingTrackingEnabled`) is read before the advertising ID; on opt-out or any error no ID is sent and `LIMITADTRACKING` is 1. | `core/src/vast/tracking/AdTracker.ts` (`adIdMacros`), `vega/src/vegaAdIdSource.ts` |
| R16 | vast-client always gets our own URL handler (fetch + pure-JS XML), because its built-in one needs the browser's `DOMParser`. | `urlHandler.ts`, `core/src/xml` |
| R17 | Pods: both a VAST with `sequence` 1..n and several ad sources at one VMAP time; ads without `sequence` are a buffet for failed pod ads. | `core/src/pod/PodController.ts`, `VmapRequester.ts` |
| R18 | VMAP `timeOffset`: `start`, `end`, `hh:mm:ss(.mmm)` and `n%`; position offsets (`#n`) are skipped; VMAP errors use their own codes. | `core/src/vast/request/VmapRequester.ts` |
| R20 | VAST error codes sent: 100 (XML), 200 (no linear ad), 205 (blocked category), 301, 302, 303 (timeout, wrappers, no ad; with vast-client), 400 (not ready in time), 403 (no playable file), 405 (playback). Planned but not sent: 102, 401, 402, 900. | across `core` |

## Players and the screen

| ID | Requirement | Where |
|---|---|---|
| R9 | During an ad, seeking is blocked; pause and resume send their events. | `vega/src/adMediaControlHandler.ts`, `AdTracker`; device |
| R10 | A break is loaded and buffered `prefetchSeconds` (default 15) before it, in a second player with `autoplay` off, until `canplay`. | `core/src/schedule/BreakScheduler.ts`, `AdBreakSession.ts`; device |
| R11 | No black frame between content and ad: separate surfaces, the content surface is never cleared. | `vega/src/DualSurfaceView.tsx`, `AdSurfaceLayers.tsx`; device (phone video, frame by frame) |
| R12 | After a break the content continues from where it stopped; the ad players are released. | `AdBreakSession.ts`; device (drift 0.00 s) |
| R13 | Going to the background during an ad releases both players; on return the content continues and the break is not shown again. | `core/src/manager/AdManager.ts`, `vega/src/useVegaAds.ts`; device |
| R19 | w3cmedia: wait for `initialize()`; `play()` resolves early, so an ad starts on `playing`, not when `play()` returns. | `vega/src/W3cPlayerAdapter.ts`, `AdBreakSession.ts`; device |
| R21 | The ad player has its own media controls handler: play and pause act on the ad; seek, skip and speed are ignored. | `vega/src/adMediaControlHandler.ts`; device (remote and "Alexa, pause/play") |
| R22 | Audio focus: one ad sound at a time. The finishing ad is muted when the next one starts. A separate handler for lost audio focus is **not** built; an Alexa request is handled by the 30 s silent-stall timeout instead. | `AdBreakSession.ts`; device |
| R23 | Back during an ad: no `skip` or `close` pixel without a viewer action. By default Back goes to the app (an ad without Skip cannot be skipped with Back); `backDuringAd: 'content'` ends the break and continues the movie. | `AdBreakSession.ts`, `AdManager.ts`, `useVegaAds.ts`; device |
| R24 | A seek over mid-rolls plays only the last break it passed, once. | `BreakScheduler.ts` |
| R25 | The app can replace the media file choice. | `mediaFileSelector.ts` (`select`) |
| R26 | Overlay texts are English by default and can be changed; VoiceView announces each ad ("Ad 1 of 2, 15 seconds, you can skip in 5 seconds"). | `core/src/ui/adUiState.ts`, `vega/src/AdOverlay.tsx` |

## Checks for the platform

| ID | Requirement | Where |
|---|---|---|
| R27 | A debug panel with the session state and the last tracking events. **Not built**: the demo shows the last watch report, and `onEvent` gives every event to the app. | — |
| R28 | Check at run time on Vega what exists: `window`, `Image`, `DOMParser`, `AbortController`, `fetch`. Found: `window` and `fetch` exist; `Image` and `DOMParser` do not. | `apps/spike/src/spike/runtime.ts`; device |

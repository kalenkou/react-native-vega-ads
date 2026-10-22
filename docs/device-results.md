# Measured on a real device

Fire TV Stick 4K Select, Vega OS 2.0, 11 to 18.10.2026. Details: [`apps/spike/DEVICE-TESTS.md`](../apps/spike/DEVICE-TESTS.md).

| Check | Result |
|---|---|
| Switch from content to ad | 56-151 ms, no dark frame on video at ~30 fps |
| Content resume position | where it paused, within 0.25 s. A seek back only above that, because a seek re-buffers |
| Mid-roll prefetch | pod of 3 ads ready in 1.6 s, 15 s before the break |
| Gap between ads in a pod | next ad's first frame 85 ms before the previous ad ends. Late in an 11-minute run: 64 ms after it |
| Tracking pixels | impression + 5 events per ad, all HTTP 200 |
| Memory, 9 breaks × 3 ads in 11 min | PSS peak 91 MB, then flat at 65-68 MB (Amazon KPI: < 400 MiB) |
| Demo app, a whole film with no key pressed (Tears of Steel and Sintel, 5 ads each), 16.10 | every ad to the end, the player closes by itself. PSS peak 95-116 MB |
| Remote play/pause and "Alexa, pause/play" | pass during ads and content, with the manifest entries below |
| Media controls focus switch | 197-217 ms |
| VAST parse, 34.4 KB, Release build | ~49 ms text → DOM, ~11 ms DOM → model (median of 30) |
| Cold launch: ad's first frame → impression pixel | 143 ms |
| Play → pre-roll's first frame, ad server answering in 600 ms per request (10 cold launches each) | median 2.4 s without preload, 1.7 s with `preloadVegaAds` on the title page |
| Phone video, content → pod of 3 → content | no black frame, no content frame between ads |
| Full demo run after the last fixes (pre-roll, seek into the mid-roll pod, repeat left out), 16.10 | 3/3 cold launches |
| Seek over a mid-roll | 4/4: the break plays, then the movie resumes at the seek target |
| In Amazon's multi-TV sample, Google IMA sample VMAP | pre-, mid- and post-roll with all quartiles. Remote pause, Back and Skip |
| Demo cold launch on React Native 0.72 (30 launches each, `kpi-visualizer --certification`), 16.10 | launch to first frame: P90 1.08 s with the native splash screen, 1.09 s with the final look (mean 0.88 s, Amazon's target 1.5 s). Before the splash screen: mean 2.39 s, P90 3.35 s. Amazon's empty template: mean 2.07 s on this stick. Fully drawn (poster on screen, `useReportFullyDrawn`): P90 2.49 s, 3.46 s with the final look and its fonts (target: 8 s) |

## Compatibility

| Vega SDK | React Native | Status |
|---|---|---|
| 0.23 | 0.72 | Verified on Fire TV Stick 4K Select, Vega OS 2.0 (`apps/spike`) |
| 0.24 | 0.72 | Verified on the same device (`apps/demo` until 22.10, built with SDK 0.24.12112) |
| 0.24 | 0.83 | Verified on the same device (`apps/demo` since 22.10: the full demo run, a saved place after a kill, ad captions, the screens checked against 0.72), and in Amazon's vega-video-sample with Shaka (`examples/vega-video-sample`) |

On React Native 0.83 the layout is in dp on a 960x540 canvas. The built-in ad UI and the demo scale their 1920x1080 sizes with `layoutScale()` and `scaleStyles()` (FL-37).

The device reports Vega OS 2.0 (`/etc/os-release`: "OS 2.0 (TV Ship/515)", read on 11.10.2026). The Vega Virtual Device of SDK 0.24 runs Vega OS 1.2 (`/etc/os-release`, read on 22.10.2026).

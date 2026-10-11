# Spike device tests

Device: Fire TV Stick 4K Select (OS 1.2, TV Ship/547, armv7l), build: `build/armv7-debug/spike_armv7.vpkg`

| Gate | What | How | Result | Date |
|---|---|---|---|---|
| 6 | Runtime globals | first log lines `runtime: typeof …` | window=object, Image=undefined, DOMParser=undefined, AbortController=function, fetch=function, XMLHttpRequest=function → PASS (polyfill + xmldom needed, as expected) | 11.10.2026 |
| 6 | VAST in Metro bundle | log `ad: ready in … ms` | 132–319 ms, VAST 35 KB in 64–238 ms → PASS | 11.10.2026 |
| 1 | Content → ad without a visible black frame | log `SWITCH content->ad: … ms` (< 300) + phone video | 68 ms; phone video: hard cut both ways, no dark frame at ~30 fps → PASS | 11.10.2026 |
| 4 | Resume position ±1 s | log `RESUME drift: … s` | 0.00 s; ad player released in 220 ms → PASS | 11.10.2026 |
| 5 | Impression and quartile pixels | log `pixel: …` (5 lines per ad) | 1 impression + 5 interaction pixels (start, quartiles, complete), 2.5 s apart → PASS (all responses HTTP 200, checked 11.10.2026) | 11.10.2026 |
| 2 | 30+ min, 10 breaks, memory | button "10 breaks"; `vega exec perf memory-monitor` PSS < 400 MiB, JS heap < 200 MB | 10/10 breaks, 11 min: PSS 32 → 109 MB peak, plateau 106–107 MB after break 7; switch 68–151 ms; drift 0.00 s every time; ad player released in 220–378 ms → PASS (JS heap not measured; 30+ min run still to do) | 11.10.2026 |
| – | Media Controls during ad | "Alexa, pause" / remote play-pause during the ad | Run 1: FAIL (no focus, no manifest entry). Run 2 (11.10.2026, keys injected with `inputd-cli button_press KEY_PLAYPAUSE`): `setMediaControlFocus` + manifest `interface.provider` / `IMediaPlaybackServer` → content pause/resume OK; during the ad focus moves in 197–217 ms, ad pauses and resumes, content stays paused → remote PASS. "Alexa, pause"/resume confirmed by hand on the device → PASS | 11.10.2026 |

Notes:
- The Google sample bucket (gtv-videos-bucket) answers 403; content moved to archive.org BigBuckBunny_512kb.mp4.
- System log drops info lines above 300 lines/s; the on-screen log is the reliable source.

## Core on the device (11.10.2026)

Spike uses `@vega-ads/core` (packed with `npm pack`, installed with `npm run use-core`) instead of its own VAST code.

| Check | Result |
|---|---|
| Metro bundles core (vast-client, vmap ESM build, xmldom) | build OK, app starts → PASS |
| Core `Image` polyfill | "polyfill (core): Image installed"; all pixel responses 200 → PASS |
| `requestVmap` on Google sample `premidpostoptimizedpod` | 3 breaks in 309 ms; mid-roll pod seq 1, 2, 3 (10 s each) → PASS |
| `requestVast` + `selectMediaFile` on Google single inline tag | ready in 461 ms, 10 s, 720p, skipAfter=null; switch 101 ms; resume drift 0.00 s → PASS |

Screens captured on the device with `gwsi-tool-screenshooter /tmp/x.png` and `vega exec vda pull /tmp/x.png .` (no phone needed).

## Full core session on the device (11.10.2026)

Button "VMAP session": Google sample VMAP `premidpostoptimizedpod` → `BreakScheduler` → `AdBreakSession` → two w3cmedia players via `W3cPlayerAdapter` (packed `@vega-ads/core` + `@vega-ads/vega`). Keys pressed with `inputd-cli`, screens read with `gwsi-tool-screenshooter`.

| Check | Result |
|---|---|
| Pre-roll | impression → start → quartiles → complete → resuming → finished; content starts at 0.00 s → PASS |
| Mid-roll prefetch | pod of 3 ready in 1615 ms, 15 s before the break → PASS |
| Switch content → ad | 56 ms → PASS |
| Optimized pod | "Ad 1 of 3" … "Ad 3 of 3", impression and quartiles per ad, all pixels 200 → PASS |
| Resume | content playing at 15.22 s (break at 15 s) → PASS |
| Gap between pod ads | ~1 s from `complete` of ad 2 to impression of ad 3 (same player, new `src`) → **TO FIX**: prebuffer the next ad in a second ad player |
| Gap between pod ads, two ad players (A/B surfaces, next ad prebuffered while the current plays) | `complete` → first frame of next ad: 412 ms, then 496 ms (was 1018 ms). The previous ad's last frame stays on screen until the next ad renders; the surface swaps on its first frame (log "@B" → "@A"). Phone video (11.10.2026): ~0.4–0.6 s of the paused **content frame** between pod ads – on Vega an ad surface turns empty after `ended`, so the content below shows through. |
| Early hand-over (next ad starts 500 ms before the current ends, old ad plays to its end) | next ad's first frame 85 ms **before** the previous ad's `ended`; `complete` still sent after the real end → PASS (logs); phone video re-check: TODO |

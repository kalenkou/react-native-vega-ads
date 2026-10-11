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

## Memory soak through the library (11.10.2026)

Button "Soak": Google optimized pod (3 × 10 s) every 45 s of content, two ad players with early hand-over.

| Check | Result |
|---|---|
| Breaks played in 11 min | 9 breaks × 3 ads = 27 ads, last break at 375 s, content resumed at 375.05 s → PASS |
| PSS (lcm_service `rm_pss`) | peak 91 MB, then plateau 65–68 MB to the end; no growth per break → PASS (limit 400 MiB) |
| Hand-over late in the run | ad 3 first frame 64 ms after ad 2 `complete` → PASS |

## XML parsing speed (11.10.2026)

Button "XML bench", Release build (`build/armv7-release`). One real VAST response (Google sample single inline tag, 34.4 KB) is fetched once, then parsed 30 times without network. Two runs.

| Step | Run 1 | Run 2 |
|---|---|---|
| `@xmldom/xmldom` text → DOM | median 49.6 ms, p95 58.4 ms (48.1–58.8) | median 48.7 ms, p95 52.9 ms (47.9–75.4) |
| `@dailymotion/vast-client` DOM → model | median 11.1 ms, p95 15.7 ms | median 10.9 ms, p95 14.7 ms |
| First run (cold) | 52.3 + 11.1 ms | 75.4 + 12.1 ms |

About 60 ms per 35 KB VAST on the JS thread. The library loads ads ahead of the break (mid-roll pod ready 15 s early), so the viewer does not wait for parsing. A native XML parser is not needed for VAST/VMAP sizes; worth revisiting only for long wrapper chains on the critical path.

## Remote play/pause: media controls vs key events (11.10.2026)

Logger `useTVEventHandler` in the spike (non-D-pad keys), keys injected with `inputd-cli button_press KEY_PLAYPAUSE`.

| Manifest | When | JS key event `playpause` | Player paused by the system |
|---|---|---|---|
| with `kepler.media` category + `IMediaPlaybackServer` | no player has focus | yes (down + up) | – |
| same | during the ad, focus on the ad player | yes (down + up) | yes, ad `pause` 224 ms after key down |
| without both entries | during content, `setMediaControlFocus` on content (resolves in 4 ms) | yes | no |
| same | during the ad | yes | no |

Result: the key always reaches JS. Media controls act only with the manifest entries. With the entries, an app that also toggles playback on its own `playpause` key handler toggles twice. "Alexa, pause" needs the manifest path (see the Media Controls gate above).

### App-handled play/pause without the manifest entries: the system interferes (11.10.2026)

Hook demo, manifest without media controls entries, `mediaControls: false` (no `setMediaControlFocus` at all), app calls `ads.togglePause()` on `playpause` key down. Live system log (`loggingctl log -f`) during one press while the ad was paused:

1. JS gets `playpause` down → `togglePause()` → `MediaPlayer: play`, ad plays (`hook event: resume`).
2. `inputd` MediaController then checks the same key: `isSessionInForeground :0` → `:1` (the player now plays), "Intercepting key event … KEY_PLAYPAUSE state=down".
3. w3cmedia: "Player Session is performing pause operation on Media Player" → ad paused ~450 ms after it resumed.

Result: without the manifest entries, w3cmedia's legacy player session still pauses a PLAYING player on the play/pause key, but does not resume a paused one. An app that handles the key itself races with it: pause looks fine, resume is undone at once. → FAIL for the "own handler, no manifest" mode. Use the manifest + media controls (one owner of the key, Alexa works) and do not handle `playpause` in the app while `ads.playing`.

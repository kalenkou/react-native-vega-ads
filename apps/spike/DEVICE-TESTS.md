# Spike device tests

Device: Fire TV Stick 4K Select (armv7l). `/etc/os-release` on 11.10.2026: "OS 2.0 (TV Ship/515)"; earlier notes said OS 1.2, which was not read from the device, build: `build/armv7-debug/spike_armv7.vpkg`

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

Spike uses `react-native-ads-core` (packed with `npm pack`, installed with `npm run use-core`) instead of its own VAST code.

| Check | Result |
|---|---|
| Metro bundles core (vast-client, vmap ESM build, xmldom) | build OK, app starts → PASS |
| Core `Image` polyfill | "polyfill (core): Image installed"; all pixel responses 200 → PASS |
| `requestVmap` on Google sample `premidpostoptimizedpod` | 3 breaks in 309 ms; mid-roll pod seq 1, 2, 3 (10 s each) → PASS |
| `requestVast` + `selectMediaFile` on Google single inline tag | ready in 461 ms, 10 s, 720p, skipAfter=null; switch 101 ms; resume drift 0.00 s → PASS |

Screens captured on the device with `gwsi-tool-screenshooter /tmp/x.png` and `vega exec vda pull /tmp/x.png .` (no phone needed).

## Full core session on the device (11.10.2026)

Button "VMAP session": Google sample VMAP `premidpostoptimizedpod` → `BreakScheduler` → `AdBreakSession` → two w3cmedia players via `W3cPlayerAdapter` (packed `react-native-ads-core` + `react-native-vega-ads`). Keys pressed with `inputd-cli`, screens read with `gwsi-tool-screenshooter`.

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

Confirmed by hand on the device (same no-manifest build): remote play/pause pauses the ad, the next press does not resume it; "Alexa, pause" / "Alexa, play" have no effect during the ad or the content. → Without the manifest entries neither the app-key mode nor voice control works; the manifest + media controls mode is required.

Confirmed by hand on the device with the normal build (manifest entries, `mediaControls` on, hook demo): remote play/pause pauses and resumes the ad; "Alexa, pause" / "Alexa, play" work during the ad and on the content. → PASS (11.10.2026)

## Amazon vega-video-sample with Shaka, SDK 0.24 / RN 0.83 (11.10.2026)

The public AmazonAppDev/vega-video-sample (React Native 0.83, w3cmedia 2.3.2, Shaka for DASH/HLS) built with Vega SDK 0.24.12112; the packed library packages installed; integration on the player screen: `useVegaAds` + `AdSurfaceLayers` + `AdOverlay`, the sample's own media controls handler passed as `contentMediaControlHandler`, player UI and buffering view hidden while `ads.playing`. VMAP: Google sample pre/mid(pod of 3)/post.

| Check | Result |
|---|---|
| MP4 title ("Empire", static player path) | pre-roll → `breakEnd` → content starts; mid-roll pod "Ad 1..3 of 3" at 0:15 → PASS |
| DASH title through Shaka ("Infinite Blue") — first runs | pre-roll stuck in `interrupted`, black screen. Cause: Shaka sends `timeupdate` while the pre-roll loads; the manager released the pre-roll as a passed break. Fixed in core (4c5772c), unit test added |
| DASH title after the fix, 3 fresh launches | pre-roll plays every time (3/3) → PASS |
| Remote play/pause during the pre-roll (media controls of the sample's manifest) | `pause`, then `resume` → PASS |
| Mid-roll pod over Shaka content | 3 ads back to back, next ad's impression before the previous `complete` (early hand-over) → PASS |
| Back during the 3rd pod ad | `breakEnd`, content continues at 0:17 with the player UI → PASS |
| Back during the mid-roll pod (second run) | content continues at 0:16; one screenshot right after Back shows a black frame with the player UI, the next one (3 s later) shows the content → PASS |
| Home during the pre-roll (launcher started with `vlcm launch-app`) | the ad player pauses, its audio stream stops and the player is destroyed in the first 0.1 s of the log; launcher in foreground 2.3 s later; no ad audio after → PASS |
| Same, then 4.6 s in the background | the system Low Resource Killer ends the app (`memory-mid: request to terminate`, `LowResourceKiller`). The same happens with Home during content without an ad, so it is the sample's memory on a 1 GB stick, not the ads |
| Background/foreground during the pre-roll (`vlcm trigger-app background`, then `foreground`) | no ad on return; the sample itself closes the player screen on `background` (`navigateBack` in its `handleAppStateChange`), so it shows the details screen. Resume after background is covered by unit tests (`suspend`/`wake`) |

Regression after the review fixes (stall watchdog, late/duplicate event guards, VMAP pixels, request macros; a589ddb), same device and sample, MP4 title:

| Check | Result |
|---|---|
| Pre-roll → content → mid-roll pod "Ad 1..3 of 3" at 0:15 → content | PASS. The pod plays in `sequence` order; Google's sample returns its creatives in a different order on each request |
| Remote pause of the pre-roll for 16 s (longer than the 10 s stall watchdog), then resume | the ad stays paused on the same frame, resumes from it, ends, content starts → PASS (a paused ad is not taken for a stalled one) |

After the minor fixes (b0f5611), same sample: 4 runs.

| Run | Result |
|---|---|
| 3 runs (2 of them cold launches) | pre-roll → content → mid-roll pod 1..3 → content → PASS |
| 1 cold launch | the overlay showed "Ad · 0:00" over black for at least 6 s, then the content started without the pre-roll. This matches the 5 s first-frame watchdog (VAST 405, then content), so the viewer was not stuck. The log was not captured, so the cause (slow network or decoder start on the first launch) is not confirmed. Open: watch for it; if it repeats, measure the time from `play()` to the first frame on a cold launch before changing the 5 s default |

`inputd-cli button_press KEY_HOME` reaches the app as a key but does not bring the launcher to the foreground; use `vlcm launch-app orpheus://com.amazon.smplighthouse.launcher.main` to test Home.

Open: post-roll on this sample (the titles are long), display off during an ad, captions above ads, standby decoder on 4K titles.

## Own demo ads and Tears of Steel, cold start fix (11.10.2026)

Hook demo, debug build, SDK 0.24. Content: Tears of Steel 720p (CC BY, Blender Foundation) remuxed to MP4/AAC. Ads: the three creatives from `tools/demo-ads` (Kettlo 10 s, Brewnord 15 s, Voltaro 12 s), VAST and VMAP from `tools/demo-ads/serve.mjs` on the local network: pre-roll, mid-roll pod of 3 at 2:00, mid-roll at 6:00, post-roll.

| Check | Result |
|---|---|
| Media over plain `http://` on the LAN | w3cmedia refuses it: `MediaUrlSourceImpl.cpp(58) createSourceElement Invalid or insecure URI scheme`; the ad fails with VAST 400, the content stays black. `fetch` of VMAP/VAST over the same host works. With `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` in the manifest the media plays (an IP address is accepted, no port needed) |
| Cold launch, before the fix: native `playing` of the ad → JS impression | 2.4 s (first launch after install), 0.5 s (next launch). The log shows `setMediaControlFocus`, called right after `play()`, blocking the JS thread for ~1.2–2.4 s, so the `playing` event waited; `firstQuartile` came 0.3 s after `start`. This also explains the earlier cold launch without a pre-roll (first-frame watchdog) |
| Same, after the fix (media controls focus taken after the first frame is tracked, once per ad) | 143 ms on the first launch after install; `start` right after the impression; quartiles every 2.5 s for the 10 s ad → PASS |
| Mid-roll pod of 3 own ads at 2:00 | pixels for all three ads (impression, start, quartiles every 3.75 / 3 / 2.5 s, complete); the next ad's impression ~0.2 s before the previous `complete` (early hand-over); content resumes at 2:00 → PASS |
| Phone video of the whole run (179 s), frame by frame, plus per-frame brightness | content → Brewnord → Voltaro → Kettlo → content: no black frame and no content frame between ads; one blended camera frame at each switch → PASS |

## Skip with the remote, and voice (11.10.2026)

Hook demo, Kettlo pre-roll (10 s, `skipoffset` 5 s), events mirrored to the local server log.

| Check | Result |
|---|---|
| OK on the Skip button 7.3 s into the ad | `skip` pixel, break ends 0.3 s later, content starts; no `thirdQuartile`/`complete` → PASS |
| OK 1 s into the ad (before the skip offset) | ignored; the ad plays to `complete` → PASS |
| "Alexa, next" / "Alexa, skip" during the ad, with `Next` in `command_options` and NEXT in the published actions | `handleNext` never called in 4 runs (FL-10). Not shipped |
| Voice request during an ad | the ad stops advancing for 6–13 s with no `pause`/`playing` event; once the 10 s stall watchdog ended the ad with 405 (FL-11) |
| Same, after the fix (10 s only after `waiting`, 30 s for a silent stop) | Alexa requests during the Kettlo pre-roll: quartiles 7.3 s apart instead of 2.5 s, no 405, the ad reaches `complete`, content starts → PASS |

## Demo app on VegaAdsPlayer (11.10.2026)

`apps/demo`, release build, SDK 0.24. VMAP from `tools/demo-ads/serve.mjs --midrolls 139.917,441.208` (the quiet points `make-vmap --local` found in Tears of Steel): Kettlo pre-roll, pod of 3 at 2:19.9, Kettlo at 7:21.2, post-roll.

| Check | Result |
|---|---|
| Movie screen: poster, title, Play button with D-pad focus | renders; `reportFullyDrawn` on mount → PASS |
| Pre-roll, no key pressed | all pixels, content starts after `complete` → PASS |
| OK on Skip 7–8 s into the pre-roll (5 runs, 4 of them cold launches) | `skip` pixel, content starts → PASS |
| Same, 1 run: first launch right after another w3cmedia app (the RNV v7 probe) had played | Skip was ignored, the ad played to `complete`, `breakEnd` was reported, but the content stayed paused at 0:00 (black frame, the app's controls showed "Paused"). Not reproduced in the next 5 runs, also not with the same app switch. Only the `[ads]` lines were logged, so the cause is open. Open: log everything during the stability runs; if it repeats, find out whether `play()` on the content is refused or undone |
| Break marks on the app's timeline | two marks at 2:19.9 and 7:21.2 (19 % and 60 %) → PASS |
| "Ad in N" before the mid-roll after a seek to 2:06 | "Ad in 2" at 2:18 (screenshot), `countdown 4` in the log: the pod finished loading 4 s before the break, so the count began at 4. The countdown only shows for a break whose ads are loaded → PASS |
| Mid-roll pod at 2:19.9 | Brewnord, Voltaro, Kettlo: all pixels, content continues → PASS |
| Seek forward over the 7:21.2 break (30 × Right) | the break plays at once (Kettlo, all pixels): a seek gives no free pass → PASS |

## Pre-roll after Play, with and without preloadVegaAds (11.10.2026)

Demo app, release build, 10 cold launches each, 8 s on the movie page, then Play. `serve.mjs --latency 600`: every VMAP and VAST answer takes 600 ms, as from a real ad server (the media files are not delayed). Time from the app's `[demo] play` log line to the ad's `impression`, by the device clock. The system log dropped the impression line in 7 of 20 runs (FL-02); there the impression pixel's arrival on the server is used, shifted by the median device-minus-server offset of the other runs (−342 ms; spread ±0.4 s).

| | Median | Min | Max |
|---|---|---|---|
| Without preload (VMAP + VAST after Play) | 2418 ms | 1989 ms | 3092 ms |
| With `preloadVegaAds` on the movie page | 1684 ms | 925 ms | 3093 ms |
| Runs with both log lines only (4 and 9 runs) | 2866 ms → 1804 ms | | |

The preload saves about 0.7 s at the median here; the rest is creating the ad player and buffering the first frame on a cold launch, which varies by more than a second from run to run. With a faster ad server the saving is smaller (on the LAN without added latency it is within the noise).

## Gate runs: full demo, cold launches, and no seek after a break (11.10.2026)

`gate-run.sh` (kept outside the repo): cold launch, 8 s on the movie page, Play, the pre-roll plays out, seek to ~2:05, "Ad in N", the mid-roll pod plays out, then two screenshots 2 s apart must differ and two seeks 6 s apart must be ≥ 13 s apart. Ads are judged by the server's pixel log, the movie by the app's `[demo] content` lines and the screenshots, because the system log drops lines (FL-02).

| Build | Runs | Result |
|---|---|---|
| Before: the content was always seeked back after a break | 3 cold | ads and movie played in all 3 (pixels; positions 7 → 124 s; pause at 140 s). Log showed `seeked 0.0` right after every pre-roll: a seek of a player that had never played |
| After: seek back only when the content moved more than 0.25 s after `pause()` | 3 + 3 cold | 6/6 PASS. No `seeked 0.0`; after the mid-roll the movie went on from 140.1–140.3 s without a seek; frames differ (mean difference ~50) |

The content plays on for 0.1–0.2 s after `pause()` on this device, so the viewer misses at most a quarter second at a break. The rare stop at 0:00 after the pre-roll (1 of 6 earlier) was not seen in these 6 runs; the unneeded seek of a never-played player is a likely cause, not a proven one.

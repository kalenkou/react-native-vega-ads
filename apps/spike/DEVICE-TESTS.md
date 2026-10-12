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

## No repeated ad in a pod (11.10.2026)

`gate-run.sh` with the mid-roll pod that repeats the pre-roll's Kettlo, as when two ad sources sell the same creative.

| Runs | Result |
|---|---|
| 2 cold | 2/2 PASS. Impressions: Kettlo (pre-roll), Brewnord, Voltaro. The repeated Kettlo was left out and its `notUsed` pixel arrived; the movie played on after the pod (frames differ, mean difference ~49) |

## Pause ad (12.10.2026)

`pause-run.sh` (kept outside the repo): cold launch, Play, the pre-roll plays out, the play/pause key pauses the movie; after the pause ad shows, Back, then the play/pause key again. The ad is the 600×600 Brewnord card with a QR code from `vast/pause.xml`.

| Build | Result |
|---|---|
| First layout | PASS for behaviour: `pause.xml` prefetched at start, `impression` and `creativeView` at the pause (1.5 s delay), `overlayViewDuration` and `close` on Back (6.4 s later); the app stayed on the player and the movie resumed (frames differ). But the QR code and the hint covered the app's controls |
| QR beside the card, `pauseAdStyle={{top: 100, bottom: 220}}` | PASS, same pixels; the card and QR code stay between the title and the controls |

Not checked yet: the pause ad with VoiceView on (the announcement), and Back while the image is still loading.

## Household memory: no repeat across launches (12.10.2026)

`memory-run.sh` (kept outside the repo): launch 1 installs the demo with `vega run-app` and plays the pre-roll; launch 2 is a cold start of the same install with `vlcm launch-app`. The pre-roll VAST is a buffet: Kettlo, Ferntop standing by. The demo keeps shown creatives in `@amazon-devices/react-native-async-storage__async-storage` (`avoidRepeats.memory`).

| Run | Launch 1 | Launch 2 |
|---|---|---|
| 1 | Kettlo: impression, complete | Kettlo `notUsed`, then Ferntop: impression, complete |
| 2 (a minute later) | Kettlo again: impression, complete | the same as run 1 |

So AsyncStorage works on Vega OS 1.2 from React Native, the memory survives a cold start, and `vega run-app` (a reinstall) clears it. Gate runs, which reinstall each time, stay alike.

## Loudness guard: an ad louder than the movie is turned down (12.10.2026)

The movie is brought to -23.7 LUFS and the ads to -16 LUFS by `tools/demo-ads/get_media.sh`; each ad's VAST carries its loudness (`loudness` creative extension); the demo passes `contentLoudness={-23.7}`. `loud-run.sh` (kept outside the repo): install, Play, the pre-roll plays out; the whole system log of the app is kept.

| Runs | Result |
|---|---|
| 4 | The pre-roll played to `complete` every time. The media pipeline logged `MPB UNF callback: setVolume success volume 0.412000` and the GStreamer audio sink `Setting volume` before the first frame: 0.412 is -7.7 dB, the difference between the ad and the movie. The JS line `[ads] loudness:-7.7` never reached the system log, like other lines in FL-02 |

Not checked yet: by ear, that the ad sounds as loud as the movie and the movie is not turned down after the break.

## Break context: a blocked category is left out (12.10.2026)

`serve.mjs --context` with a hand-written context for the first mid-roll (2:19.9): signal `vehicle crash`, `BlockedAdCategories` 1551 1571. The pod is Brewnord (1133), Voltaro (1571) and Kettlo (1524). `category-run.sh` (kept outside the repo): install, Play, wait for the first mid-roll.

| Run | Result |
|---|---|
| 1 | PASS: at the mid-roll the player fetched `pod.xml`, sent Voltaro's error pixel with `code=205` within 80 ms and never an impression for it; Kettlo got `notUsed` (seen in the pre-roll); Brewnord played to `complete` and the movie went on |

The context in this test is written by hand. The model did not block anything at these two breaks of Tears of Steel; see `tools/make-vmap/eval/` for what it finds.

## Cold launch KPI: demo and Amazon's template (12.10.2026)

`vega exec perf kpi-visualizer --kpi cool-start-latency` on the release build of the demo (`--certification`, 30 launches), then the same tool on a fresh app from Amazon's `helloWorld` React Native template (9 usable launches of 10; the tool dropped one for a trace error). Amazon's targets for a cold start: first frame under 1.5 s, fully drawn under 8 s.

| App | Launch → first frame | Launch → fully drawn |
|---|---|---|
| Demo (n = 29) | min 1194 ms, mean 2393 ms, max 4244 ms, P90 3354 ms | mean 2398 ms, P90 3355 ms |
| Amazon template (n = 9) | min 1217 ms, mean 2068 ms, max 3306 ms | no marker in the template |

The first-frame target is not met on this stick even by the empty template. The demo adds about 0.3 s to the mean, inside the spread (stdev 800 ms and 913 ms). The fully drawn target is met. JS bundle load: mean 103 ms.

## Second title, with the model's own break context (12.10.2026)

Sintel (H.264 High, 1280×544, -23.0 LUFS after `get_media.sh`) is the second title. make-vmap `--local` with whisper.cpp and Qwen2.5-VL-7B picked two mid-rolls, 2:42.1 and 9:03.1. At 2:42 the model reported `weapons` ("carrying a sword") and `injury` (a line about the girl's blood), so the rules block 1248, 1343 and 1524. `serve.mjs --sintel-context` serves that context unchanged. `sintel-run.sh` (kept outside the repo): install, Right + Enter on the details screen, Left + Enter, wait for the mid-roll.

| Run | Result |
|---|---|
| 1 | PASS: "Next: Sintel" switched the details screen (poster, text, credit) and kept the focus on the button; the app preloaded `vmap/sintel.xml`. Sintel played with its own pre-roll. At 2:42 Kettlo (1524, Sporting Goods) got the error pixel with `code=205` and no impression; Brewnord, then Voltaro played |

## Amazon "test before submission": Home, Back, another app (12.10.2026)

Scenarios 1–3 of Amazon's list, run during the pre-roll where we could. `home-run.sh` and `lifecycle-run.sh` (kept outside the repo); the key is sent with `inputd-cli`. `KEY_HOME` does nothing on the stick (no key mapping, the app stays on screen); `KEY_HOMEPAGE` is the Home button.

| Scenario | Result |
|---|---|
| Home 2.5 s into the pre-roll | PASS: the system sent `BACKGROUND`; 50 ms later the media element was destroyed. No pixel after `firstQuartile`: no midpoint, no complete for an ad nobody watched. The process was gone before the relaunch; the relaunch was a cold start on the details screen |
| Back 2 s into the pre-roll | As designed (R23): the ad player is released and the movie is on screen, no pixel after `firstQuartile`. A second Back closes the player; a third leaves the app. Relaunch: details screen |
| Another app (Amazon's template) during the movie, then the demo | PASS: the demo came back with a cold start, no error. The switch came after the pre-roll had ended, not during it: the script waited for an ad that the household memory had replaced |

`vlcm crash-history` on the stick lists one entry for the demo in two days of tests: `AppNotResponding`, reason "Lifecycle Callback", during a LAUNCH transition on 11.10 at 22:04 UTC. Not seen again; we do not know which run caused it.

Not run (need a person or other hardware): HDMI unplugged for 5 minutes, TV input change, restart of the device, screensaver, Bluetooth audio. Alexa during ads passed on 11.10 (see above).

## Why line on ads (12.10.2026)

Demo with `showWhy`, Sintel with the model's own context for the first mid-roll (2:42): signals weapons and injury, blocked 1248 1343 1524. `why-run.sh` (kept outside the repo) takes a screenshot 2 s after Brewnord starts.

| Check | Result |
|---|---|
| Pixels | PASS: Kettlo `error code=205` when the pod loads; Brewnord, then Voltaro play |
| Line under the label | PASS: "No Kettlo ad after a scene with weapons and injury · Volume matched to the movie" |

## Ad plan before Play (12.10.2026)

Details screen of Tears of Steel with `useAdPlan`: "Ads: 4 ad breaks · first: 1 ad, 10 s, skippable after 5 s". It comes from the preloaded VMAP and pre-roll VAST, so the pre-roll after Play needs no new request.

## Compare: ads as usual (12.10.2026)

Demo, Tears of Steel, the "Compare: ads as usual" button (`vmap/classic.xml`). `classic-run.sh` (kept outside the repo) presses Right and Select, takes screenshots and reads the pixels.

| Check | Result |
|---|---|
| Schedule | PASS: Kettlo pre-roll; the movie pauses at 32.2 s, in the middle of the line "...that you're freaked out by my robot hand?" |
| Repeats | PASS: the mid-roll plays Kettlo again, then Brewnord ("Ad 1 of 2"): no repeat rule in this mode |
| Screen | PASS: "Ads as usual · for comparison" over the movie and over the ads; no "Ad in 5" and no why line. First build: the badge was under the ad surfaces (zIndex 2–3), fixed with zIndex 6 |

Loudness was not measured in this run: without `contentLoudness` the ads play at their own level.

## Watch report after the movie (12.10.2026)

Demo, Tears of Steel, played up to the end of the first mid-roll, then Back. The app passes the `onEvent` names of the watch to `watchReport` and shows the line on the details screen. `watch-run.sh` (kept outside the repo).

| Mode | Line on the details screen |
|---|---|
| Play (vega-ads) | "Last watch: 3 ads · 1 repeat left out · 3 ads turned down, up to 8 dB" |
| Compare: ads as usual | "Last watch, ads as usual: 3 ads · none left out or turned down" |
| Play, Back 3 s into Brewnord, Voltaro prebuffered | "Last watch: 2 ads · 1 repeat left out · 2 ads turned down, up to 8 dB" |

The first build sent `loudness:<dB>` when an ad's file was loaded: in the Play run the log shows it for the prebuffered Voltaro before Voltaro started. Now it follows the ad's `impression`, so in the Back run the prebuffered Voltaro, never seen, is not counted. We did not run the first build with Back.

The lines match the pixels: 3 impressions in the first two runs, 2 in the Back run; in Play mode the pod's Kettlo got `notUsed` (seen in the pre-roll). The device log (`loggingctl`) lost some `[ads]` lines in this run; the report counts in the app, so it does not depend on the log.

## Package validation before Appstore submission (12.10.2026)

`vega exec vpt validate` on the three release packages of the demo (armv7, aarch64, x86_64), with the strict ABI check that Amazon requires before submission ([docs](https://developer.amazon.com/docs/vega/0.24/abi-check)).

| Build | Result |
|---|---|
| `build-vega --build-type Release` | FAIL on all three: "build_number must be greater than 0, found: 0" |
| `--build-number 1` (now in `npm run build:release`) | PASS on all three: manifest valid, 0 errors. Info only: no app icon, the system default is used |

The Appstore wants a higher build number for each upload; raise it before a real submission.

# Friction log

Platform issues found while building vega-ads on a Fire TV Stick 4K Select (Vega OS 2.0). Each entry has the task, steps, expected and actual results, severity, workaround and a suggestion.

## FL-01 · Sample video URL used across docs returns 403 (2026-10-11)
- **Task:** play a long public MP4 as content in a w3cmedia `VideoPlayer` on Fire TV Stick 4K Select (Vega OS 2.0).
- **Steps:** `player.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'` (a Google sample bucket used in many player samples. In Amazon's `AmazonAppDev/vega-sports-app` it appears only as a commented-out option).
- **Expected:** playback, or a JS `error` with a readable reason.
- **Actual:** black screen. JS got `error` with `code = 4` and an empty `message`. The real cause (`souphttpsrc ... Forbidden (403)`) was visible only in the system log at warning level.
- **Severity:** medium (looks like a player or surface bug. Cost ~30 min).
- **Workaround:** switched to an archive.org MP4. Checked URLs from the Mac with `curl -r 0-1000` first.
- **Suggestion:** pass the HTTP status into `MediaError.message` (for example "HTTP 403 Forbidden") so the app can show and report the real cause.

## FL-02 · System log silently drops app `console.log` lines (2026-10-11)
- **Task:** read the app's own `console.log` diagnostics through `vega exec vda shell loggingctl log -f` during video playback.
- **Steps:** log ~5 lines per ad break while two w3cmedia players run.
- **Expected:** all app lines in the log.
- **Actual:** many app lines missing. The log shows `Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`. Most of the 300 lines/s come from the media pipeline (GStreamer/W3CMEDIA info logs) inside the same process, so the app's own lines lose the budget.
- **Severity:** medium (wrong conclusions during debugging: "event never fired").
- **Workaround:** mirrored the log on screen in the app. Filtered `[SPIKE]` lines.
- **Suggestion:** separate budgets for JS console and native media logs, or lower media pipeline info logs in production-like builds. Document the limit next to `loggingctl`.

## FL-03 · Media controls with two w3cmedia players fail silently unless two separate steps are both done (2026-10-11)
- **Task:** make remote play/pause and "Alexa, pause" control the player the viewer sees (content → ad → content) in a client-side ad insertion (CSAI) app with two w3cmedia players, Fire TV Stick 4K Select, Vega OS 2.0, `@amazon-devices/react-native-w3cmedia` ~2.1.
- **Steps:** A/B test on the device, one change at a time. Keys injected with `inputd-cli button_press KEY_PLAYPAUSE` (once during content, once during the ad). Result = count of `MediaControlHandler: performing handleTogglePlayPause` in the system log.
  - A. `player.setMediaControlFocus(componentInstance)` on every switch, no manifest entry → 0 commands delivered.
  - B. Manifest `[[extras]] key = "interface.provider"` + `interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"`, no `setMediaControlFocus` → 0.
  - C. Both → commands delivered. During content the content pauses/resumes. During the ad only the ad pauses/resumes. "Alexa, pause" works.
  - D. Neither → 0.
- **Expected:** the CSAI guide for Vega covers media controls for the two-player pattern, or the runtime warns when one of the two steps is missing.
- **Actual:** the CSAI JS guide (implement-csai-js-vega, last modified 2026-03-13) does not mention media controls, `setMediaControlFocus`, Alexa or the manifest entry. The W3C Media "media control" page (last modified 2026-01-27) does say to add manifest entries and call `setMediaControlFocus`, but the manifest snippet is on another page, and in the type definitions `setMediaControlFocus` is marked `@hidden`. With one step missing there is no error or warning. The only hint is `isSessionInForeground :0` in the system log. The remote key reaches the app (`KEY_PLAYPAUSE` in inputd) and is dropped.
- **Severity:** high for ad-supported apps (a basic remote/voice feature silently does nothing. Dolby's patch of the Logix IMA ads manager also fixes "media-control ownership").
- **Workaround:** both steps (variant C). Call `setMediaControlFocus` on the ad player at ad start and on the content player at resume. Focus switch takes 197-217 ms.
- **Suggestion:** add a "media controls with two players" section to the CSAI guide, with the manifest snippet. Remove `@hidden` from `setMediaControlFocus` in typings. Log a warning when `setMediaControlFocus` is called and the manifest has no `IMediaPlaybackServer` (and vice versa).

## FL-04 · Media control docs sample uses a deprecated API (2026-10-11)
- **Task:** get the `IComponentInstance` that `setMediaControlFocus` needs.
- **Steps:** followed the W3C Media "media control" page, which uses `useComponentInstance()`.
- **Expected:** the docs sample uses the current API.
- **Actual:** at run time `useComponentInstance` warns: "deprecated. Update to use getComponentInstance from KeplerAppStateManager instead". The replacement (`useKeplerAppStateManager().getComponentInstance()`) was found only in `.d.ts` files.
- **Severity:** low.
- **Workaround:** `useKeplerAppStateManager().getComponentInstance()`.
- **Suggestion:** update the media control page and samples to the non-deprecated API.

## FL-05 · A video surface turns empty after `ended`. Content shows through between two ads (2026-10-11)
- **Task:** play two ads back to back (pod) on two w3cmedia players with two `KeplerVideoSurfaceView`s above the content surface, as the CSAI guide suggests for "seamless back-to-back ad playback".
- **Steps:** ad 1 on surface A. Ad 2 prebuffered on surface B (`autoplay=false`, `canplay`). On ad 1 `ended` call `play()` on ad 2 and bring surface B on top when ad 2 fires `playing`.
- **Expected:** ad 1's last frame stays on screen until ad 2 renders (like a paused player keeps its frame).
- **Actual:** phone video, frame by frame: after `ended` surface A is empty and the paused content frame below is visible for ~0.4-0.6 s (time from `play()` to `playing` of a prebuffered player: ~370-450 ms).
- **Severity:** medium (viewer sees the show flash in the middle of an ad pod).
- **Workaround:** start the next ad ~500 ms before the current one ends and let the current one finish hidden. Measured: next first frame 85 ms before the previous `ended`, `complete` still accurate.
- **Suggestion:** document in the CSAI guide that a surface does not keep the last frame after `ended`, and give the typical `play()` → first frame latency of a prebuffered player. Or add an option to keep the last frame.

## FL-06 · Play/pause key reaches both media controls and JS key handlers (2026-10-11)
- **Task:** decide whether an app (or an ad library) should handle the remote play/pause key itself or rely on Vega Media Controls, Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** `useTVEventHandler` logger. `inputd-cli button_press KEY_PLAYPAUSE`. Builds with and without the manifest media-controls entries. During content and during an ad.
- **Expected:** one owner per key press: either media controls consume it, or it reaches JS (like Android `onKeyDown` returning true), and docs say which.
- **Actual:** the key always reaches JS (`eventType: 'playpause'`, down and up). With the manifest entries, media controls also pause the focused player (224 ms after key down). Apps that already map `playpause` in their own remote handler (common with spatial navigation libraries) toggle twice. Without the entries, media controls do nothing and only the JS handler works, so "Alexa, pause" is lost.
- **Severity:** medium (double toggle or silent loss of voice control, depending on setup).
- **Workaround:** keep the manifest entries and media controls. Ignore `playpause` in the app's own key handler while media controls own the player (for ads: while the ad break is playing).
- **Suggestion:** document the routing (key event and media control command both fire), or add a way to mark the key as consumed by media controls.

## FL-07 · Without media controls entries, a legacy player session still pauses the player on play/pause (2026-10-11)
- **Task:** let an app own the remote play/pause key (spatial navigation remote handler) without the media controls manifest entries, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** manifest without `com.amazon.category.kepler.media` / `IMediaPlaybackServer`. No `setMediaControlFocus` call. App toggles the player on `useTVEventHandler` `playpause` key down. Live log with `loggingctl log -f`.
- **Expected:** with no media controls declared, the key goes only to the app.
- **Actual:** the key reaches JS, and then inputd's MediaController also handles it when the player session is in foreground: "isSessionInForeground :1", then w3cmedia "Player Session is performing pause operation on Media Player". A paused player is not resumed by the system (session not in foreground), so the app's resume is undone ~450 ms later. The viewer sees play start and stop.
- **Severity:** high for apps with their own remote handling (looks like a broken resume).
- **Workaround:** use the manifest entries and media controls as the only owner of play/pause. Ignore `playpause` in the app's own key handler while media controls own the player.
- **Suggestion:** document the legacy player session behaviour (which keys, when it acts) next to the media controls docs, or a way to opt out of it. Log which component consumed the key.

## FL-08 · w3cmedia refuses http:// media. The cleartext manifest policy is documented only for WebView (2026-10-11)
- **Task:** play VAST ad media files and a content movie served over plain HTTP on the local network (typical for development, and many ad servers still return `http://` MediaFile URLs), Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `fetch` the VMAP/VAST over `http://<LAN IP>:8080/` (works). Set `player.src = 'http://<LAN IP>:8080/ad.mp4'`. Read `loggingctl log -f -o cat`.
- **Expected:** playback, or a documented rule that media must use HTTPS, with a clear `MediaError` message.
- **Actual:** `MEDIA_PLAYERV2: MediaUrlSourceImpl.cpp(58) createSourceElement Invalid or insecure URI scheme`, `Could not build sourceBin`. JS only gets a generic error, so the ad fails with VAST error 400 and the content stays black. `fetch` to the same host works. Adding `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` to the manifest makes w3cmedia play it (IP address accepted). The docs describe this section only on the WebView page ("Build Web Apps with WebView", 0.24). The public AmazonAppDev/vega-video-sample has four `http://` `videoUrl` entries (`src/data/rotatorData.json`) and no cleartext section in its manifest (I did not play those entries).
- **Severity:** medium (silent black screen. Hard to find without the system log. Ad libraries cannot tell "insecure URL" from "broken file").
- **Workaround:** HTTPS for all media. For development, the cleartext allow-list in the app manifest.
- **Suggestion:** document `network-traffic-policy` as an app-wide policy (fetch vs media vs WebView), and put the reason ("cleartext not allowed") into `MediaError.message`.

## FL-09 · setMediaControlFocus blocks the JS thread for 1-2 s on a cold launch (2026-10-11)
- **Task:** start a pre-roll right after app launch and send the impression on the first frame, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `player.play()`, then at once `player.setMediaControlFocus(componentInstance)` (so the remote and Alexa control the ad). The impression is sent from the `playing` listener. `loggingctl log -f -o cat`.
- **Expected:** `setMediaControlFocus` returns a promise and does not hold the JS thread. `playing` reaches JS a few ms after the native event.
- **Actual:** native `playing` at 21.33 s. JS logs from the media controls setup ("Manifest was parsed", then a 1.2 s gap, then `MediaControlStateUtil` and many `addEventListener` lines). `playing` reached JS at 23.74 s. The impression and `start` pixels were 2.4 s late on the first launch after install (0.5 s on the next launch), and `firstQuartile` came 0.3 s after `start`. With a 5 s first-frame timeout this can also drop the pre-roll.
- **Severity:** medium (wrong ad measurement on cold start. Possible lost pre-roll).
- **Workaround:** call `setMediaControlFocus` after the first frame is handled (deferred with `setTimeout(0)`). Measured after the change: 143 ms from native `playing` to the impression.
- **Suggestion:** do the media controls setup off the JS thread, or document that the first call is slow and should not be made on a time-critical path.

## FL-10 · "Alexa, next" never reaches the app during an ad, even with "Next" in command_options (2026-10-11)
- **Task:** let the viewer skip a skippable ad by voice, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** manifest `IMediaPlaybackServer` with `command_options = ["Next"]` (the "Attributes and features" page says optional commands arrive only when listed). A `KeplerMediaControlHandler` subclass for the ad player with `handleNext` overridden. The ad player's published actions set to PLAY, PAUSE, TOGGLE_PLAY_PAUSE, STOP, NEXT before `setMediaControlFocus` (w3cmedia publishes SEEK, FAST_FORWARD, SKIP_FORWARD... but not NEXT by default). During a skippable ad, past its skip offset, say "Alexa, next" and "Alexa, skip". Every app event mirrored to a server log because the device log drops app lines.
- **Expected:** `handleNext` is called, or a documented reason why not. A table of Alexa phrases → media control commands.
- **Actual:** with the default actions Alexa answers "Next is not supported". With NEXT published, Alexa says nothing. `handleNext` is never called (no app event in four runs). No Vega page maps Alexa phrases to commands.
- **Severity:** medium (voice skip of skippable ads is not possible. "multi-modal" ad UX limited to pause/play).
- **Workaround:** Skip button with D-pad focus. "Alexa, pause/play" works.
- **Suggestion:** publish the Alexa phrase → command table for Vega. Deliver Next when listed in `command_options`. Let apps set supported actions through a public API (today only `mediaControlStateUtil.capabilities`, an undocumented field).

## FL-11 · Video freezes during an Alexa voice interaction without any media event (2026-10-11)
- **Task:** keep an ad playing correctly while the viewer talks to Alexa, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** during an ad, say "Alexa, next" (or any request). Watch the ad's `timeupdate`, `pause`, `playing`, `waiting` events and its tracking pixels.
- **Expected:** a `pause` (or an audio focus / interruption event) when the system takes over, and `playing` when it gives the player back.
- **Actual:** the ad stops advancing for 6-13 s (quartile pixels 6 s and 16 s apart instead of 2.5 s) with no `pause`, `waiting` or `playing` event. An app cannot tell this from a stalled stream: our 10 s stall watchdog ended one ad with VAST error 405 after a voice request. Also, "Alexa, pause" on the content then reaches the media controls handler, but the player sends no `pause` event: it was already frozen, so its state does not change. Anything that waits for `pause` (a pause ad, an analytics event) misses a voice pause.
- **Severity:** medium (ads cut short after a voice request. Wrong error reporting to ad servers).
- **Workaround:** two stall timeouts: 10 s after a `waiting` event (real buffering), 30 s when the time stops with no event at all (voice request). For pause ads we listen to the pause command in the content's media controls handler, not only to the `pause` event.
- **Suggestion:** emit `pause`/`playing` (or a documented interruption event) when Alexa takes and returns the media session.

## FL-12 · The video sample's DRM title never asks for the hardware-secure path (2026-10-11)
- **Task:** use Amazon's Vega video sample as a reference for DRM playback next to a clear ad player.
- **Steps:** read how the sample's Shaka player picks the Widevine robustness for a title marked secure (`src/w3cmedia/shakaplayer/ShakaPlayer.ts`, line 418), and how titles are marked (`src/types/VideoSource.ts` line 31, `src/data/local/premiumCollection.ts` line 51).
- **Expected:** a title with `secure: true` gets the hardware-secure robustness.
- **Actual:** the player compares `content.secure` with the string `'true'`, but the type and the data use the boolean `true`. The comparison is always false, so the sample's DRM title runs with the software robustness. The docs for the sample describe `secure` as the string `"true"`. Found by reading the code. Not confirmed in a device log.
- **Severity:** medium (a developer who copies the sample believes they test the secure path, and does not).
- **Workaround:** none in `react-native-vega-ads` (it does not use the sample's player). An app should check the robustness it really gets.
- **Suggestion:** compare with the boolean, or accept both, and make the docs and the type agree.

## FL-13 · Vega Virtual Device: the documented media keys differ from the SDK's keyboard mapping (2026-10-11)
- **Task:** test remote play/pause and seek of an ad on the Vega Virtual Device with the Mac keyboard.
- **Steps:** compare the media keys listed on https://developer.amazon.com/docs/vega/0.24/run-apps.html (F3 rewind, F4 play/pause, F5 fast forward) with the mapping in SDK 0.24.12112 `vvd/images/tv/vmtools/scripts/vvrp_agent_run.sh`, lines 66-76.
- **Expected:** the same keys in both.
- **Actual:** the script maps F2 to volume down, F3 to volume up, F4 to menu, F5 to previous, F6 to rewind, F7 to play/pause, F8 to fast forward and F9 to next. Following the docs, F4 opens the menu instead of pausing.
- **Severity:** low (lost time. A tester may think media controls do not work on the virtual device).
- **Workaround:** use the script's keys, or `inputd-cli button_press KEY_PLAYPAUSE` over `vega exec vda`.
- **Suggestion:** generate the docs table from the mapping, or fix one of them.

## FL-14 · No table of Alexa phrases to media controls commands for Vega (2026-10-11)
- **Task:** decide which Alexa phrases an ad player must handle (for example "skip" during an ad) through Vega media controls.
- **Steps:** search the Vega 0.21-0.24 docs for which phrase reaches which `IMediaPlaybackServer` command.
- **Expected:** a table such as phrase → command (`handlePlay`, `handlePause`, `handleNext`, `handleSkipForward`...), with locales.
- **Actual:** no such table for Vega. The only one is for Fire TV on Android (Video Skills Kit, 2021), where "skip" leads to Next in some locales. On Vega, "Alexa, next" and "Alexa, skip" did not reach `handleNext` during an ad (FL-10), and the docs do not say whether that is expected.
- **Severity:** medium (voice is a main input on Fire TV. Developers have to guess and test phrase by phrase).
- **Workaround:** support the remote keys only, and say so (as `react-native-vega-ads` does).
- **Suggestion:** publish the phrase → command table for Vega, and which commands are delivered while a second player (an ad) has media controls focus.

## FL-15 · With the TV off, the screenshot tool hangs or writes an empty file, without an error (2026-10-12)
- **Task:** run a scripted test on a Fire TV Stick 4K Select at night, judged by screenshots and the app's network requests.
- **Steps:** with the TV (HDMI sink) switched off, `vega run-app` the app, press keys with `inputd-cli`, then `gwsi-tool-screenshooter /tmp/a.png` over `vega exec vda`.
- **Expected:** an error that no display is connected, or a black frame.
- **Actual:** the app sent no network request after launch. One `gwsi-tool-screenshooter` call did not return for more than 4 minutes. A later call returned at once and wrote a 0-byte file. No message in either case. With the TV on, the same script passed.
- **Severity:** low (lost time. A test looks like an app bug).
- **Workaround:** keep the TV on and awake during scripted runs. Put a timeout on every `vega exec vda` call. Treat a 0-byte screenshot as "no display".
- **Suggestion:** make the screenshot tool fail with a clear message when no display is active.

## FL-16 · Amazon's automated device testing does not take Vega packages (2026-10-12)
- **Task:** get the same evidence other Fire TV apps can show: Amazon installs, launches and measures the app on its own devices.
- **Steps:** read the Appstore Quality Central and Live Device Interaction docs. Search the developer forum.
- **Expected:** a way to run a `.vpkg` on Amazon-hosted Fire TV Stick 4K Select devices.
- **Actual:** both services take Fire OS APKs only. An Amazon reply on the forum (https://community.amazondeveloper.com/t/can-t-we-test-vega-apps-on-appstore-quality-center/28258): "There is no VPKG/Vega OS support at this time". The Fire TV Stick 4K Select is not in Live Device Interaction.
- **Severity:** medium (a Vega developer without a stick cannot check the app on hardware before submitting. The docs say "you must test your app on a Fire TV Stick before submitting").
- **Workaround:** test on our own stick against the Vega KPI targets with `vega exec perf kpi-visualizer --certification` and the list in "Test before submission".
- **Suggestion:** add Vega devices to Appstore Quality Central and Live Device Interaction.

## FL-17 · A default release build fails `vpt validate` (build number 0) (2026-10-12)
- **Task:** check the demo app's three packages (`armv7`, `aarch64`, `x86_64`) with the strict package validation that the Appstore runs, Vega SDK 0.24.
- **Steps:** `react-native build-vega --build-type Release` as generated by the project template, then `vega exec vpt validate` on each `.vpkg`.
- **Expected:** a package built by the default release script passes validation, or the build warns about a missing build number.
- **Actual:** all three failed with "build_number must be greater than 0, found: 0". The build itself gave no warning.
- **Severity:** low (found before submission. Would block an upload).
- **Workaround:** `--build-number 1` in the `build:release` script. All three then pass with 0 errors (info only: no app icon).
- **Suggestion:** start the template's build number at 1, or make `build-vega --build-type Release` warn when it is 0.

## FL-18 · The media controls manifest check gives different answers for the same manifest (2026-10-11)
- **Task:** make remote and Alexa play/pause reach our players, Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** launch the same build with the same `manifest.toml` 13 times. Read `checkClientManifestForKMC: ... has KMC:` in the system log.
- **Expected:** the same answer each time.
- **Actual:** `true` 9 times, `false` 4 times, with no reason logged.
- **Severity:** unclear. If `false` turns media controls off, remote and voice stop working without any error.
- **Workaround:** none. We look for this line when a media control test fails.
- **Suggestion:** log why the check returns `false`, and document what it reads.

## FL-19 · A video surface created later is drawn on top, whatever its zIndex (2026-10-15)
- **Task:** add client-side ads to an existing Vega player screen (Amazon's `react-native-multi-tv-app-sample`) on a Fire TV Stick 4K Select, Vega OS 2.0: two ad `KeplerVideoSurfaceView`s above the app's content `KeplerVideoSurfaceView`.
- **Steps:** content surface at `zIndex: 0`. Ad surfaces in an absolute overlay at `zIndex: 3` (inner 2 and 3). The ad overlay mounts at once. The screen mounts its content surface only after `loadedmetadata`, so the ad surfaces are created first (handles 1 and 2, content 3).
- **Expected:** the ad video above the content surface, as the zIndex says. Amazon's CSAI guide (docs 0.24, "Dual surface") says: "The ad surface overlays the main content surface using `zIndex` positioning." Its example mounts both surfaces together, content first, so the order hides the problem.
- **Actual:** during the pre-roll the screen was black: the ad played (all quartile events, the countdown in the UI overlay counted down), but its picture was hidden. Mounting the ad overlay only after the content surface's `onSurfaceViewCreated` made the ad visible. Black in 2 of 2 runs before the change, visible in 5 of 5 after. No warning in the log.
- **Severity:** medium (looks like a broken ad or network. An ad that is paid for is not seen).
- **Workaround:** create the ad surfaces after the content surface (`AdSurfaceLayers` docs now say so).
- **Suggestion:** document how video surfaces are ordered (creation order, not zIndex), or apply zIndex to video surfaces.

## FL-20 · The launch tool reports "fully drawn" for an app that never reports it (2026-10-16)
- **Task:** measure the demo's cold launch on a Fire TV Stick 4K Select, Vega OS 2.0, with `vega exec perf kpi-visualizer --kpi cool-start-latency --certification` (Perf CLI 0.24.0), then follow Amazon's slow-launch workflow.
- **Steps:** run 30 cold launches of an app that does not call `useReportFullyDrawn()` (no `@amazon-devices/kepler-performance-api` in the app). Read the report, then the Perfetto trace of an iteration.
- **Expected:** no "fully drawn" value, or a clear note that the marker is missing. Amazon's TTFD workflow says: "If TTFD KPI values are null/undefined, this indicates missing or incorrect `useReportFullyDrawn()` API usage."
- **Actual:** the report showed "Application launch to fully drawn" for 29 of 30 launches, marked statistically sound (√), almost equal to first frame (mean 2398.2 ms vs 2393.4 ms, max 4243.8 ms vs 4243.7 ms). In the two traces we read, a `fully_drawn` slice from the `stem-init` process comes 67-87 ms before the app's `gwsi_firstFrame`, although the app never asked for one. After we added the hook, the trace has two `fully_drawn` slices per launch. The tool reported fully drawn at mean 2129 ms, P90 2494 ms.
- **Severity:** low (a developer can believe the TTFD KPI is met and implemented, and the TTFD workflow's own check for a missing marker never fires).
- **Workaround:** check the app code for `useReportFullyDrawn()` instead of trusting a non-empty TTFD value.
- **Suggestion:** report TTFD as missing when the app did not emit the marker, or document which component emits the automatic `fully_drawn` and when.

## FL-21 · w3cmedia events differ from HTML5 in four places, without a note in the docs (2026-10-11, again 2026-10-17)
- **Task:** play MP4 by URL with `VideoPlayer` from `@amazon-devices/react-native-w3cmedia` 2.3.2 (React Native 0.83 template) on a Fire TV Stick 4K Select, and map its events to a player API written for HTML5 (react-native-video v7's web backend does this for `<video>`).
- **Steps:** log every media event with `currentTime`, `readyState` and `paused`. `src` → `play()`. `currentTime = 40` after 5 s. Let the video play to its end.
- **Expected:** HTML5 order and values, as the docs describe the player as an HTMLMediaElement: one `loadstart` per source. `durationchange` after `loadedmetadata`. `seeked` with `currentTime` at the new position. After `ended`, `paused === true`.
- **Actual:** `loadstart` came twice (at `src`, `readyState` 0, and again after the metadata, `readyState` 3). `durationchange` came before `loadedmetadata`. At `seeked` `currentTime` was 5.31-5.32 although the seek went to 40 (the picture from 40 followed ~0.6 s later). After `ended` there was no `pause` event, `paused` stayed `false` and `readyState` stayed 2. Same in 2 runs on 11.10 and 5 runs on 17.10.
- **Severity:** medium (a player built on HTML5 semantics reports a double load, a wrong seek position and "still playing" at the end).
- **Workaround:** react-native-video's Vega backend sends `onLoadStart` once per source, `onLoad` after the metadata, `onSeek` with the seek target, and keeps its own "ended" flag.
- **Suggestion:** fix these four to match HTML5, or list the differences on the w3cmedia API page.

## FL-22 · w3cmedia in URL mode never reports the video size (2026-10-17)
- **Task:** fill `onLoad` (width and height) for react-native-video v7 on Vega, from w3cmedia `VideoPlayer` 2.3.2, Fire TV Stick 4K Select, MP4 720p by URL.
- **Steps:** read `videoWidth` and `videoHeight` at `loadedmetadata`, at `loadeddata` (`readyState` 3), and during playback at 5 s and 43 s.
- **Expected:** 1280×720 from `loadedmetadata` on, as on HTML5.
- **Actual:** 0×0 at every point, in 2 runs, for 2 sources.
- **Severity:** low (apps cannot pick a layout or show the resolution from the player).
- **Workaround:** none in the player. The app must know the size from its catalog.
- **Suggestion:** fill `videoWidth`/`videoHeight` in URL mode, or document that they are MSE-only.

## FL-23 · react-native-video v7 crashes a Vega app at import. The only advice is "remove it" (2026-10-11, again 2026-10-17)
- **Task:** use react-native-video v7 (`7.0.0-beta.12`, the npm `beta` tag) in a Vega app made from the React Native 0.83 template.
- **Steps:** `npm install react-native-video react-native-nitro-modules`, import `useVideoPlayer` and `VideoView`, build, run on the stick.
- **Expected:** a build error or a clear runtime message that the package has no Vega support. Amazon's Vega knowledge base (media playback API, migration notes) says: "`react-native-video` must be removed: It has native Android code (ExoPlayer) that does not work on Vega. There is no compatibility layer."
- **Actual:** the build passes. The app aborts ~1 s after launch (SIGABRT): `react-native-nitro-modules` calls `TurboModuleRegistry.getEnforcing('NitroModules')`. Building its error message fails in React Native for Vega with "__fbBatchedBridgeConfig is not set, cannot invoke native modules".
- **Severity:** medium (the most used React Native video library cannot be tried on Vega, and the crash does not name the cause).
- **Workaround:** a Vega backend for v7 built like its web one (`*.kepler.ts` platform files on w3cmedia), in our fork, to be proposed upstream. It plays MP4 on the stick with the v7 API.
- **Suggestion:** list Nitro-based libraries as unsupported in the Vega compatibility docs, and make `getEnforcing` failures readable.

## FL-24 · Request headers for media work, but the only API for them is hidden (2026-10-17)
- **Task:** play an MP4 that needs a request header (for example a token), with `VideoPlayer` from `@amazon-devices/react-native-w3cmedia` 2.3.2 in URL mode, Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** searched the Vega docs and the w3cmedia API page for headers. Read the package's type files. Called `setSrcWithCustomHeaders(url, { 'X-Rnv7-Test': 'hdr1' })` and logged the request on the server.
- **Expected:** a documented way to send headers with the media request, or a note that it is not supported.
- **Actual:** the docs do not mention headers. `setSrcWithCustomHeaders` exists in 2.3.2, but its type comment is `@hidden`. In 2.1.99 the method does not exist. Called on the stick, it works: the server received `X-Rnv7-Test: hdr1`.
- **Severity:** low (works, but an app cannot know it may rely on it, or from which version).
- **Workaround:** feature-detect the method. Without it, load the URL and warn that headers are not sent.
- **Suggestion:** document `setSrcWithCustomHeaders` with the first w3cmedia version that has it, or say which API to use instead.

## FL-25 · react-native-keyevent is marked Vega-compatible but gets no key events on Vega (2026-10-17)
- **Task:** read remote keys with `react-native-keyevent` 0.3.2, which React Native Directory marks `vegaos: true` and Amazon's Fire TV starter sample lists in its Vega app, on a Fire TV Stick 4K Select (Vega OS 2.0, React Native 0.83).
- **Steps:** `KeyEvent.onKeyDownListener(cb)` and `onKeyUpListener(cb)` in a test screen with a focused button. Pressed Down, Right, Right, Left, Select with `inputd-cli`. Also registered `useTVEventHandler` in the same screen.
- **Expected:** a key event per press, as on Android TV.
- **Actual:** 0 events from react-native-keyevent. `useTVEventHandler` got all 10 (5 presses, down and up). The package listens to `DeviceEventEmitter('onKeyDown')`, which only its Android native module sends. It installs and imports on Vega without an error. Amazon's sample handles the remote with its own `TVEventHandler` code on Vega.
- **Severity:** low (silent: the app runs, the keys just never arrive).
- **Workaround:** `TVEventHandler` directly, or a Vega module for the package (we wrote one: `index.kepler.js` that maps Vega key names to Android key codes. On the stick 10 of 10 events).
- **Suggestion:** in the Directory, mark packages as "installs" vs "works" on Vega, or note that key events need `TVEventHandler`.

## FL-26 · The accessibility settings README imports a default export that the package does not have (2026-10-18)
- **Task:** read the viewer's Closed Captions setting and caption text size in the demo app, to show captions on ads, with `@amazon-devices/kepler-a11y-settings-interface-turbo` 1.0.0 on a Fire TV Stick 4K Select (Vega OS 2.0).
- **Steps:** followed the package README (also on developer.amazon.com, vega-api 0.24): `import KeplerA11ySettingsInterface from '@amazon-devices/kepler-a11y-settings-interface-turbo'`, then `isClosedCaptioningEnabled()` and `getCaptionPreferences()`.
- **Expected:** the README import works.
- **Actual:** `dist/src/index.js` and `index.d.ts` export `KeplerA11ySettingsInterface` only as a named export. There is no default export. TypeScript stops with "has no default export". Plain JavaScript gets `undefined` and fails at the first call. With the named import, `import { KeplerA11ySettingsInterface } from '...'`, it works: on the stick the module auto-links (`Successfully v2 auto-linked libKeplerA11ySettingsInterfaceTurbo.so`) and returns the setting.
- **Severity:** low (found at the first build), but every example in the README has it.
- **Workaround:** the named import. The module also looks itself up with `TurboModuleRegistry.getEnforcing` when it is loaded, so on a device without it the import throws. We load it with `require` inside `try`, and captions stay off there.
- **Suggestion:** fix the README examples (or add a default export), and say which Vega OS versions have the module.

## FL-27 · The headless playback sample service does not compile (2026-10-18)
- **Task:** move ad playback into a headless JS service with "Implement Headless JavaScript Playback" (developer.amazon.com, Vega 0.24), section "Create the headless service file".
- **Steps:** copied the sample service class into a TypeScript project and ran `tsc`.
- **Expected:** the sample compiles.
- **Actual:** `handleClearTextView(sessionId?)` calls `onCaptionViewDestroyed(handle.handle)`, but this method has no `handle` parameter. TypeScript stops with "Cannot find name 'handle'". Next to it, `handleSetTextView` logs "handleSetVideoView called". Still the same on 2026-10-19.
- **Severity:** low (found at the first build).
- **Workaround:** removed the argument.
- **Suggestion:** compile the doc samples with `tsc` before publishing.

## FL-28 · The RN 0.83 tab of the headless playback guide asks for versions that are not on npm (2026-10-18)
- **Task:** install the headless playback packages for a React Native 0.83 Vega app with the same guide, tab "RN 0.83".
- **Steps:** added the listed versions: `@amazon-devices/kepler-player-server` and `@amazon-devices/kepler-player-client` `~4.0.0`, `@amazon-devices/react-native-w3cmedia` `~4.0.0`. Ran `npm install`.
- **Expected:** the install works.
- **Actual:** `npm install` fails. On npm the player packages have only `latest` 2.2.14 and `rn83-alpha` 2.3.0-rn-83, and w3cmedia has 2.3.2 and 2.3.4-rn-83. There is no 4.x. Still the same on 2026-10-19.
- **Severity:** medium (an RN 0.83 app cannot follow the guide).
- **Workaround:** the `rn83-alpha` versions (`2.3.0-rn-83`), with the override from FL-29.
- **Suggestion:** list the published versions or the dist tag in the guide.

## FL-29 · The RN 0.83 builds of the player packages break the install and warn at build time (2026-10-18)
- **Task:** use `@amazon-devices/kepler-player-client@2.3.0-rn-83` and `headless-task-manager@1.2.8-rn-83.1` in an RN 0.83 app, Vega SDK 0.24.
- **Steps:** `npm install`, then `react-native build-vega`.
- **Expected:** a clean install and build.
- **Actual:** `kepler-player-client@2.3.0-rn-83` depends on `kepler-player-server@^2.3.0`. The prerelease `2.3.0-rn-83` does not match `^2.3.0`, so npm stops with `notarget No matching version found for @amazon-devices/kepler-player-server@^2.3.0`. With an override the build passes, but it prints "Validation errors … The version is set to 2.3.0-rn-83 but that value is not part of it's 'kepler-compatibility.json' file" for player-client, player-server and headless-task-manager.
- **Severity:** medium (the install fails until you find the override. The warnings look like errors).
- **Workaround:** `"overrides": { "@amazon-devices/kepler-player-server": "2.3.0-rn-83" }` in the app's `package.json`. Ignore the warnings: the modules are in the manifest.
- **Suggestion:** depend on `2.3.0-rn-83` exactly, and add the rn83 versions to `kepler-compatibility.json`.

## FL-30 · A seek on a new player before the media loads is lost without an error (2026-10-19)
- **Task:** continue a movie at the same second after the app comes back from the background, with a new w3cmedia `VideoPlayer` (Fire TV Stick 4K Select, Vega OS 2.0).
- **Steps:** `new VideoPlayer()`, `initialize()`, set `src`, then at once `currentTime = 10.97` and `play()`.
- **Expected:** as in HTMLMediaElement, a position set before the media loads becomes the start position, and the movie starts at 10.97 s.
- **Actual:** `readyState` is 0. `currentTime` reads 10.97 right away, but the movie plays from 0. No error, no event. The player log has `getI64 media.player.set.initial.seek.position: not found`.
- **Severity:** medium (silent: "continue watching" starts from the beginning).
- **Workaround:** seek again once, on `loadedmetadata` or `canplay`. Then the movie starts at the right second.
- **Suggestion:** apply a seek made before loading as the start position, or document that the app must wait for `loadedmetadata`.

## FL-31 · An app closed in the background for an open media player is logged as a low-memory kill (2026-10-19)
- **Task:** find out why the demo app disappears after the Home button during a movie (Fire TV Stick 4K Select, Vega OS 2.0, 1 GB RAM).
- **Steps:** movie plays, press Home, wait a few seconds, read the system log.
- **Expected:** a log line that names the reason, for example "media player not released in the background".
- **Actual:** the app is closed a few seconds after Home. The warning-level line reports it as `LowResourceKiller`, which reads like a memory problem. The reason is only in an info-level line just before it: `onBackground Kill <pid> for using session media-playback`. The rule to release media players in the background is on the media player requirements page, but the CSAI guide and the sample apps do not link it to this kill.
- **Severity:** medium (the viewer loses the app and the place in the movie, and the log points the developer to memory first).
- **Workaround:** release the players when the app goes to the background, create them again when it is active, and continue at the saved position (with the seek from FL-30).
- **Suggestion:** name the media session in the kill reason, and link the requirement from the CSAI and media player guides.

## FL-32 · The Vega Virtual Device refuses http media that the device plays (2026-10-19)
- **Task:** run the same demo build on the Vega Virtual Device (VVD, SDK 0.24.12112) and on the stick, with media from a local server.
- **Steps:** `MEDIA_BASE = 'http://<LAN IP>:8080/'` and `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` in the manifest. The same aarch64 `.vpkg` on both.
- **Expected:** the same result on the VVD and on the device.
- **Actual:** the stick plays the movie and the ads. On the VVD every player fails at once with `MEDIA_ERR` 4. The system log says `isUriSchemeSecure Got an insecure protocol/scheme http, return error` and `openMedia Invalid URI`. The app sees only `error`, so every ad looks like a broken VAST. With https (CloudFront) the VVD plays the pre-roll to the end.
- **Severity:** medium (a local media server does not work on the VVD, and the reason is only in the system log).
- **Workaround:** serve media over https for VVD tests.
- **Suggestion:** apply the same cleartext rule on the VVD as on devices, or say in the VVD docs that it plays https only.

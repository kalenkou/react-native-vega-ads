# Friction log

Platform issues found while building vega-ads on a Fire TV Stick 4K Select (Vega OS 2.0). Each entry has the task, steps, expected and actual results, severity, workaround and a suggestion.

Test setup: Fire TV Stick 4K Select with Vega OS 2.0 (TV Ship/515) and Vega SDK 0.24.12112. The first test app, and the demo app until 2026-10-22, use `@amazon-devices/react-native-w3cmedia` 2.1 with React Native 0.72. Since 2026-10-22 the demo app uses w3cmedia 2.3.2 with React Native 0.83 (FL-36). The other entries that name React Native 0.83 come from separate test apps.

## Summary

Four themes repeat:

1. Failures reach the app without a reason: FL-01, FL-08, FL-11, FL-30, FL-31, FL-32, FL-33.
2. Media controls and Alexa do not fit an ad on a second player: FL-03, FL-06, FL-09, FL-10.
3. Amazon's React Native 0.83 packages and guides do not match npm: FL-28, FL-29, FL-34, FL-36, FL-39.
4. The Virtual Device differs from the stick: FL-13, FL-32, FL-35.

Severity: high = a core feature fails for viewers. Medium = wrong behaviour or hours lost, with a workaround. Low = friction, found early.

The log has 33 entries. Entry IDs are stable. IDs of merged and removed entries stay free.

| Entry&nbsp;ID | Problem | Area | Severity |
|---|---|---|---|
| FL-01 | An HTTP 403 reaches JS as error 4 with an empty message | w3cmedia | medium |
| FL-02 | The system log drops app `console.log` lines during playback | Logging | medium |
| FL-03 | Media controls with two players need two steps, and nothing warns | Media controls, CSAI guide | high |
| FL-04 | The media control page uses a deprecated API | Docs | low |
| FL-05 | A surface turns empty after `ended`, and content shows between ads | Video surfaces | medium |
| FL-06 | The play/pause key has no single owner | Media controls, input | high |
| FL-08 | w3cmedia refuses http media, and the cleartext rule is documented only for WebView | w3cmedia, manifest | medium |
| FL-09 | `setMediaControlFocus` blocks JS for 1-2 s on a cold launch | Media controls, performance | medium |
| FL-10 | "Alexa, next" never reaches the app during an ad | Alexa, media controls | medium |
| FL-11 | Video freezes during an Alexa request without any media event | Alexa, w3cmedia | medium |
| FL-12 | The video sample's DRM title never asks for hardware security | Sample app | low |
| FL-13 | VVD media keys in the docs differ from the SDK mapping | Virtual Device, docs | low |
| FL-16 | Amazon's device testing services do not take Vega packages | Appstore testing | medium |
| FL-17 | A default release build fails `vpt validate` (build number 0) | Build, template | low |
| FL-18 | The media controls manifest check sometimes says `false` | Media controls | low |
| FL-19 | A later video surface is drawn on top, whatever its zIndex | Video surfaces, CSAI guide | medium |
| FL-21 | w3cmedia events differ from HTML5 in three places | w3cmedia | medium |
| FL-22 | URL mode never reports the video size | w3cmedia | low |
| FL-24 | `setSrcWithCustomHeaders` works but is hidden | w3cmedia, docs | low |
| FL-25 | react-native-keyevent is marked Vega-compatible but gets no keys | Library catalog, input | low |
| FL-26 | The a11y settings README imports a default export that does not exist | Docs | low |
| FL-27 | The headless playback sample does not compile | Docs | low |
| FL-28 | The RN 0.83 headless guide lists versions that are not on npm | Docs, npm | medium |
| FL-29 | The RN 0.83 player client cannot be installed without an override | npm packages | medium |
| FL-30 | A seek before the media loads is lost without an error | w3cmedia | medium |
| FL-31 | A background kill for an open player is logged as low memory | App lifecycle, logs | medium |
| FL-32 | The VVD refuses http media that the stick plays | Virtual Device | medium |
| FL-33 | 10 of 13 popular native libraries crash at import | Runtime, build | medium |
| FL-34 | The `moduleName` splash API finds no splash in an RN 0.83 app | Splash screen API | low |
| FL-35 | The VVD lacks the player modules, and a build rewrites `manifest.toml` | Virtual Device, build | low |
| FL-36 | Amazon's RN 0.83 package builds print ERROR about their own versions | npm packages, build | low |
| FL-38 | The first `AdIdRetriever` read blocks JS for up to 2.6 s on RN 0.83 | Ads API, performance | medium |
| FL-39 | The a11y settings package installs React Native 0.60.6 | npm packages | low |

## FL-01 · An HTTP 403 from the media server reaches JS as error 4 with an empty message (2026-10-11)
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
- **Actual:** many app lines missing. The log shows `Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`. Most of the 300 lines/s come from the media pipeline (GStreamer/W3CMEDIA info logs) inside the same process. So the app's own lines lose the budget.
- **Severity:** medium (wrong conclusions during debugging: "event never fired").
- **Workaround:** mirrored the log on screen in the app. Tagged the app's lines and filtered the log by the tag.
- **Suggestion:** separate budgets for JS console and native media logs, or lower media pipeline info logs in production-like builds. Document the limit next to `loggingctl`.

## FL-03 · Media controls with two w3cmedia players fail silently unless two separate steps are both done (2026-10-11)
- **Task:** make remote play/pause and "Alexa, pause" control the player the viewer sees (content → ad → content). The app uses client-side ad insertion (CSAI) with two w3cmedia players. Setup: Fire TV Stick 4K Select, Vega OS 2.0, `@amazon-devices/react-native-w3cmedia` ~2.1.
- **Steps:** A/B test on the device, one change at a time. Keys injected with `inputd-cli button_press KEY_PLAYPAUSE` (once during content, once during the ad). Result = count of `MediaControlHandler: performing handleTogglePlayPause` in the system log.
  - A. `player.setMediaControlFocus(componentInstance)` on every switch, no manifest entry → 0 commands delivered.
  - B. Manifest `[[extras]] key = "interface.provider"` + `interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"`, no `setMediaControlFocus` → 0.
  - C. Both → commands delivered. During content the content pauses/resumes. During the ad only the ad pauses/resumes. "Alexa, pause" works.
  - D. Neither → 0.
- **Expected:** the CSAI guide for Vega covers media controls for the two-player pattern. Or the runtime warns when one of the two steps is missing.
- **Actual:** neither CSAI page in the 0.24 docs mentions media controls, `setMediaControlFocus`, Alexa or the manifest entry. The pages are "Client-side ad insertion in Vega" and "Implement client-side ad insertion using the JS approach". The W3C Media "media control" page does say to add manifest entries and call `setMediaControlFocus`. But the manifest snippet is on another page. In `dist/MediaPlayer.d.ts` the method is marked `@hidden`, while `interface/VideoPlayer.d.ts` documents it. With one step missing there is no error or warning. The only hint is `isSessionInForeground :0` in the system log. The remote key reaches the app (`KEY_PLAYPAUSE` in inputd) and is dropped.
- **Severity:** high for ad-supported apps (a basic remote and voice feature silently does nothing).
- **Workaround:** both steps (variant C). Call `setMediaControlFocus` on the ad player at ad start and on the content player at resume. Focus switch takes 197-217 ms.
- **Suggestion:** add a "media controls with two players" section to the CSAI guide, with the manifest snippet. Remove `@hidden` from `setMediaControlFocus` in `MediaPlayer.d.ts`. Log a warning when `setMediaControlFocus` is called and the manifest has no `IMediaPlaybackServer` (and vice versa).

## FL-04 · Media control docs sample uses a deprecated API (2026-10-11)
- **Task:** get the `IComponentInstance` that `setMediaControlFocus` needs.
- **Steps:** followed the W3C Media "media control" page, which uses `useComponentInstance()`.
- **Expected:** the docs sample uses the current API.
- **Actual:** at run time `useComponentInstance` warns: "deprecated. Update to use getComponentInstance from KeplerAppStateManager instead". The replacement (`useKeplerAppStateManager().getComponentInstance()`) was found only in `.d.ts` files.
- **Severity:** low.
- **Workaround:** `useKeplerAppStateManager().getComponentInstance()`.
- **Suggestion:** update the media control page and samples to the non-deprecated API.

## FL-05 · A video surface turns empty after `ended`. Content shows through between two ads (2026-10-11)
- **Task:** play two ads back to back (pod) on two w3cmedia players with two `KeplerVideoSurfaceView`s above the content surface. Amazon's CSAI overview suggests two ad players for back-to-back ads without a gap.
- **Steps:** ad 1 on surface A. Ad 2 prebuffered on surface B (`autoplay=false`, `canplay`). On ad 1 `ended` call `play()` on ad 2 and bring surface B on top when ad 2 fires `playing`.
- **Expected:** ad 1's last frame stays on screen until ad 2 renders (like a paused player keeps its frame).
- **Actual:** phone video, frame by frame: after `ended` surface A is empty. The paused content frame below is visible for ~0.4-0.6 s (time from `play()` to `playing` of a prebuffered player: ~370-450 ms).
- **Severity:** medium (viewer sees the show flash in the middle of an ad pod).
- **Workaround:** start the next ad ~500 ms before the current one ends and let the current one finish hidden. Measured: next first frame 85 ms before the previous `ended`, `complete` still accurate.
- **Suggestion:** document in the CSAI guide that a surface does not keep the last frame after `ended`. Also give the typical `play()` → first frame latency of a prebuffered player. Or add an option to keep the last frame.

## FL-06 · The play/pause key has no single owner: media controls and JS both act on it (2026-10-11)
- **Task:** decide whether an app (or an ad library) should handle the remote play/pause key itself or leave it to Vega Media Controls. Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** a `useTVEventHandler` logger, and an app handler that toggles the player on `playpause` key down. Two builds: with and without the media controls manifest entries (`com.amazon.category.kepler.media`, `IMediaPlaybackServer`). No `setMediaControlFocus` call in the build without them. Key sent with `inputd-cli button_press KEY_PLAYPAUSE`, during content and during an ad. Live log with `loggingctl log -f`.
- **Expected:** one owner per key press, and docs that say which. Either media controls consume the key, or only JS gets it (like Android `onKeyDown` returning true).
- **Actual:**
  - The key always reaches JS (`eventType: 'playpause'`, down and up).
  - With the entries, media controls also pause the focused player, 224 ms after key down. An app that maps `playpause` in its own handler toggles twice.
  - Without the entries, inputd's MediaController still acts when the player session is in foreground: `isSessionInForeground :1`, then w3cmedia `Player Session is performing pause operation on Media Player`. The system does not resume a paused player, so the app's resume is undone about 450 ms later. The viewer sees play start and stop. "Alexa, pause" does not work in this setup.
- **Severity:** high for apps with their own remote handling (a double toggle or a resume that stops at once).
- **Workaround:** keep the manifest entries and let media controls own play/pause. Ignore `playpause` in the app's own key handler while media controls own the player (for ads: during the ad break).
- **Suggestion:** document the routing for both setups next to the media controls docs. Add a way to mark the key as consumed, or to opt out of the legacy player session. Log which component handled the key.

## FL-08 · w3cmedia refuses http:// media. The cleartext manifest policy is documented only for WebView (2026-10-11)
- **Task:** play VAST ad media files and a content movie served over plain HTTP on the local network. This is typical for development. Many ad servers still return `http://` MediaFile URLs. Setup: Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `fetch` the VMAP/VAST over `http://<LAN IP>:8080/` (works). Set `player.src = 'http://<LAN IP>:8080/ad.mp4'`. Read `loggingctl log -f -o cat`.
- **Expected:** playback, or a documented rule that media must use HTTPS, with a clear `MediaError` message.
- **Actual:** `MEDIA_PLAYERV2: MediaUrlSourceImpl.cpp(58) createSourceElement Invalid or insecure URI scheme`, `Could not build sourceBin`. JS only gets a generic error, so the ad fails with VAST error 400 and the content stays black. `fetch` to the same host works. Adding `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` to the manifest makes w3cmedia play it (IP address accepted). The docs describe this section only on the WebView page ("Build Web Apps with WebView", 0.24). The public AmazonAppDev/vega-video-sample has four `http://` `videoUrl` entries (`src/data/rotatorData.json`) and no cleartext section in its manifest (I did not play those entries).
- **Severity:** medium (silent black screen. Hard to find without the system log. Ad libraries cannot tell "insecure URL" from "broken file").
- **Workaround:** HTTPS for all media. For development, the cleartext allow-list in the app manifest. Amazon's forum has the same error: https://community.amazondeveloper.com/t/shaka-player-fails-with-unknown-error-on-http-video/27667
- **Suggestion:** document `network-traffic-policy` as an app-wide policy (fetch vs media vs WebView), and put the reason ("cleartext not allowed") into `MediaError.message`.

## FL-09 · setMediaControlFocus blocks the JS thread for 1-2 s on a cold launch (2026-10-11)
- **Task:** start a pre-roll right after app launch and send the impression on the first frame. Setup: Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `player.play()`, then at once `player.setMediaControlFocus(componentInstance)` (so the remote and Alexa control the ad). The impression is sent from the `playing` listener. `loggingctl log -f -o cat`.
- **Expected:** `setMediaControlFocus` returns a promise and does not hold the JS thread. `playing` reaches JS a few ms after the native event.
- **Actual:** native `playing` at 21.33 s. JS logs from the media controls setup ("Manifest was parsed", then a 1.2 s gap, then `MediaControlStateUtil` and many `addEventListener` lines). `playing` reached JS at 23.74 s. The impression and `start` pixels were 2.4 s late on the first launch after install (0.5 s on the next launch). `firstQuartile` came 0.3 s after `start`. With a 5 s first-frame timeout this can also drop the pre-roll.
- **Severity:** medium (wrong ad measurement on cold start. Possible lost pre-roll).
- **Workaround:** call `setMediaControlFocus` after the first frame is handled (deferred with `setTimeout(0)`). Measured after the change: 143 ms from native `playing` to the impression.
- **Suggestion:** do the media controls setup off the JS thread. Or document that the first call is slow and should not be made on a time-critical path.

## FL-10 · "Alexa, next" never reaches the app during an ad, even with "Next" in command_options (2026-10-11)
- **Task:** let the viewer skip a skippable ad by voice, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** manifest `IMediaPlaybackServer` with `command_options = ["Next"]` (the "Attributes and features" page says optional commands arrive only when listed). A `KeplerMediaControlHandler` subclass for the ad player with `handleNext` overridden. The ad player's published actions set to PLAY, PAUSE, TOGGLE_PLAY_PAUSE, STOP, NEXT before `setMediaControlFocus` (w3cmedia publishes SEEK, FAST_FORWARD, SKIP_FORWARD... but not NEXT by default). During a skippable ad, past its skip offset, say "Alexa, next" and "Alexa, skip". Every app event mirrored to a server log because the device log drops app lines.
- **Expected:** `handleNext` is called, or a documented reason why not. A table of Alexa phrases → media control commands.
- **Actual:** with the default actions Alexa answers "Next is not supported". With NEXT published, Alexa says nothing. `handleNext` is never called (no app event in four runs). No Vega page maps Alexa phrases to media controls commands. The only such table is for Fire TV on Android (Video Skills Kit, 2021), where "skip" leads to Next in some locales.
- **Severity:** medium (a viewer cannot skip a skippable ad by voice, and developers have to test phrase by phrase).
- **Workaround:** Skip button with D-pad focus. "Alexa, pause/play" works.
- **Suggestion:** publish the Alexa phrase to command table for Vega, with locales. Say which commands reach the app while a second player (an ad) has media controls focus. Deliver Next when it is listed in `command_options`. Let apps set the supported actions through a public API (today only `mediaControlStateUtil.capabilities`, an undocumented field).

## FL-11 · Video freezes during an Alexa voice interaction without any media event (2026-10-11)
- **Task:** keep an ad playing correctly while the viewer talks to Alexa, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** during an ad, say "Alexa, next" (or any request). Watch the ad's `timeupdate`, `pause`, `playing`, `waiting` events and its tracking pixels.
- **Expected:** a `pause` (or an audio focus / interruption event) when the system takes over, and `playing` when it gives the player back.
- **Actual:** the ad stops advancing for 6-13 s (quartile pixels 6 s and 16 s apart instead of 2.5 s). There is no `pause`, `waiting` or `playing` event. An app cannot tell this from a stalled stream: my 10 s stall watchdog ended one ad with VAST error 405 after a voice request. Also, "Alexa, pause" on the content then reaches the media controls handler, but the player sends no `pause` event: it was already frozen, so its state does not change. Anything that waits for `pause` (a pause ad, an analytics event) misses a voice pause.
- **Severity:** medium (ads cut short after a voice request. Wrong error reporting to ad servers).
- **Workaround:** two stall timeouts: 10 s after a `waiting` event (real buffering), 30 s when the time stops with no event at all (voice request). For pause ads I listen to the `pause` event and also to the pause command in the content's media controls handler.
- **Suggestion:** emit `pause`/`playing` (or a documented interruption event) when Alexa takes and returns the media session.

## FL-12 · The video sample's DRM title never asks for the hardware-secure path (2026-10-11)
- **Task:** use Amazon's Vega video sample as a reference for DRM playback next to a clear ad player.
- **Steps:** read how the sample's Shaka player picks the Widevine robustness for a title marked secure (`src/w3cmedia/shakaplayer/ShakaPlayer.ts`, line 418). Also read how titles are marked (`src/types/VideoSource.ts` line 31, `src/data/local/premiumCollection.ts` line 51).
- **Expected:** a title with `secure: true` gets the hardware-secure robustness.
- **Actual:** the player compares `content.secure` with the string `'true'`. The type and the data use the boolean `true`. So the comparison is always false, and the sample's DRM title gets the software robustness. Found by reading the code. Not checked in a device log.
- **Severity:** low (a developer who copies the sample may believe they test the secure path).
- **Workaround:** none in `react-native-vega-ads` (it does not use the sample's player). An app should check the robustness it really gets.
- **Suggestion:** compare with the boolean, or accept both, and make the docs and the type agree. Fix proposed in AmazonAppDev/vega-video-sample PR #14.

## FL-13 · Vega Virtual Device: the documented media keys differ from the SDK's keyboard mapping (2026-10-11)
- **Task:** test remote play/pause and seek of an ad on the Vega Virtual Device with the Mac keyboard.
- **Steps:** compare the media keys listed in the docs with the mapping in the SDK. Docs: https://developer.amazon.com/docs/vega/0.24/run-apps.html (F3 rewind, F4 play/pause, F5 fast forward). SDK 0.24.12112: `vvd/images/tv/vmtools/scripts/vvrp_agent_run.sh`, lines 66-76.
- **Expected:** the same keys in both.
- **Actual:** the script maps F2 to volume down, F3 to volume up, F4 to menu and F5 to previous. It maps F6 to rewind, F7 to play/pause, F8 to fast forward and F9 to next. The docs list F2 as Menu and F4 as Play/Pause. I compared the two files. I did not test the keys one by one on the VVD.
- **Severity:** low (lost time. A tester may think media controls do not work on the virtual device).
- **Workaround:** use the script's keys, or `inputd-cli button_press KEY_PLAYPAUSE` over `vega exec vda`.
- **Suggestion:** generate the docs table from the mapping, or fix one of them.

## FL-16 · Amazon's automated device testing does not take Vega packages (2026-10-12)
- **Task:** get the same evidence other Fire TV apps can show: Amazon installs, launches and measures the app on its own devices.
- **Steps:** read the Appstore Quality Central and Live Device Interaction docs. Search the developer forum.
- **Expected:** a way to run a `.vpkg` on Amazon-hosted Fire TV Stick 4K Select devices.
- **Actual:** both services take Fire OS APKs only. An Amazon reply on the forum (https://community.amazondeveloper.com/t/can-t-we-test-vega-apps-on-appstore-quality-center/28258): "There is no VPKG/Vega OS support at this time". The Fire TV Stick 4K Select is not in Live Device Interaction.
- **Severity:** medium (a Vega developer without a stick cannot check the app on hardware before submitting. The docs say "you must test your app on a Fire TV Stick before submitting").
- **Workaround:** test on my own stick against the Vega KPI targets with `vega exec perf kpi-visualizer --certification` and the list in "Test before submission".
- **Suggestion:** add Vega devices to Appstore Quality Central and Live Device Interaction.

## FL-17 · A default release build fails `vpt validate` (build number 0) (2026-10-12)
- **Task:** check the demo app's three packages (`armv7`, `aarch64`, `x86_64`) with the strict package validation that the Appstore runs, Vega SDK 0.24.
- **Steps:** `react-native build-vega --build-type Release` as generated by the project template, then `vega exec vpt validate` on each `.vpkg`.
- **Expected:** a package built by the default release script passes validation, or the build warns about a missing build number.
- **Actual:** all three failed with "build_number must be greater than 0, found: 0". The build itself gave no warning.
- **Severity:** low (found before submission. Would block an upload).
- **Workaround:** `--build-number 1` in the `build:release` script. All three then pass with 0 errors (info only: no app icon).
- **Suggestion:** start the template's build number at 1, or make `build-vega --build-type Release` warn when it is 0.

## FL-18 · The media controls manifest check sometimes answers `false`, with no reason (2026-10-11)
- **Task:** make remote and Alexa play/pause reach my players, Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** launch a test app with the media controls entry in `manifest.toml` many times. Read `checkClientManifestForKMC: ... has KMC:` in the system log.
- **Expected:** `true` each time.
- **Actual:** on 2026-10-11, 4 of 20 launches logged `false`, all within 20 minutes. The package was installed again before each launch. These 4 launches have no `MediaControlHandler` setup line. In 175 later launches of 5 apps (2026-10-12 to 2026-10-22) the answer was always `true`. I did not find the cause.
- **Severity:** low (seen on one day. When it happens, remote and voice commands may not reach the app, and the app gets no error).
- **Workaround:** when a media controls test fails, look for this line first and launch the app again.
- **Suggestion:** log why the check returns `false`, and document what it reads.

## FL-19 · A video surface created later is drawn on top, whatever its zIndex (2026-10-15)
- **Task:** add client-side ads to an existing Vega player screen (Amazon's `react-native-multi-tv-app-sample`) on a Fire TV Stick 4K Select, Vega OS 2.0: two ad `KeplerVideoSurfaceView`s above the app's content `KeplerVideoSurfaceView`.
- **Steps:** content surface at `zIndex: 0`. Ad surfaces in an absolute overlay at `zIndex: 3` (inner 2 and 3). The ad overlay mounts at once. The screen mounts its content surface only after `loadedmetadata`, so the ad surfaces are created first (handles 1 and 2, content 3).
- **Expected:** the ad video above the content surface, as the zIndex says. Amazon's CSAI guide (docs 0.24, "Dual surface") says: "The ad surface overlays the main content surface using `zIndex` positioning." Its example mounts both surfaces together, content first, so the order hides the problem.
- **Actual:** during the pre-roll the screen was black: the ad played (all quartile events, the countdown in the UI overlay counted down), but its picture was hidden. Mounting the ad overlay only after the content surface's `onSurfaceViewCreated` made the ad visible. Black in 2 of 2 runs before the change, visible in 5 of 5 after. No warning in the log.
- **Severity:** medium (looks like a broken ad or network. An ad that is paid for is not seen).
- **Workaround:** create the ad surfaces after the content surface (`AdSurfaceLayers` docs now say so). Shown in AmazonAppDev/react-native-multi-tv-app-sample PR #139.
- **Suggestion:** document how video surfaces are ordered (creation order, not zIndex), or apply zIndex to video surfaces.

## FL-21 · w3cmedia events differ from HTML5 in three places, without a note in the docs (2026-10-11, again 2026-10-17)
- **Task:** play MP4 by URL with `VideoPlayer` from `@amazon-devices/react-native-w3cmedia` 2.3.2 (React Native 0.83 template) on a Fire TV Stick 4K Select. Then map its events to a player API written for HTML5 (react-native-video v7's web backend does this for `<video>`).
- **Steps:** log every media event with `currentTime`, `readyState` and `paused`. `src` → `play()`. `currentTime = 40` after 5 s. Let the video play to its end.
- **Expected:** HTML5 behaviour, as the docs describe the player as an HTMLMediaElement. One `loadstart` per source. `seeked` with `currentTime` at the new position. At the end, `paused` becomes `true` and a `pause` event comes before `ended`.
- **Actual:** `loadstart` came twice (at `src`, `readyState` 0, and again after the metadata, `readyState` 3). At `seeked`, `currentTime` was 5.31 to 5.32 although the seek went to 40. The picture from 40 followed about 0.6 s later. After `ended` there was no `pause` event, `paused` stayed `false` and `readyState` stayed 2. Same in 2 runs on 2026-10-11 (w3cmedia 2.1.99, React Native 0.72). Same in 5 runs on 2026-10-17 (w3cmedia 2.3.2, React Native 0.83).
- **Severity:** medium (a player built on HTML5 semantics reports a double load, a wrong seek position and "still playing" at the end).
- **Workaround:** react-native-video's Vega backend sends `onLoadStart` once per source, `onLoad` after the metadata, `onSeek` with the seek target, and keeps its own "ended" flag.
- **Suggestion:** fix these three to match HTML5, or list the differences on the w3cmedia API page.

## FL-22 · w3cmedia in URL mode never reports the video size (2026-10-17)
- **Task:** fill `onLoad` (width and height) for react-native-video v7 on Vega, from w3cmedia `VideoPlayer` 2.3.2. Setup: Fire TV Stick 4K Select, MP4 720p by URL.
- **Steps:** read `videoWidth` and `videoHeight` at `loadedmetadata`, at `loadeddata` (`readyState` 3), and during playback at 5 s and 43 s.
- **Expected:** 1280×720 from `loadedmetadata` on, as on HTML5.
- **Actual:** 0×0 at every point, in 2 runs, for 2 sources.
- **Severity:** low (apps cannot pick a layout or show the resolution from the player).
- **Workaround:** none in the player. The app must know the size from its catalog.
- **Suggestion:** fill `videoWidth`/`videoHeight` in URL mode, or document that they are MSE-only.

## FL-24 · Request headers for media work, but the only API for them is hidden (2026-10-17)
- **Task:** play an MP4 that needs a request header (for example a token), with `VideoPlayer` from `@amazon-devices/react-native-w3cmedia` 2.3.2 in URL mode. Setup: Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** searched the Vega docs and the w3cmedia API page for headers. Read the package's type files. Called `setSrcWithCustomHeaders(url, { 'X-Rnv7-Test': 'hdr1' })` and logged the request on the server.
- **Expected:** a documented way to send headers with the media request, or a note that it is not supported.
- **Actual:** the docs do not mention headers. `setSrcWithCustomHeaders` exists in 2.3.2, but its type comment is `@hidden`. In 2.1.99 the method does not exist. Called on the stick, it works: the server received `X-Rnv7-Test: hdr1`.
- **Severity:** low (works, but an app cannot know it may rely on it, or from which version).
- **Workaround:** feature-detect the method. Without it, load the URL and warn that headers are not sent.
- **Suggestion:** document `setSrcWithCustomHeaders` with the first w3cmedia version that has it, or say which API to use instead.

## FL-25 · react-native-keyevent is marked Vega-compatible but gets no key events on Vega (2026-10-17)
- **Task:** read remote keys with `react-native-keyevent` 0.3.2 on a Fire TV Stick 4K Select (Vega OS 2.0, React Native 0.83). React Native Directory marks this package `vegaos: true`. Amazon's Fire TV starter sample lists it in its Vega app.
- **Steps:** `KeyEvent.onKeyDownListener(cb)` and `onKeyUpListener(cb)` in a test screen with a focused button. Pressed Down, Right, Right, Left, Select with `inputd-cli`. Also registered `useTVEventHandler` in the same screen.
- **Expected:** a key event per press, as on Android TV.
- **Actual:** 0 events from react-native-keyevent. `useTVEventHandler` got all 10 (5 presses, down and up). The package listens to `DeviceEventEmitter('onKeyDown')`, which only its Android native module sends. It installs and imports on Vega without an error. Amazon's sample handles the remote with its own `TVEventHandler` code on Vega.
- **Severity:** low (silent: the app runs, the keys just never arrive).
- **Workaround:** `TVEventHandler` directly, or a Vega module for the package (I wrote one: `index.kepler.js` that maps Vega key names to Android key codes. On the stick 10 of 10 events). Proposed upstream as react-native-keyevent PR #92.
- **Suggestion:** in the Directory, mark packages as "installs" vs "works" on Vega, or note that key events need `TVEventHandler`.

## FL-26 · The accessibility settings README imports a default export that the package does not have (2026-10-18)
- **Task:** read the viewer's Closed Captions setting and caption text size in the demo app, to show captions on ads. Setup: `@amazon-devices/kepler-a11y-settings-interface-turbo` 1.0.0 on a Fire TV Stick 4K Select (Vega OS 2.0).
- **Steps:** followed the package README (also on developer.amazon.com, vega-api 0.24): `import KeplerA11ySettingsInterface from '@amazon-devices/kepler-a11y-settings-interface-turbo'`, then `isClosedCaptioningEnabled()` and `getCaptionPreferences()`.
- **Expected:** the README import works.
- **Actual:** `dist/src/index.js` and `index.d.ts` export `KeplerA11ySettingsInterface` only as a named export. There is no default export. TypeScript stops with "has no default export". Plain JavaScript gets `undefined` and fails at the first call. With the named import, `import { KeplerA11ySettingsInterface } from '...'`, it works: on the stick the module auto-links (`Successfully v2 auto-linked libKeplerA11ySettingsInterfaceTurbo.so`) and returns the setting.
- **Severity:** low (found at the first build), but every example in the README has it.
- **Workaround:** the named import. The module also looks itself up with `TurboModuleRegistry.getEnforcing` when it is loaded, so on a device without it the import throws. I load it with `require` inside `try`, and captions stay off there.
- **Suggestion:** fix the README examples (or add a default export), and say which Vega OS versions have the module.

## FL-27 · The headless playback sample service does not compile (2026-10-18)
- **Task:** move ad playback into a headless JS service. Guide: "Implement Headless JavaScript Playback" (developer.amazon.com, Vega 0.24), section "Create the headless service file".
- **Steps:** copied the sample service class into a TypeScript project and ran `tsc`.
- **Expected:** the sample compiles.
- **Actual:** `handleClearTextView(sessionId?)` calls `onCaptionViewDestroyed(handle.handle)`, but this method has no `handle` parameter. TypeScript stops with "Cannot find name 'handle'". Next to it, `handleSetTextView` logs "handleSetVideoView called". Still the same on 2026-10-23.
- **Severity:** low (found at the first build).
- **Workaround:** removed the argument.
- **Suggestion:** compile the doc samples with `tsc` before publishing.

## FL-28 · The RN 0.83 tab of the headless playback guide asks for versions that are not on npm (2026-10-18)
- **Task:** install the headless playback packages for a React Native 0.83 Vega app with the same guide, tab "RN 0.83".
- **Steps:** added the listed versions: `@amazon-devices/kepler-player-server` and `@amazon-devices/kepler-player-client` `~4.0.0`, `@amazon-devices/react-native-w3cmedia` `~4.0.0`. Ran `npm install`.
- **Expected:** the install works.
- **Actual:** `npm install` fails. On npm the player packages have only `latest` 2.2.14 and `rn83-alpha` 2.3.0-rn-83. The w3cmedia package has 2.3.2 and 2.3.4-rn-83. There is no 4.x. Still the same on 2026-10-23.
- **Severity:** medium (an RN 0.83 app cannot follow the guide).
- **Workaround:** the `rn83-alpha` versions (`2.3.0-rn-83`), with the override from FL-29.
- **Suggestion:** list the published versions or the dist tag in the guide.

## FL-29 · The RN 0.83 build of the player client cannot be installed without an override (2026-10-18)
- **Task:** use `@amazon-devices/kepler-player-client@2.3.0-rn-83` in an RN 0.83 app, Vega SDK 0.24.
- **Steps:** add `"@amazon-devices/kepler-player-client": "2.3.0-rn-83"` to `package.json`. Run `npm install`.
- **Expected:** a clean install.
- **Actual:** `kepler-player-client@2.3.0-rn-83` depends on `@amazon-devices/kepler-player-server@^2.3.0`. The only 2.3 version of the server on npm is the prerelease `2.3.0-rn-83`, and npm does not match a prerelease to `^2.3.0`. So npm stops with `notarget No matching version found for @amazon-devices/kepler-player-server@^2.3.0`. Still the same on 2026-10-23 (`npm view`).
- **Severity:** medium (the RN 0.83 headless player cannot be installed until you find the override).
- **Workaround:** `"overrides": { "@amazon-devices/kepler-player-server": "2.3.0-rn-83" }` in the app's `package.json`. The build then prints the ERROR from FL-36.
- **Suggestion:** depend on `2.3.0-rn-83` exactly, or publish a 2.3.0 release of the server.

## FL-30 · A seek on a new player before the media loads is lost without an error (2026-10-19)
- **Task:** continue a movie at the same second after the app comes back from the background. Use a new w3cmedia `VideoPlayer` (Fire TV Stick 4K Select, Vega OS 2.0).
- **Steps:** `new VideoPlayer()`, `initialize()`, set `src`, then at once `currentTime = 10.97` and `play()`.
- **Expected:** as in HTMLMediaElement, a position set before the media loads becomes the start position, and the movie starts at 10.97 s.
- **Actual:** `readyState` is 0. `currentTime` reads 10.97 right away, but the movie plays from 0. No error, no event. The player log has `getI64 media.player.set.initial.seek.position: not found`.
- **Severity:** medium (silent: "continue watching" starts from the beginning).
- **Workaround:** seek again once, on `loadedmetadata` or `canplay`. Then the movie starts at the right second.
- **Suggestion:** apply a seek made before loading as the start position, or document that the app must wait for `loadedmetadata`.

## FL-31 · An app closed in the background for an open media player is logged as a low-memory kill (2026-10-19)
- **Task:** find out why the demo app disappears after the Home button during a movie. Setup: Fire TV Stick 4K Select, Vega OS 2.0, 1 GB RAM.
- **Steps:** movie plays, press Home, wait a few seconds, read the system log.
- **Expected:** a log line that names the reason, for example "media player not released in the background".
- **Actual:** the app is closed a few seconds after Home. The warning-level line reports it as `LowResourceKiller`, which reads like a memory problem. The reason is only in an info-level line just before it: `onBackground Kill <pid> for using session media-playback`. Releasing at once does not always prevent it: with `deinitialize()` called on the background event, the system still ended the app in 1 of 6 runs, 0.69 s after Home. Closing the player took 0.42-0.87 s (GStreamer needs about 0.5 s to stop). The system checked 0.65-1.27 s after Home. The rule to release media players in the background is on the media player requirements page. But the CSAI guide and the sample apps do not link it to this kill.
- **Severity:** medium (the viewer loses the app and the place in the movie, and the log points the developer to memory first).
- **Workaround:** release the players when the app goes to the background. Create them again when the app is active. Continue at the saved position (with the seek from FL-30).
- **Suggestion:** name the media session in the kill reason, and link the requirement from the CSAI and media player guides. Give apps a documented time to release, or check after a released player has finished closing.

## FL-32 · The Vega Virtual Device refuses http media that the device plays (2026-10-19)
- **Task:** run the same demo on the Vega Virtual Device (VVD, SDK 0.24.12112) and on the stick. Use media from a local server.
- **Steps:** `MEDIA_BASE = 'http://<LAN IP>:8080/'` and `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` in the manifest. The same source and manifest: the armv7 build on the stick, the aarch64 build on the VVD.
- **Expected:** the same result on the VVD and on the device.
- **Actual:** the stick plays the movie and the ads. On the VVD every player fails at once with `MEDIA_ERR` 4. The system log says `isUriSchemeSecure Got an insecure protocol/scheme http, return error` and `openMedia Invalid URI`. The app sees only `error`, so every ad looks like a broken VAST. With https (CloudFront) the VVD plays the pre-roll to the end.
- **Severity:** medium (a local media server does not work on the VVD, and the reason is only in the system log).
- **Workaround:** serve media over https for VVD tests.
- **Suggestion:** apply the same cleartext rule on the VVD as on devices, or say in the VVD docs that it plays https only.

## FL-33 · 10 of 13 popular native libraries crash a Vega app at import, and 5 of them name nothing (2026-10-22)
- **Task:** see what a developer meets when they add a popular React Native library that has no Amazon port. Fire TV Stick 4K Select, Vega OS 2.0, React Native 0.83, release build.
- **Steps:** one test app, one library at a time: `npm install`, build, run, `require()` the package, then one call or one render. A global `ErrorUtils` handler prints any fatal error on screen. The 13 packages have 47k to 888k npm downloads a week. None has an Amazon port, and React Native Directory does not mark any of them as Vega-compatible.
- **Expected:** a build warning that the package has native code but no Vega code. Or a runtime error that names the package.
- **Actual:**
  - 10 build, then crash at `require()`. Without the handler the app closes, even inside `try`/`catch`.
  - 5 of these name the missing module. They are react-native-config 1.7.2, react-native-blob-util 0.25.1 and react-native-audio-api 0.13.6. The other two are react-native-bootsplash 7.3.4 and react-native-sound 0.13.0. Example: `TurboModuleRegistry.getEnforcing(...): 'RNSound' could not be found`.
  - 5 show only "__fbBatchedBridgeConfig is not set, cannot invoke native modules". These are react-native-fs 2.20.0, react-native-restart 0.0.29 and react-native-background-timer 2.4.1. The other two are react-native-tts 4.1.1 and react-native-track-player 4.1.2.
  - react-native-video 7.0.0-beta.12 (npm tag `beta`) shows the same message about 1 s after launch, when `react-native-nitro-modules` calls `TurboModuleRegistry.getEnforcing('NitroModules')`. The Amazon Devices Builder Tools knowledge base (`vega_media_playback_api.md`) says: "`react-native-video` must be removed: It has native Android code (ExoPlayer) that does not work on Vega. There is no compatibility layer." The crash does not name the package.
  - 2 do not build: @react-native-community/blur 4.4.1 (`Unable to resolve module ./components/BlurView`) and react-native-image-colors 2.6.1 (needs `expo-modules-core`).
  - 1 builds and imports but draws nothing: @react-native-picker/picker 2.11.4. Its `Picker` returns `null` on a platform it does not know, without a warning.
- **Severity:** medium (a developer finds out on the device, one library at a time, and half of the crashes do not name the package).
- **Workaround:** try each native library on the device before building on it. For sound and video, use w3cmedia directly (`AudioPlayer`, `VideoPlayer`). For react-native-video v7, a Vega backend on w3cmedia (`*.kepler.ts` files) is proposed upstream as react-native-video PR #5171.
- **Suggestion:** at build time, warn about packages that have Android or iOS native code but no `.kepler` files and no Amazon port. Make the `__fbBatchedBridgeConfig` error name the module that was asked for.

## FL-34 · The moduleName API of SplashScreenManager finds no splash screen in a React Native 0.83 app (2026-10-22)
- **Task:** keep the native splash screen until the app is ready, from plain JavaScript and not from a hook. The `hide()` of react-native-bootsplash needs this. Fire TV Stick 4K Select, Vega OS 2.0, React Native 0.83 (`@amazon-devices/react-native-kepler` 4.0.1), release build, `SplashScreenImages.zip` in `assets/raw`.
- **Steps:** at module scope, `SplashScreenManager.preventAutoHideAsync(name)` with the `name` from `app.json` (for example `com.example.test.main`). Later `hideAsync(name)`.
- **Expected:** the 0.83 SplashScreenManager page says the "moduleName parameter maps to the name field in your app's app.json file". The same page marks `preventAutoHideAsync` as "Replaced by the usePreventHideSplashScreen() hook". A library such as react-native-bootsplash has no component for a hook, so for it this is the only documented API. The splash should stay until `hideAsync`.
- **Actual:** `preventAutoHideAsync` rejects with "[SplashScreenManager] No registered splash screen for module: <name>". `hideAsync` rejects with "Splash screen not found or already dismissed". The splash hides on the first frame. The comment in the source says the name must match the "screenKey that users register in app's main.cpp create() method". A React Native app has no such file. `AppRegistry.getAppKeys()[0]` is `LogBox`, not the app.
- **Severity:** low (the hooks work inside a component. Code outside a component has no working documented API).
- **Workaround:** the native module also has `preventAutoHideV2(rootTag)` and `hideV2(rootTag)`, which the hooks use. `AppRegistry.setWrapperComponentProvider` gets the root tag before the first render. With it the splash stayed until `hideV2`: screenshots show it, and the system log has the app's `state-change/foreground` right after the hide. Our open PR #808 to react-native-bootsplash works this way.
- **Suggestion:** make the moduleName API work with the `app.json` name, or remove the `app.json` sentence and say it is not for React Native apps. Document an API by root tag that works outside a component, such as `preventAutoHideV2(rootTag)` and `hideV2(rootTag)`.

## FL-35 · The VVD lacks the player client and server modules, and a build puts them back into manifest.toml (2026-10-22)
- **Task:** test a seek fix of react-native-video v7 on the Vega Virtual Device (VVD, SDK 0.24.12112). The test app also has a headless player mode with `@amazon-devices/kepler-player-client` and `kepler-player-server` 2.3.0-rn-83.
- **Steps:** `vega run-app <aarch64 vpkg> -d VirtualDevice`. Then remove the two `[[needs.module]]` entries from `manifest.toml`, and build again.
- **Expected:** the app installs, or the build says that the VVD lacks these modules.
- **Actual:** the install fails with "Module dependency not found". The message goes on: "The Vega Virtual Device is missing modules that are available on a physical device. Test your app using a Fire TV Stick instead". The missing modules are `kepler_player_client_2` and `kepler_player_server_2`. After the entries are removed, the next build writes them back into the source `manifest.toml`: autolinking adds the needs of every package in `node_modules`. The build also says that both packages are "not properly configured", because 2.3.0-rn-83 is not in their `kepler-compatibility.json`.
- **Severity:** low (a VVD test of one screen needs a separate app setup).
- **Workaround:** for a VVD build, move both packages out of `node_modules`, replace the service entry file with a stub and remove the needs from `manifest.toml`. Restore everything after the test. With that, the VVD showed the bug with the old code and the fix with the new code.
- **Suggestion:** ship these modules in the VVD, or let a build option skip them for the VVD. Do not rewrite the source `manifest.toml` during a build without saying so in the output.

## FL-36 · Amazon's RN 0.83 package builds miss their own compatibility file, and the build prints ERROR (2026-10-18, 2026-10-22)
- **Task:** build React Native 0.83 apps with the `-rn-83` packages that npm tags `rn83-alpha`. Vega SDK 0.24.12112, `@amazon-devices/react-native-kepler` 4.0.1.
- **Steps:** install `kepler-adid-retriever@1.0.17-rn-83` and `react-native-async-storage__async-storage@2.1.9000000000-rn-83` (demo app). In a test app, install `kepler-player-client@2.3.0-rn-83`, `kepler-player-server@2.3.0-rn-83` and `headless-task-manager@1.2.8-rn-83.1`. Run `react-native build-vega --build-type Release`.
- **Expected:** Amazon's own 0.83 builds of the packages build without errors. If an error is real, the build stops.
- **Actual:** the build prints "ERROR" and "Validation errors found while scanning node_modules for this application". Then, for each package: "Library <name> is not properly configured. The version is set to <version> but that value is not part of it's 'kepler-compatibility.json' file. This library must be updated to correct the error!" Then the build goes on, makes the package and ends with exit code 0. The `kepler-compatibility.json` of each package lists its version without the `-rn-83` suffix.
- **Severity:** low (the app builds and runs. But the ERROR asks for an update, and real errors in the same output are easy to miss).
- **Workaround:** for the ad ID and async storage, use the latest versions without the suffix: `kepler-adid-retriever` 1.0.18 (it ships Hermes bundles for 0.72 and 0.83) and async-storage 2.1.9000000001. They build without the message. With them the demo on React Native 0.83 passed the full demo run on the stick. The player packages have no such version yet, so ignore the message there. The modules are in the manifest.
- **Suggestion:** list the `-rn-83` versions in their own `kepler-compatibility.json`, or drop the `rn83-alpha` tag when the stable version covers 0.83. Print a warning, not "ERROR", when the build goes on. Say on "Supported Libraries and Services" which version of each package to use on 0.83.

## FL-38 · On React Native 0.83 the first AdIdRetriever read blocks JavaScript for up to 2.6 s (2026-10-23)
- **Task:** show the demo's movie page fast on a cold start and ask for its ad plan with the advertising ID. Same stick, demo app on React Native 0.83, `@amazon-devices/kepler-adid-retriever` 1.0.18.
- **Steps:** read `AdIdRetriever` while the first screen renders. Measure 30 cold launches with `vega exec perf kpi-visualizer --certification --kpi cool-start-latency`. Open the traces of the slow launches.
- **Expected:** the module loads in tens of milliseconds, as on 0.72 (40 ms in the 2026-10-16 run).
- **Actual:** in the traces of the slow launches, `TurboModuleBinding::moduleProvider` for `AmazonAdIdRetrieverTurboModule` took 0.5 to 2.6 s on the JavaScript thread. In that time the system started `com.amazon.admanager.service`. The poster request waited for it. Nothing in the API reference says that the first call waits for a service.
- **Severity:** medium (it delays the first screen of an app that asks for ads with the ID at launch).
- **Workaround:** read `AdIdRetriever` only after the first screen is drawn. The demo's movie page now asks for the ad plan when the poster has loaded. After the change the read comes after fully drawn. Fully drawn P90 went from 6.3 s to 5.5 s (28 counted launches, stdev 1.9 s). The wait itself remains, right after fully drawn: 0.2 to 1.1 s in three traces, so a key pressed then waits. The deferral works because Metro's inline requires, the default in `@react-native/metro-config`, load the module at its first read.
- **Suggestion:** load the module without blocking the JavaScript thread. Or say in the API reference that its first load waits for the ad ID service.

## FL-39 · The accessibility settings package installs React Native 0.60.6 into every app that uses it (2026-10-23)
- **Task:** read the caption and audio description settings in the demo app (React Native 0.83) with `@amazon-devices/kepler-a11y-settings-interface-turbo` 1.0.0.
- **Steps:** `npm install`, then `npm ls react-native` and `npm audit`.
- **Expected:** a TurboModule package installs only what it needs at run time. `@amazon-devices/react-native-w3cmedia` 2.3.2 does so. Its version 2.1.99 still listed `react-native-tscodegen` and `react-native-tscodegen-types` under `dependencies`.
- **Actual:** the package lists `react-native-tscodegen-types` 0.66.0 under `dependencies`, not `devDependencies`. That package depends on `react-native` ^0.60.6. So npm installs a second React Native, 0.60.6, in `node_modules/react-native-tscodegen-types/node_modules`: 130 packages, 47 MB. The package's own code in `dist` never imports `react-native-tscodegen-types`. npm audit and Dependabot then report the old tree in the app. One example is GHSA-7f53-fmmv-mfjv (React Native from 0.59.0 up to 0.62.3). The version `1.0.0-rn-83` (npm tag `rn83-alpha`) has the same dependency.
- **Severity:** low (the old tree is not in the app bundle. But every app that uses the package gets the install size and the alerts).
- **Workaround:** none that keeps the package. This repository explains the alerts in `SECURITY.md`.
- **Suggestion:** move `react-native-tscodegen-types` to `devDependencies`, as w3cmedia 2.3.2 did, or drop it from the published package.

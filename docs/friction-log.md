# Friction log

Platform issues found while building vega-ads on a Fire TV Stick 4K Select (Vega OS 2.0). Each entry has the task, steps, expected and actual results, severity, workaround and a suggestion.

## FL-01 · Sample video URL used across docs returns 403 (11.10.2026)
- **Task:** play a long public MP4 as content in a w3cmedia `VideoPlayer` on Fire TV Stick 4K Select (Vega OS 2.0).
- **Steps:** `player.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'` (a Google sample bucket used in many player samples; in Amazon's `AmazonAppDev/vega-sports-app` it appears only as a commented-out option).
- **Expected:** playback, or a JS `error` with a readable reason.
- **Actual:** black screen. JS got `error` with `code = 4` and an empty `message`. The real cause (`souphttpsrc … Forbidden (403)`) was visible only in the system log at warning level.
- **Severity:** medium (looks like a player or surface bug; cost ~30 min).
- **Workaround:** switched to an archive.org MP4; checked URLs from the Mac with `curl -r 0-1000` first.
- **Suggestion:** pass the HTTP status into `MediaError.message` (e.g. "HTTP 403 Forbidden") so the app can show and report the real cause.

## FL-02 · System log silently drops app `console.log` lines (11.10.2026)
- **Task:** read the app's own `console.log` diagnostics through `vega exec vda shell loggingctl log -f` during video playback.
- **Steps:** log ~5 lines per ad break while two w3cmedia players run.
- **Expected:** all app lines in the log.
- **Actual:** many app lines missing. The log shows `Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`. Most of the 300 lines/s come from the media pipeline (GStreamer/W3CMEDIA info logs) inside the same process, so the app's own lines lose the budget.
- **Severity:** medium (wrong conclusions during debugging: "event never fired").
- **Workaround:** mirrored the log on screen in the app; filtered `[SPIKE]` lines.
- **Suggestion:** separate budgets for JS console and native media logs, or lower media pipeline info logs in production-like builds; document the limit next to `loggingctl`.

## FL-03 · Media controls with two w3cmedia players fail silently unless two separate steps are both done (11.10.2026)
- **Task:** make remote play/pause and "Alexa, pause" control the player the viewer sees (content → ad → content) in a client-side ad insertion (CSAI) app with two w3cmedia players, Fire TV Stick 4K Select, Vega OS 2.0, `@amazon-devices/react-native-w3cmedia` ~2.1.
- **Steps:** A/B test on the device, one change at a time; keys injected with `inputd-cli button_press KEY_PLAYPAUSE` (once during content, once during the ad); result = count of `MediaControlHandler: performing handleTogglePlayPause` in the system log.
  - A. `player.setMediaControlFocus(componentInstance)` on every switch, no manifest entry → 0 commands delivered.
  - B. Manifest `[[extras]] key = "interface.provider"` + `interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"`, no `setMediaControlFocus` → 0.
  - C. Both → commands delivered; during content the content pauses/resumes; during the ad only the ad pauses/resumes; "Alexa, pause" works.
  - D. Neither → 0.
- **Expected:** the CSAI guide for Vega covers media controls for the two-player pattern, or the runtime warns when one of the two steps is missing.
- **Actual:** the CSAI JS guide (implement-csai-js-vega, last modified 13.03.2026) does not mention media controls, `setMediaControlFocus`, Alexa or the manifest entry. The W3C Media "media control" page (last modified 27.01.2026) does say to add manifest entries and call `setMediaControlFocus`, but the manifest snippet is on another page, and in the type definitions `setMediaControlFocus` is marked `@hidden`. With one step missing there is no error or warning; the only hint is `isSessionInForeground :0` in the system log. The remote key reaches the app (`KEY_PLAYPAUSE` in inputd) and is dropped.
- **Severity:** high for ad-supported apps (a basic remote/voice feature silently does nothing; Dolby's patch of the Logix IMA ads manager also fixes "media-control ownership").
- **Workaround:** both steps (variant C); call `setMediaControlFocus` on the ad player at ad start and on the content player at resume. Focus switch takes 197–256 ms.
- **Suggestion:** add a "media controls with two players" section to the CSAI guide, with the manifest snippet; remove `@hidden` from `setMediaControlFocus` in typings; log a warning when `setMediaControlFocus` is called and the manifest has no `IMediaPlaybackServer` (and vice versa).

## FL-04 · Media control docs sample uses a deprecated API (11.10.2026)
- **Task:** get the `IComponentInstance` that `setMediaControlFocus` needs.
- **Steps:** followed the W3C Media "media control" page, which uses `useComponentInstance()`.
- **Expected:** the docs sample uses the current API.
- **Actual:** at run time `useComponentInstance` warns: "deprecated. Update to use getComponentInstance from KeplerAppStateManager instead". The replacement (`useKeplerAppStateManager().getComponentInstance()`) was found only in `.d.ts` files.
- **Severity:** low.
- **Workaround:** `useKeplerAppStateManager().getComponentInstance()`.
- **Suggestion:** update the media control page and samples to the non-deprecated API.

## FL-05 · A video surface turns empty after `ended`; content shows through between two ads (11.10.2026)
- **Task:** play two ads back to back (pod) on two w3cmedia players with two `KeplerVideoSurfaceView`s above the content surface, as the CSAI guide suggests for "seamless back-to-back ad playback".
- **Steps:** ad 1 on surface A; ad 2 prebuffered on surface B (`autoplay=false`, `canplay`); on ad 1 `ended` call `play()` on ad 2 and bring surface B on top when ad 2 fires `playing`.
- **Expected:** ad 1's last frame stays on screen until ad 2 renders (like a paused player keeps its frame).
- **Actual:** phone video, frame by frame: after `ended` surface A is empty and the paused content frame below is visible for ~0.4–0.6 s (time from `play()` to `playing` of a prebuffered player: ~370–450 ms).
- **Severity:** medium (viewer sees the show flash in the middle of an ad pod).
- **Workaround:** start the next ad ~500 ms before the current one ends and let the current one finish hidden; measured: next first frame 85 ms before the previous `ended`, `complete` still accurate.
- **Suggestion:** document in the CSAI guide that a surface does not keep the last frame after `ended`, and give the typical `play()` → first frame latency of a prebuffered player; or add an option to keep the last frame.

## FL-06 · Play/pause key reaches both media controls and JS key handlers (11.10.2026)
- **Task:** decide whether an app (or an ad library) should handle the remote play/pause key itself or rely on Vega Media Controls, Fire TV Stick 4K Select, Vega OS 2.0.
- **Steps:** `useTVEventHandler` logger; `inputd-cli button_press KEY_PLAYPAUSE`; builds with and without the manifest media-controls entries; during content and during an ad.
- **Expected:** one owner per key press: either media controls consume it, or it reaches JS (like Android `onKeyDown` returning true), and docs say which.
- **Actual:** the key always reaches JS (`eventType: 'playpause'`, down and up). With the manifest entries, media controls also pause the focused player (224 ms after key down). Apps that already map `playpause` in their own remote handler (common with spatial navigation libraries) toggle twice; without the entries, media controls do nothing and only the JS handler works, so "Alexa, pause" is lost.
- **Severity:** medium (double toggle or silent loss of voice control, depending on setup).
- **Workaround:** keep the manifest entries and media controls; ignore `playpause` in the app's own key handler while media controls own the player (for ads: while the ad break is playing).
- **Suggestion:** document the routing (key event and media control command both fire), or add a way to mark the key as consumed by media controls.

## FL-07 · Without media controls entries, a legacy player session still pauses the player on play/pause (11.10.2026)
- **Task:** let an app own the remote play/pause key (spatial navigation remote handler) without the media controls manifest entries, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** manifest without `com.amazon.category.kepler.media` / `IMediaPlaybackServer`; no `setMediaControlFocus` call; app toggles the player on `useTVEventHandler` `playpause` key down; live log with `loggingctl log -f`.
- **Expected:** with no media controls declared, the key goes only to the app.
- **Actual:** the key reaches JS, and then inputd's MediaController also handles it when the player session is in foreground: "isSessionInForeground :1", then w3cmedia "Player Session is performing pause operation on Media Player". A paused player is not resumed by the system (session not in foreground), so the app's resume is undone ~450 ms later; the viewer sees play start and stop.
- **Severity:** high for apps with their own remote handling (looks like a broken resume).
- **Workaround:** use the manifest entries and media controls as the only owner of play/pause; ignore `playpause` in the app's own key handler while media controls own the player.
- **Suggestion:** document the legacy player session behaviour (which keys, when it acts) next to the media controls docs, or a way to opt out of it; log which component consumed the key.

## FL-08 · w3cmedia refuses http:// media; the cleartext manifest policy is documented only for WebView (11.10.2026)
- **Task:** play VAST ad media files and a content movie served over plain HTTP on the local network (typical for development, and many ad servers still return `http://` MediaFile URLs), Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `fetch` the VMAP/VAST over `http://<LAN IP>:8080/` (works); set `player.src = 'http://<LAN IP>:8080/ad.mp4'`; read `loggingctl log -f -o cat`.
- **Expected:** playback, or a documented rule that media must use HTTPS, with a clear `MediaError` message.
- **Actual:** `MEDIA_PLAYERV2: MediaUrlSourceImpl.cpp(58) createSourceElement Invalid or insecure URI scheme`, `Could not build sourceBin`; JS only gets a generic error, so the ad fails with VAST error 400 and the content stays black. `fetch` to the same host works. Adding `[network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]` to the manifest makes w3cmedia play it (IP address accepted). The docs describe this section only on the WebView page ("Build Web Apps with WebView", 0.24). The public AmazonAppDev/vega-video-sample has four `http://` `videoUrl` entries (`src/data/rotatorData.json`) and no cleartext section in its manifest (I did not play those entries).
- **Severity:** medium (silent black screen; hard to find without the system log; ad libraries cannot tell "insecure URL" from "broken file").
- **Workaround:** HTTPS for all media; for development, the cleartext allow-list in the app manifest.
- **Suggestion:** document `network-traffic-policy` as an app-wide policy (fetch vs media vs WebView), and put the reason ("cleartext not allowed") into `MediaError.message`.

## FL-09 · setMediaControlFocus blocks the JS thread for 1–2 s on a cold launch (11.10.2026)
- **Task:** start a pre-roll right after app launch and send the impression on the first frame, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** `player.play()`, then at once `player.setMediaControlFocus(componentInstance)` (so the remote and Alexa control the ad); the impression is sent from the `playing` listener; `loggingctl log -f -o cat`.
- **Expected:** `setMediaControlFocus` returns a promise and does not hold the JS thread; `playing` reaches JS a few ms after the native event.
- **Actual:** native `playing` at 21.33 s; JS logs from the media controls setup ("Manifest was parsed", then a 1.2 s gap, then `MediaControlStateUtil` and many `addEventListener` lines); `playing` reached JS at 23.74 s. The impression and `start` pixels were 2.4 s late on the first launch after install (0.5 s on the next launch), and `firstQuartile` came 0.3 s after `start`. With a 5 s first-frame timeout this can also drop the pre-roll.
- **Severity:** medium (wrong ad measurement on cold start; possible lost pre-roll).
- **Workaround:** call `setMediaControlFocus` after the first frame is handled (deferred with `setTimeout(0)`); measured after the change: 143 ms from native `playing` to the impression.
- **Suggestion:** do the media controls setup off the JS thread, or document that the first call is slow and should not be made on a time-critical path.

## FL-10 · "Alexa, next" never reaches the app during an ad, even with "Next" in command_options (11.10.2026)
- **Task:** let the viewer skip a skippable ad by voice, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1, SDK 0.24.
- **Steps:** manifest `IMediaPlaybackServer` with `command_options = ["Next"]` (the "Attributes and features" page says optional commands arrive only when listed); a `KeplerMediaControlHandler` subclass for the ad player with `handleNext` overridden; the ad player's published actions set to PLAY, PAUSE, TOGGLE_PLAY_PAUSE, STOP, NEXT before `setMediaControlFocus` (w3cmedia publishes SEEK, FAST_FORWARD, SKIP_FORWARD… but not NEXT by default); during a skippable ad, past its skip offset, say "Alexa, next" and "Alexa, skip"; every app event mirrored to a server log because the device log drops app lines.
- **Expected:** `handleNext` is called, or a documented reason why not; a table of Alexa phrases → media control commands.
- **Actual:** with the default actions Alexa answers "Next is not supported". With NEXT published Alexa says nothing, and `handleNext` is never called (no app event in four runs). No Vega page maps Alexa phrases to commands.
- **Severity:** medium (voice skip of skippable ads is not possible; "multi-modal" ad UX limited to pause/play).
- **Workaround:** Skip button with D-pad focus; "Alexa, pause/play" works.
- **Suggestion:** publish the Alexa phrase → command table for Vega; deliver Next when listed in `command_options`; let apps set supported actions through a public API (today only `mediaControlStateUtil.capabilities`, an undocumented field).

## FL-11 · Video freezes during an Alexa voice interaction without any media event (11.10.2026)
- **Task:** keep an ad playing correctly while the viewer talks to Alexa, Fire TV Stick 4K Select, Vega OS 2.0, w3cmedia ~2.1.
- **Steps:** during an ad, say "Alexa, next" (or any request); watch the ad's `timeupdate`, `pause`, `playing`, `waiting` events and its tracking pixels.
- **Expected:** a `pause` (or an audio focus / interruption event) when the system takes over, and `playing` when it gives the player back.
- **Actual:** the ad stops advancing for 6–13 s (quartile pixels 6 s and 16 s apart instead of 2.5 s) with no `pause`, `waiting` or `playing` event. An app cannot tell this from a stalled stream: our 10 s stall watchdog ended one ad with VAST error 405 after a voice request.
- **Severity:** medium (ads cut short after a voice request; wrong error reporting to ad servers).
- **Workaround:** two stall timeouts: 10 s after a `waiting` event (real buffering), 30 s when the time stops with no event at all (voice request).
- **Suggestion:** emit `pause`/`playing` (or a documented interruption event) when Alexa takes and returns the media session.

# API reference

## `<VegaAdsPlayer>`

| Prop | Description |
|---|---|
| `source` | `{ uri }` of the content, or `null` to wait. |
| `ads` | `{ vmapUrl }` or `{ breaks: [{ offset, vastUrl }] }`. `null` plays the content without ads. A break given by hand can also have `blockedAdCategories` (IAB codes to leave out) and `sceneSignals` (what the scene before it shows, for the why line). |
| `adId` | `AdIdRetriever` from `@amazon-devices/kepler-adid-retriever`. Optional. |
| `onEnd` | Called when the content and its post-roll are over. |
| `player` | Your own content `VideoPlayer` instead of `source`, or any `PlayerPort` (for example `rnvPlayerPort(player)`, then your app draws the content). The component never releases it. |
| `children` | Your UI over the video, or a function `({ player, ads }) => ...`. |
| `contentSurface` | `false` when your screen draws the content surface itself. Default `true`. |
| `renderOverlay` | `(ads) => ...` your own ad label and Skip button instead of `AdOverlay`. |
| `countdown` | "Ad in N" before each mid-roll (`AdCountdown`). Default `true`. |
| `showWhy` | Show `ui.why` in the built-in overlay: why the break looks as it does ("No Kettlo ad after a scene with injury · Volume matched to the movie"). Default `false`. |
| `adCaptions` | Show the ad's closed caption (`ui.caption`) at the bottom of the built-in overlay. Pass the viewer's caption setting. Default `false`. |
| `pauseAdStyle` | Style of the pause ad, to keep it clear of your own controls. |
| `adStyles` | Your fonts, colours and positions for the parts of the built-in ad UI (`AdStyles`: `label`, `why`, `caption`, `skip`, `skipWaiting`, `skipText`, `skipWaitingText`, `countdown`, `pauseAdLabel`, `pauseAdHint`), on top of the defaults. |
| `style`, `scalingMode` | Layout and w3cmedia scaling mode (default `'fit'`). |
| other | Any `useVegaAds` option below (`onEvent`, `strings`, `adPause`, ...). |

## `useVideoPlayer(uri)`

Returns the content `VideoPlayer` for `uri` once it is initialized (`autoplay` off), `null` before that or while `uri` is `null`. Releases it on unmount or when `uri` changes.

## `useVegaAds(options)`

| Option | Description |
|---|---|
| `source` | `{ vmapUrl }` or `{ breaks: [{ offset, vastUrl }] }`. `null` waits. |
| `contentPlayer` | Your initialized content `VideoPlayer` (`autoplay = false`), or any `PlayerPort`. |
| `macros` | Ad tag macros, for example `adIdMacros(source)` for `IFA` and `LIMITADTRACKING`. |
| `prefetchSeconds` | How early a break is loaded and buffered. Default 15. |
| `countdownSeconds` | How many seconds before a mid-roll `timeline.nextBreakIn` counts down. Default 5. |
| `pauseAdUrl`, `pauseAdDelayMs` | VAST tag of a pause ad (`<NonLinear>` image), and how long the content stays paused before it shows. Default 1500 ms. |
| `contentLoudness` | The content's integrated loudness in LUFS, for example from `ffmpeg -i movie.mp4 -af ebur128 -f null -`. Ads with a louder `loudness` creative extension are turned down to it. |
| `captionLanguage` | The viewer's caption language (BCP 47, for example `'en-US'`). Picks the ad's WebVTT file in that language, else its first WebVTT file. |
| `maxBreakAds`, `maxBreakSeconds` | Caps for every break, also sent as `[BREAKMAXADS]` and `[BREAKMAXDURATION]`. Preloaded pre-roll requests use the macros you pass to `preloadVegaAds`. |
| `avoidRepeats` | `{ withinMs, memory }`: how long a shown creative is not shown again (default 30 minutes), and where to remember it across titles and launches: `{ read, write }` of one string, for example `{ read: () => AsyncStorage.getItem('vega-ads.seen'), write: (v) => AsyncStorage.setItem('vega-ads.seen', v) }` with `@amazon-devices/react-native-async-storage__async-storage`. At most 500 creatives are kept. `false` turns the no-repeat rules off. |
| `mediaFile` | Media file choice: `maxHeight`, `targetBitrateKbps`, or your own `select`. |
| `strings` | Overlay texts. English by default. |
| `backDuringAd` | What Back does during an ad. `'app'` (default): Back goes to your app, which usually closes the player. `'content'`: the break ends and the movie plays on, without skip or close pixels. |
| `adPause` | The viewer may pause ads (remote, voice). Default `true`. With `false`, pause and "Alexa, stop" are ignored and play/pause only plays. A system pause (TV off) still pauses. |
| `mediaControls` | Ad and content players take media controls focus. Default `true`. Keep it on Vega. |
| `contentMediaControlHandler` | Your content media controls handler. It is restored after each break. |
| `onEvent` | Called with IAB events and errors, for logs and analytics. See [Events](#events-onevent). |

## Returned object

| Field | Description |
|---|---|
| `playing` | `true` while an ad is on screen. |
| `ended` | `true` after the content ended and the post-roll, if any, is over. |
| `snapshot` | Current break state: `position` and `total` in the pod, `adTime` and `adDuration` in seconds, `canSkip` and `skipIn`, and `ad`, the ad on screen (`id`, `creativeId`, `title`, `advertiser`, `duration` and more, or `null`). Enough for your own ad label, counter or progress bar. |
| `ad` | The ad on screen, the same as `snapshot.ad`: `id`, `creativeId`, `universalAdId`, `title`, `advertiser`, `duration`, `sequence`, `skipAfter`. `null` outside ads. For example `renderOverlay={(ads) => <Text>{ads.ad?.advertiser}</Text>}`. |
| `ui` | Data for an ad overlay: `label` ("Ad 1 of 3 · 0:12") and its parts `name` and `timeLeft`, `skip`, `why`, `caption`, the VoiceView texts. |
| `timeline` | `marks`: the mid-rolls (`id`, `time` in seconds, `done`) for your timeline. `nextBreakIn`: whole seconds to the next mid-roll in its last `countdownSeconds`, only once its ads are loaded. Otherwise `null`. |
| `surfaces` | Pass to `DualSurfaceView` or `AdSurfaceLayers`. |
| `pauseAd` | The pause ad to draw with `<PauseAd view={ads.pauseAd} />`, or `null`. Back closes it. |
| `closePauseAd()` | Close the pause ad from your own UI. Returns `false` if none is shown. |
| `skip()` | Skip the ad. Returns `false` if skip is not allowed yet. |
| `togglePause()` | Pause or play the ad from your own on-screen button. Not for the remote key. |
| `back()` | Leave the break and return to the content. |

## `preloadVegaAds(ads, options)`

Requests the VMAP (or the manual schedule) and the pre-roll VAST before the player exists. `options`: `adId`, `macros`, `maxBreakAds` and `maxBreakSeconds`, the same as the player's. The next `VegaAdsPlayer` or `useVegaAds` with an equal `ads` object uses the answers once, if they are at most five minutes old. A failed early request is made again. Up to four titles wait at a time. In core, `preloadAds(schedule, { http, clock, macros, maxBreakAds, maxBreakSeconds })` returns the same data for `AdManager.start(schedule, { preloaded })`.

## Events (`onEvent`)

`onEvent(name, info)` gets the event name and its details. `info` has:

- `breakId`: the break of the event. It is the same id as in `break:<id>:...`.
- `ad`: the ad of the event, for ad events such as `impression`, the quartiles, `skip` and `error:<code>`. It has `id`, `creativeId`, `universalAdId`, `title`, `advertiser`, `duration` (seconds), `sequence` (place in the pod) and `skipAfter` (seconds).

```tsx
<VegaAdsPlayer
  source={{ uri }}
  ads={{ vmapUrl }}
  onEvent={(name, info) => {
    if (name === 'impression') analytics.track('ad_seen', { ad: info.ad?.id, break: info.breakId });
  }}
/>
```

`info` is `{}` for events without a break or ad: `vmap:error:<code>`, `error:start`, `content:ended` and the `pauseAd:*` events. In `useStitchedAds` (preview) `info` is always `{}`. The types are `AdEventHandler`, `AdEventInfo` and `AdEventAd`.

| Event | When | react-native-video `AdEvent` |
|---|---|---|
| `impression` | the ad's first frame is on screen | `IMPRESSION` |
| `start`, `firstQuartile`, `midpoint`, `thirdQuartile`, `complete` | IAB progress of the ad | `STARTED`, `FIRST_QUARTILE`, `MIDPOINT`, `THIRD_QUARTILE`, `COMPLETED` |
| `pause`, `resume` | the viewer paused or resumed the ad | `PAUSED`, `RESUMED` |
| `skip` | the viewer pressed Skip | `SKIPPED` |
| `loudness:<dB>` | an ad was turned down by that many dB (negative) to the content's loudness | none |
| `skipped:repeat`, `skipped:advertiser`, `skipped:category`, `skipped:budget` | an ad was left out of a break: the viewer saw it, the break already has it or its advertiser, the break blocks its category, or it does not fit `maxBreakAds` / `maxBreakSeconds` | none |
| `notUsed` | the `notUsed` pixels of that ad were sent | none |
| `pauseAd:impression`, `pauseAd:creativeView`, `pauseAd:overlayViewDuration`, `pauseAd:close` | the pause ad showed, left the screen, or the viewer closed it | none |
| `error:<code>` | an ad failed. `<code>` is the VAST error code (for example 400, 403, 405) | `ERROR` |
| `breakStart` | a break starts: the content pauses for it, before its first ad event | `CONTENT_PAUSE_REQUESTED`, `AD_BREAK_STARTED` |
| `breakEnd` | the break is over and the content resumes | `AD_BREAK_ENDED`, `CONTENT_RESUME_REQUESTED` |
| `content:ended` | the content and the post-roll, if any, are over | `ALL_ADS_COMPLETED` (after the post-roll) |
| `vmap:error:<code>` | the VMAP request failed (VMAP error code) | none |
| `break:<id>:late` | in playback, a break was not ready in time and was skipped (after a seek over it the content waits for its ads instead) | none |
| `break:<id>:empty` | the break had no ad to play: an empty ad response, a failed request, or every ad left out or failing. The content goes on | none (the IMA SDK reports an empty VAST as an `AdError` with code 1009) |
| `break:<id>:interrupted` | the app went to the background (Home) during a break or while it loaded. It is not shown again | none |
| `break:<id>:superseded` | a later seek started another break while this one still loaded. Only the last break plays, and this one's ad player is released | none |
| `standby:unavailable`, `standby:error` | the second ad player could not start. One player is used | none |
| `error:start` | the ad schedule could not be started. The content plays without ads | none |

## Components

| Component | Props |
|---|---|
| `DualSurfaceView` | `surfaces`, `contentPlayer?`, `onContentSurfaceCreated?`, `onContentSurfaceDestroyed?`, `scalingMode?` (default `'fit'`), `style?` |
| `AdSurfaceLayers` | `surfaces`, `scalingMode?` (default `'fit'`), `style?` |
| `AdOverlay` | `ui`, `onSkip`, `showWhy?`, `captions?`, `style?`, `styles?` (`AdStyles`) |
| `AdSkipButton` | `ui`, `onSkip`, `styles?`. Skip for your own overlay: takes the D-pad focus, ignores presses until Skip is allowed. During a non-skippable ad it holds the focus. |
| `AdCountdown` | `nextBreakIn`, `strings?`, `style?`, `styles?`. Takes no D-pad focus. Announces the break once for VoiceView. |
| `PauseAd` | `view` (`ads.pauseAd`), `strings?`, `style?`, `styles?`. The image beside the paused picture (up to 600 px high), "Ad", the QR code if any, "Back closes the ad". Takes no D-pad focus. Announced once for VoiceView. `VegaAdsPlayer` draws it for you. |

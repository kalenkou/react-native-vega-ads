# react-native-vega-ads

Client-side ad insertion (CSAI) for React Native apps on Amazon Vega OS (Fire TV).

`react-native-vega-ads` reads VAST 4 and VMAP 1, plays pre-, mid- and post-rolls on native w3cmedia players, switches between content and ads without a black frame, and sends IAB tracking events. It is for Vega app developers who have their own ad server and need video ads without a vendor SDK. It is open source under Apache-2.0.

> Status: early. The API can still change. The packages are not on npm yet. Tested on one device (see below).

## Why

Vega apps have no ready, open way to play VAST/VMAP ads:

- **No client-side IMA SDK on Vega.** Amazon's [supported libraries](https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html) list Google IMA DAI and FreeWheel, which are server-side or partner services, and no client-side VAST/VMAP SDK. Amazon's CSAI guide shows how to switch between two `VideoPlayer` instances. Ad requests, VAST/VMAP, tracking, pods, skip and error handling are left to each app ("App-specific logic"). See [Client-side ad insertion overview](https://developer.amazon.com/docs/vega/0.24/client-side-ad-insertion-overview-vega.html).
- **Player vendors do not cover it.** The Bitmovin Vega sample states: "No client-side ad support, due to the lack of video element reusability on Vega OS" ([sample README](https://github.com/bitmovin/bitmovin-player-web-sample-fire-tv-vega)).
- **The options that exist are closed.** FreeWheel's Vega AdManager is a beta for FreeWheel customers only ([forum t/5679](https://community.amazondeveloper.com/t/5679)). Logituit Logix Ads Manager runs the IMA HTML5 SDK inside a WebView, VOD only ([forum t/7536](https://community.amazondeveloper.com/t/7536)). Dolby OptiView for Vega uses the same Logix IMA integration, and its sample notes: "Skippable ads are not supported" ([OptiView Vega sample, ads.md](https://github.com/THEOplayer/react-native-optiview-vega-sample/blob/main/doc/ads.md)).
- **Developers ask for it.** "Dealing with ads these days usually means working with VAST XML data" ([forum t/20419](https://community.amazondeveloper.com/t/20419), 25.09.2025).

### Options on Vega today

| | react-native-vega-ads | Logix Ads Manager | Dolby OptiView Vega | FreeWheel AdManager |
|---|---|---|---|---|
| How ads are played | native w3cmedia players | IMA HTML5 SDK in a WebView | through the Logix IMA integration | FreeWheel SDK (beta) |
| Your own VAST/VMAP server | yes | through Google Ad Manager | through Google Ad Manager | FreeWheel ad server |
| Skippable ads | yes, Skip with D-pad focus | not supported in the integration the OptiView sample uses | "not supported" in the sample | not stated |
| Remote and Alexa during ads | yes (media controls) | not stated | not stated | not stated |
| Licence and access | Apache-2.0, open | commercial | commercial | beta, FreeWheel customers |

Sources are in the list above. "Not stated" means the public pages do not say. If you need Google Ad Manager features (programmatic demand, Open Measurement), an IMA-based option fits better; `react-native-vega-ads` fits when you serve your own VAST/VMAP.

### Coming from react-native-video?

On iOS and Android, `react-native-video` plays IMA ads. On Vega there is no official port. The community port [react-native-video-vega](https://github.com/TheWidlarzGroup/react-native-video-vega) (MIT) plays a URL and keeps the ad prop types, but has no ad playback. Amazon's [multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) uses separate `.vega.tsx` player files on w3cmedia. `react-native-vega-ads` adds VAST/VMAP ads to that w3cmedia player: keep your `adTagUrl` (a VMAP tag) and pass it as `source: { vmapUrl }`.

## Features

- VMAP 1, or your own list of VAST tags with times (`start`, seconds, `end`).
- VAST 4 InLine and Wrapper (up to 5 levels), ad pods, skippable ads.
- Two ad players: the next ad is prebuffered while the current one plays.
- No black frame on content → ad → content. The content resumes at the same position.
- No repeats, on by default: a creative is not shown again within 30 minutes, and a break has one copy of each creative and one ad per advertiser. The same creative is found by its Universal Ad ID or by its media file URLs, also when it comes from another ad source under another ad id. A dropped ad sends its `notUsed` pixels (VAST 4.1), so the ad server can use it elsewhere. Without more setup the rules hold for one piece of content. With `avoidRepeats.memory` (one AsyncStorage key, for example) they hold for the household across titles and app launches. Only creative ids, media URLs and times are stored, on the device; no viewer ID is needed.
- Pause ads (IAB CTV Ad Portfolio): when the viewer pauses the content, a still image from a VAST `<NonLinear>` shows beside the picture after 1.5 s, without sound, and goes away when the content plays or the viewer presses Back. Never when a break pauses the content. A QR code comes from the IAB `tl_qrcode` extension. Tracking: impression, `creativeView`, `overlayViewDuration`, `close`. Tested on a Fire TV Stick: all four pixels arrive, Back closes the ad and the app stays on the player. `pauseAdStyle` keeps it clear of your controls, for example `{ top: 100, bottom: 220 }`.
- Break context: a break can block ad categories, for example cars right after a car crash. The list comes from the VMAP (`<vmap:Extension type="vega-ads:context"><BlockedAdCategories>1551 1571</BlockedAdCategories>`, IAB Ad Product Taxonomy codes, written by `make-vmap`) or with a break given by hand (`blockedAdCategories`). An ad whose VAST `<Category>` is blocked is left out with VAST error 205, the code VAST 4.1 gives a category that a wrapper's `BlockedAdCategories` does not allow; the app hears `skipped:category`.
- Never louder than the movie: with `contentLoudness` (the content's integrated loudness in LUFS, EBU R128), an ad that is louder is turned down to it through the player volume, never up. VAST 4.x has no loudness field, so the ad's own loudness comes in a creative extension, `<CreativeExtension type="loudness"><IntegratedLoudness unit="LUFS">-16.0</IntegratedLoudness></CreativeExtension>`; `make-vmap`'s `buildVast` writes it. Event `loudness:<dB>`.
- Short breaks, if you want them: `maxBreakAds` and `maxBreakSeconds` cap every break on the device (an ad that would end later is not started) and go to the ad server as the VAST 4.2 macros `[BREAKMAXADS]` and `[BREAKMAXDURATION]`. Ads left out send their `notUsed` pixels.
- IAB tracking: impression, start, quartiles, complete, pause, resume, skip, error codes.
- Macros for the Fire TV advertising ID and the user's tracking choice (`IFA`, `LIMITADTRACKING`).
- Remote and Alexa play/pause during ads. Seek, skip and speed commands are blocked during an ad.
- 10-foot overlay: "Ad 1 of 3 · 0:12", a Skip button with D-pad focus, VoiceView announcements: each ad with its length and when Skip comes ("Ad 1 of 2, 15 seconds, you can skip in 5 seconds"), then "You can skip the ad now" when it does.
- Back during an ad returns to the content.
- Home during an ad releases the ad players, as Amazon requires for apps in the background. On return the content continues; the interrupted break is not shown again.
- Errors and timeouts never stop playback: the content continues. An ad that shows no frame in 5 s, buffers for 10 s, or stops with no media event for 30 s is skipped with VAST error 405. The long silent timeout covers Alexa requests: Fire TV stops the picture without an event while the viewer talks.
- Pure-JS XML parsing (`@xmldom/xmldom`). You can pass your own parser.

### Measured on a real device

Fire TV Stick 4K Select, Vega OS 2.0, 11.10.2026. Details: [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md).

| Check | Result |
|---|---|
| Switch content → ad | 56–151 ms, no dark frame on video at ~30 fps |
| Content resume position | where it paused, within 0.25 s; a seek back only above that (a seek re-buffers) |
| Mid-roll prefetch | pod of 3 ads ready in 1.6 s, 15 s before the break |
| Gap between ads in a pod | next ad's first frame 64–85 ms before the previous ad ends |
| Tracking pixels | impression + 5 events per ad, all HTTP 200 |
| Memory, 9 breaks × 3 ads in 11 min | PSS peak 91 MB, then flat at 65–68 MB (Amazon KPI: < 400 MiB) |
| Remote play/pause and "Alexa, pause/play" | pass during ads and content, with the manifest entries below |
| Media controls focus switch | 197–217 ms |
| VAST parse, 34.4 KB, Release build | ~49 ms text → DOM, ~11 ms DOM → model (median of 30) |
| Cold launch: ad's first frame → impression pixel | 143 ms |
| Play → pre-roll's first frame, ad server answering in 600 ms per request (10 cold launches each) | median 2.4 s without preload, 1.7 s with `preloadVegaAds` on the title page |
| Phone video, content → pod of 3 → content | no black frame, no content frame between ads |
| Cold launch, launch → first frame (30 launches, `kpi-visualizer --certification`) | mean 2.39 s, P90 3.35 s. Amazon's target is 1.5 s; Amazon's own empty template gets a mean of 2.07 s on this stick. Fully drawn: P90 3.36 s (target: 8 s) |

## Quick start

### 1. Install

The packages are not published yet. Build and pack them from this repository:

```sh
npm ci
npm pack ./packages/core ./packages/vega
```

Then, in your app, install the two `.tgz` files: `npm install --no-save path/to/*.tgz`. After the npm release this becomes `npm install react-native-vega-ads`.

Peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia` and `@amazon-devices/react-native-kepler`. Your Vega app already has them. The Amazon packages are marked optional, so `react-native-ads-core` also installs in non-Vega projects.

### 2. Add entries to `manifest.toml`

These entries are **required**. Without them, remote resume and Alexa do not work during ads (tested on the device).

```toml
[[components.interactive]]
id = "com.example.app.main"
# ...
# Media category: lets Vega media controls (remote, Alexa) reach your players.
categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]

# Advertising ID service: without it the ID service reports "do not track" for every user.
[[wants.service]]
id = "com.amazon.admanager.service.main"

# Media playback server: without it media controls commands are not delivered.
[[extras]]
key = "interface.provider"
component-id = "com.example.app.main"

[extras.value.application]
[[extras.value.application.interface]]
interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"
command_options = []
attribute_options = []
features = []
```

**Media URLs must be HTTPS.** The w3cmedia player refuses `http://` media with "Invalid or insecure URI scheme" in the system log; the app gets only a generic error. Many ad servers still return `http://` media files, so check your VAST. For a development server, list it in the manifest (an IP address works):

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.20"]
```

Keep the usual w3cmedia services (`com.amazon.media.server`, `com.amazon.media.playersession.service` and others) as in any Vega video app. A full example is in [`apps/spike/manifest.toml`](apps/spike/manifest.toml).

### 3. Play content with ads

One component creates the content player, draws the video surfaces and the ad overlay, and fills the Fire TV advertising ID:

```tsx
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { VegaAdsPlayer } from 'react-native-vega-ads';

export function PlayerScreen({ uri, vmapUrl, onClose }: { uri: string; vmapUrl: string; onClose: () => void }) {
  return <VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }} adId={AdIdRetriever} onEnd={onClose} />;
}
```

Remote and Alexa play/pause work through media controls. `onEnd` runs when the content and its post-roll are over. `adId` is optional; without it no ID is sent.

Mid-rolls are marked for your timeline (`ads.timeline.marks`), and "Ad in 5" shows before each one, so a break never comes as a surprise.

Start the ad requests on the title's page, so after Play the pre-roll only has to buffer:

```tsx
import { preloadVegaAds } from 'react-native-vega-ads';

useEffect(() => preloadVegaAds({ vmapUrl }, { adId: AdIdRetriever }), [vmapUrl]);
```

The player with the same `ads` uses the answers once, within five minutes; otherwise it asks the ad server itself. Later breaks are requested during playback, as before.

### Customise any part

Every part of `<VegaAdsPlayer>` can be replaced; the ads keep working.

Your own controls over the video (hidden during ads):

```tsx
<VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }}>
  {({ player, ads }) => !ads.playing && <MyControls player={player} />}
</VegaAdsPlayer>
```

Your own player, for example the `VideoPlayer` that Shaka plays through. Create it as usual (initialized, `autoplay` off, source set); the component uses it and never releases it:

```tsx
<VegaAdsPlayer player={myVideoPlayer} ads={{ vmapUrl }} />
```

Your own content surface (the screen already draws one): the component adds only the ad surfaces above it.

```tsx
<VegaAdsPlayer player={myVideoPlayer} ads={{ vmapUrl }} contentSurface={false}>
  <MyPlayerScreen />
</VegaAdsPlayer>
```

Your own ad label and Skip button: `renderOverlay={(ads) => <MyAdOverlay ui={ads.ui} onSkip={ads.skip} />}`. Keep the D-pad focus on it during ads.

### Your own player UI, with the hook

When your screen has its own controls, use the hook and the components. `useVideoPlayer` creates the content `VideoPlayer` (initialized, `autoplay` off) and releases it when the screen closes:

```tsx
import { AdOverlay, DualSurfaceView, useVegaAds, useVideoPlayer } from 'react-native-vega-ads';

export function PlayerScreen({ uri, vmapUrl }: { uri: string; vmapUrl: string }) {
  const player = useVideoPlayer(uri);
  const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: player });

  return (
    <>
      <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} />
      {!ads.playing && <YourControls player={player} />}
      <AdOverlay ui={ads.ui} onSkip={ads.skip} />
    </>
  );
}
```

The hook starts the content after the pre-roll, or at once if there is none. Hide your controls while `ads.playing` is true.

Without VMAP, pass a list of breaks (`ads={...}` on the component, `source:` in the hook):

```ts
{ breaks: [{ offset: 'start', vastUrl }, { offset: 600, vastUrl }, { offset: 'end', vastUrl }] }
```

With a post-roll, wait for `ads.ended` before you leave the screen at the end of the content.

To fill the Fire TV advertising ID macros (`IFA`, `IFATYPE`, `LIMITADTRACKING`):

```ts
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { adIdMacros, vegaAdIdSource } from 'react-native-vega-ads';

const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: player, macros: adIdMacros(vegaAdIdSource(AdIdRetriever)) });
```

When the user opts out of interest-based ads, or the ID service fails, the ID is not sent and `LIMITADTRACKING` is `1`.

A full integration into Amazon's sample app (Shaka, MP4 and DASH) is in [`examples/vega-video-sample`](examples/vega-video-sample).

### If your screen already renders the content surface

Some apps own their content surface, for example a Shaka player screen. Use `AdSurfaceLayers` instead of `DualSurfaceView`. Place it above your surface, over the same area. It adds only the two ad surfaces.

```tsx
<View style={{ flex: 1 }}>
  <YourContentSurface />
  <AdSurfaceLayers surfaces={ads.surfaces} />
  <AdOverlay ui={ads.ui} onSkip={ads.skip} />
</View>
```

Pass the `VideoPlayer` that Shaka plays through as `contentPlayer`.

### If your app plays with react-native-video v7

`rnvPlayerPort(player)` turns a react-native-video v7 `VideoPlayer` into the content player for the ads, through its public API (no dependency on react-native-video). Your `<VideoView>` shows the content; the component adds the ad surfaces and the overlay:

```tsx
import { useVideoPlayer, VideoView } from 'react-native-video';
import { rnvPlayerPort, VegaAdsPlayer } from 'react-native-vega-ads';

const player = useVideoPlayer({ uri }); // do not call play() here: the ads start the content
const content = useMemo(() => rnvPlayerPort(player), [player]);

<VegaAdsPlayer player={content} ads={{ vmapUrl }} adId={AdIdRetriever}>
  {({ ads }) => <VideoView player={player} style={StyleSheet.absoluteFill} />}
</VegaAdsPlayer>
```

Hide your controls while `ads.playing`: react-native-video reports `readyToPlay` during the pre-roll. react-native-video needs a Vega backend for this; tested on a Fire TV Stick with a prototype backend (pre-roll, pod, seek and events after the breaks).

### If your app has its own remote handler (spatial navigation)

On Vega, the play/pause key reaches both media controls and your JS key handler. Media controls already pause and resume the ad. So ignore `playpause` in your handler while `ads.playing` is true. Otherwise the ad toggles twice.

```ts
useTVEventHandler((event) => {
  if (event.eventType === 'playpause' && ads.playing) {
    return; // media controls handle the ad
  }
  // your normal handling
});
```

## API reference

### `<VegaAdsPlayer>`

| Prop | Description |
|---|---|
| `source` | `{ uri }` of the content, or `null` to wait. |
| `ads` | `{ vmapUrl }` or `{ breaks: [{ offset, vastUrl }] }`. `null` plays the content without ads. |
| `adId` | `AdIdRetriever` from `@amazon-devices/kepler-adid-retriever`. Optional. |
| `onEnd` | Called when the content and its post-roll are over. |
| `player` | Your own content `VideoPlayer` instead of `source`, or any `PlayerPort` (for example `rnvPlayerPort(player)`; then your app draws the content). The component never releases it. |
| `children` | Your UI over the video, or a function `({ player, ads }) => ...`. |
| `contentSurface` | `false` when your screen draws the content surface itself. Default `true`. |
| `renderOverlay` | `(ads) => ...` your own ad label and Skip button instead of `AdOverlay`. |
| `countdown` | "Ad in N" before each mid-roll (`AdCountdown`). Default `true`. |
| `style`, `scalingMode` | Layout and w3cmedia scaling mode (default `'fit'`). |
| other | Any `useVegaAds` option below (`onEvent`, `strings`, `adPause`, ...). |

### `useVideoPlayer(uri)`

Returns the content `VideoPlayer` for `uri` once it is initialized (`autoplay` off), `null` before that or while `uri` is `null`. Releases it on unmount or when `uri` changes.

### `useVegaAds(options)`

| Option | Description |
|---|---|
| `source` | `{ vmapUrl }` or `{ breaks: [{ offset, vastUrl }] }`. `null` waits. |
| `contentPlayer` | Your initialized content `VideoPlayer` (`autoplay = false`), or any `PlayerPort`. |
| `macros` | Ad tag macros, for example `adIdMacros(source)` for `IFA` and `LIMITADTRACKING`. |
| `prefetchSeconds` | How early a break is loaded and buffered. Default 15. |
| `countdownSeconds` | How many seconds before a mid-roll `timeline.nextBreakIn` counts down. Default 5. |
| `pauseAdUrl`, `pauseAdDelayMs` | VAST tag of a pause ad (`<NonLinear>` image), and how long the content stays paused before it shows. Default 1500 ms. |
| `contentLoudness` | The content's integrated loudness in LUFS, for example from `ffmpeg -i movie.mp4 -af ebur128 -f null -`. Ads with a louder `loudness` creative extension are turned down to it. |
| `maxBreakAds`, `maxBreakSeconds` | Caps for every break, also sent as `[BREAKMAXADS]` and `[BREAKMAXDURATION]`. Preloaded pre-roll requests use the macros you pass to `preloadVegaAds`. |
| `avoidRepeats` | `{ withinMs, memory }`: how long a shown creative is not shown again (default 30 minutes), and where to remember it across titles and launches: `{ read, write }` of one string, for example `{ read: () => AsyncStorage.getItem('vega-ads.seen'), write: (v) => AsyncStorage.setItem('vega-ads.seen', v) }` with `@amazon-devices/react-native-async-storage__async-storage`. At most 500 creatives are kept. `false` turns the no-repeat rules off. |
| `mediaFile` | Media file choice: `maxHeight`, `targetBitrateKbps`, or your own `select`. |
| `strings` | Overlay texts. English by default. |
| `handleBack` | Back during an ad returns to the content. Default `true`. |
| `adPause` | The viewer may pause ads (remote, voice). Default `true`. |
| `mediaControls` | Ad and content players take media controls focus. Default `true`; keep it on Vega. |
| `contentMediaControlHandler` | Your content media controls handler; restored after each break. |
| `onEvent` | Called with IAB events and errors, for logs and analytics. |

### Returned object

| Field | Description |
|---|---|
| `playing` | `true` while an ad is on screen. |
| `ended` | `true` after the content ended and the post-roll, if any, is over. |
| `snapshot` | Current break state: ad position, total, time, skip state. |
| `ui` | Data for `AdOverlay`: label, skip button, announcement. |
| `timeline` | `marks`: the mid-rolls (`id`, `time` in seconds, `done`) for your timeline. `nextBreakIn`: whole seconds to the next mid-roll in its last `countdownSeconds`, only once its ads are loaded; otherwise `null`. |
| `surfaces` | Pass to `DualSurfaceView` or `AdSurfaceLayers`. |
| `pauseAd` | The pause ad to draw with `<PauseAd view={ads.pauseAd} />`, or `null`. Back closes it. |
| `closePauseAd()` | Close the pause ad from your own UI. Returns `false` if none is shown. |
| `skip()` | Skip the ad. Returns `false` if skip is not allowed yet. |
| `togglePause()` | Pause or play the ad from your own on-screen button. Not for the remote key. |
| `back()` | Leave the break and return to the content. |

### `preloadVegaAds(ads, options)`

Requests the VMAP (or the manual schedule) and the pre-roll VAST before the player exists. `options`: `adId` and `macros`, the same as the player's. The next `VegaAdsPlayer` or `useVegaAds` with an equal `ads` object uses the answers once, if they are at most five minutes old; a failed early request is made again. Up to four titles wait at a time. In core, `preloadAds(schedule, { http, clock, macros })` returns the same data for `AdManager.start(schedule, { preloaded })`.

### Events (`onEvent`)

| Event | When | react-native-video `AdEvent` |
|---|---|---|
| `impression` | the ad's first frame is on screen | `IMPRESSION` |
| `start`, `firstQuartile`, `midpoint`, `thirdQuartile`, `complete` | IAB progress of the ad | `STARTED`, `FIRST_QUARTILE`, `MIDPOINT`, `THIRD_QUARTILE`, `COMPLETED` |
| `pause`, `resume` | the viewer paused or resumed the ad | `PAUSED`, `RESUMED` |
| `skip` | the viewer pressed Skip | `SKIPPED` |
| `loudness:<dB>` | an ad was turned down by that many dB (negative) to the content's loudness | – |
| `skipped:repeat`, `skipped:advertiser`, `skipped:category`, `skipped:budget` | an ad was left out of a break: the viewer saw it, the break already has it or its advertiser, the break blocks its category, or it does not fit `maxBreakAds` / `maxBreakSeconds` | – |
| `notUsed` | the `notUsed` pixels of that ad were sent | – |
| `pauseAd:impression`, `pauseAd:creativeView`, `pauseAd:overlayViewDuration`, `pauseAd:close` | the pause ad showed, left the screen, or the viewer closed it | – |
| `error:<code>` | an ad failed; `<code>` is the VAST error code (for example 400, 403, 405) | `ERROR` |
| `breakEnd` | the break is over and the content resumes | `AD_BREAK_ENDED`, `CONTENT_RESUME_REQUESTED` |
| `content:ended` | the content and the post-roll, if any, are over | `ALL_ADS_COMPLETED` (after the post-roll) |
| `vmap:error:<code>` | the VMAP request failed (VMAP error code) | – |
| `break:<id>:late` | a break was not ready in time and was skipped | – |
| `break:<id>:interrupted` | the app went to the background (Home) during a break or while it loaded; it is not shown again | – |
| `standby:unavailable`, `standby:error` | the second ad player could not start; one player is used | – |
| `error:start` | the ad schedule could not be started; the content plays without ads | – |

### Components

| Component | Props |
|---|---|
| `DualSurfaceView` | `surfaces`, `contentPlayer?`, `onContentSurfaceCreated?`, `onContentSurfaceDestroyed?`, `scalingMode?` (default `'fit'`), `style?` |
| `AdSurfaceLayers` | `surfaces`, `scalingMode?` (default `'fit'`), `style?` |
| `AdOverlay` | `ui`, `onSkip`, `style?` |
| `AdCountdown` | `nextBreakIn`, `strings?`, `style?`. Takes no D-pad focus; announces the break once for VoiceView. |
| `PauseAd` | `view` (`ads.pauseAd`), `strings?`, `style?`. The image beside the paused picture (up to 600 px high), "Ad", the QR code if any, "Back closes the ad". Takes no D-pad focus; announced once for VoiceView. `VegaAdsPlayer` draws it for you. |

## Architecture

Two packages, each for its own user:

| Package | What it does | Who installs it |
|---|---|---|
| `react-native-vega-ads` | Vega integration: `useVegaAds`, surfaces, overlay, media controls, `W3cPlayerAdapter` | Vega apps with ads (this is the one to install) |
| `react-native-ads-core` | VAST/VMAP requests, media file choice, IAB tracking, break schedule, pods, session state. No player code | installed with `react-native-vega-ads`; on its own when you need only VAST/VMAP and tracking |

`core` never imports a player SDK, `fetch` or timers. It talks to the platform through ports: `PlayerPort`, `HttpPort` and `ClockPort`.

Only the Vega adapter (`W3cPlayerAdapter`, w3cmedia) exists today, and only it is tested on a device. The core tests run against a fake player that follows w3cmedia's behaviour as measured on the stick. To try another player or platform, implement `PlayerPort`:

```ts
interface PlayerPort {
  initialize(): Promise<void>;
  attachSurface(handle: string): void;
  detachSurface(handle: string): void;
  setAutoplay(autoplay: boolean): void;
  setSrc(url: string): void;
  setMuted(muted: boolean): void;
  play(): Promise<void>;
  pause(): void;
  getCurrentTime(): number; // seconds
  setCurrentTime(seconds: number): void;
  getDuration(): number;
  getErrorMessage(): string | undefined;
  takeMediaControlFocus(): Promise<void>;
  on(event: 'canplay' | 'playing' | 'pause' | 'timeupdate' | 'ended' | 'error', listener: () => void): () => void;
  deinitialize(): Promise<void>;
}
```

Then pass your adapter as `contentPlayer`, or use `AdManager` from `react-native-ads-core` directly. `W3cPlayerAdapter` is the reference implementation.

## Compatibility

| Vega SDK | React Native | Status |
|---|---|---|
| 0.23 | 0.72 | Verified on Fire TV Stick 4K Select, Vega OS 2.0 (`apps/spike`) |
| 0.24 | 0.83 | Verified on the same device in Amazon's vega-video-sample with Shaka (`examples/vega-video-sample`) |

The device reports Vega OS 2.0 (`/etc/os-release`: "OS 2.0 (TV Ship/515)", read on 11.10.2026). The Vega Virtual Device of SDK 0.24 runs Vega OS 1.2.

## Tools

- [`tools/demo-ads`](tools/demo-ads) draws three demo ad creatives (invented brands, no third-party footage) and serves them with VAST, VMAP and a pixel log on the local network.
- [`tools/pixel-collector`](tools/pixel-collector) collects tracking pixels on AWS Lambda and DynamoDB.
- [`tools/make-vmap`](tools/make-vmap) finds mid-roll points in a video and writes a VMAP file for `react-native-vega-ads`: with Amazon Rekognition (shot cuts, black frames, credits), or on your computer with ffmpeg (shot cuts, silent black frames) and, optionally, whisper.cpp, so no break cuts a line of dialogue.
- [`apps/demo`](apps/demo) is a small Vega app on `<VegaAdsPlayer>`: a movie page that preloads the ads, and a player with break marks, "Ad in 5", Skip and Back.

## Development

```sh
npm ci
npm run check   # lint, types and all tests
```

## Amazon requirements

How the library meets the Appstore advertising policy, the Advertising ID policy and the Fire TV / Vega test criteria (ad fraud, audio focus, Home, Back, Alexa during ads, opt-out): [`docs/amazon-requirements.md`](docs/amazon-requirements.md).

## Known limitations

- **DRM.** The first Vega devices support only one secure video decoder ([media player requirements](https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html)). If both content and ads are DRM-protected, the second player cannot decode at the same time. Use clear (non-DRM) ad creatives.
- **1 GB devices.** All current Vega sticks have 1 GB RAM. `react-native-vega-ads` uses two ad players. Amazon's guide recommends one ad player on devices with limited memory or decoders. If the second ad player cannot start or fails, `react-native-vega-ads` continues with one ad player; the gap between ads in a pod is then longer. Test on your target devices.
- **Amazon Publisher Services (APS).** Amazon's [advertising policy](https://developer.amazon.com/docs/policy-center/amazon-appstore-advertising.html) can require large ad-supported Fire TV apps to give 30% of ad impressions to APS. `react-native-vega-ads` does not integrate APS. Check if the rule applies to your app.
- **HTTPS media only**, unless the host is in the manifest's cleartext list (see Quick start).
- **No VPAID or SIMID.** Interactive ads are not supported.
- **NonLinear: pause ads only** (a static image). No overlay or squeezeback during playback, no Companion ads.
- **No SSAI.** `react-native-vega-ads` is client-side only.
- **XML.** Vega has no `DOMParser`, and native XML modules are not available. The library parses with pure JS (`@xmldom/xmldom`); `installDOMParser()` from `react-native-ads-core` adds a global `DOMParser` for other libraries. Pure-JS parsers such as `fast-xml-parser` also run on Vega. A 34.4 KB VAST takes about 60 ms on the JS thread. Ads load before the break, so the viewer does not wait. You can pass your own parser.

## Friction log

While building `react-native-vega-ads`, I logged platform issues with steps, expected and actual results, and suggestions. Full log: [`docs/friction-log.md`](docs/friction-log.md). Main points:

- A Google sample video URL used in many player samples returns HTTP 403. The JS error has code 4 and an empty message; the cause is only in the system log.
- The system log drops app `console.log` lines above 300 lines per second. Media pipeline logs use most of that budget.
- Media controls with two players need both the manifest entry and `setMediaControlFocus`. With one step missing, nothing works and nothing is logged. The CSAI guide does not mention media controls.
- The media control docs sample uses a deprecated API (`useComponentInstance`).
- A video surface turns empty after `ended`, so content shows through between two ads for ~0.5 s. `react-native-vega-ads` starts the next ad ~500 ms early to hide this.
- The play/pause key reaches both media controls and JS key handlers. Apps with their own remote handler toggle twice.
- Without the media controls entries, a legacy player session still pauses a playing player on play/pause, and undoes an app's own resume.
- The w3cmedia player refuses `http://` media; the manifest's cleartext list fixes it, but it is documented only for WebView.
- On a cold launch, `setMediaControlFocus` blocks the JS thread for 1–2 s. Called right after `play()`, it delayed the impression; `react-native-vega-ads` now takes media controls focus after the first frame.
- "Alexa, next" and "Alexa, skip" never reach the app during an ad, so voice Skip cannot be offered.
- During an Alexa request the video stops with no media event; an app cannot tell it from a stalled stream.
- The video sample's DRM title never asks for the hardware-secure path: it compares a boolean with the string `'true'`.
- The Vega Virtual Device docs list other media keys than the SDK's keyboard mapping.
- There is no table of Alexa phrases to media controls commands for Vega.

## Credits

Device tests and the demo use *Tears of Steel*, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0. Soundtrack (C) Joram Letwory – www.tearsofsteel.org, CC BY-ND 3.0. The demo's second title is *Sintel*, © copyright Blender Foundation | [durian.blender.org](https://durian.blender.org), CC BY 3.0. The demo ads use the Inter font (SIL Open Font License).

## License

Apache-2.0

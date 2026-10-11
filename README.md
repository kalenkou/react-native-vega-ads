# vega-ads

Client-side ad insertion (CSAI) for React Native apps on Amazon Vega OS (Fire TV).

`vega-ads` reads VAST 4 and VMAP 1, plays pre-, mid- and post-rolls on native w3cmedia players, switches between content and ads without a black frame, and sends IAB tracking events. It is for Vega app developers who have their own ad server and need video ads without a vendor SDK. It is open source under Apache-2.0.

> Status: early. The API can still change. The packages are not on npm yet. Tested on one device (see below).

## Why

Vega apps have no ready, open way to play VAST/VMAP ads:

- **Google IMA is not available on Vega.** Amazon's CSAI guide shows how to switch between two `VideoPlayer` instances. Ad requests, VAST/VMAP, tracking, pods, skip and error handling are left to each app ("App-specific logic"). See [Client-side ad insertion overview](https://developer.amazon.com/docs/vega/0.24/client-side-ad-insertion-overview-vega.html).
- **Player vendors do not cover it.** The Bitmovin Vega sample states: "No client-side ad support, due to the lack of video element reusability on Vega OS" ([sample README](https://github.com/bitmovin/bitmovin-player-web-sample-fire-tv-vega)).
- **The options that exist are closed.** FreeWheel's Vega AdManager is a beta for FreeWheel customers only ([forum t/5679](https://community.amazondeveloper.com/t/5679)). Logituit Logix Ads Manager runs the IMA HTML5 SDK inside a WebView, VOD only ([forum t/7536](https://community.amazondeveloper.com/t/7536)). Dolby OptiView for Vega uses the same Logix IMA integration, and its sample notes: "Skippable ads are not supported" ([OptiView Vega sample, ads.md](https://github.com/THEOplayer/react-native-optiview-vega-sample/blob/main/doc/ads.md)).
- **Developers ask for it.** "Dealing with ads these days usually means working with VAST XML data" ([forum t/20419](https://community.amazondeveloper.com/t/20419), 25.09.2025).

### Options on Vega today

| | vega-ads | Logix Ads Manager | Dolby OptiView Vega | FreeWheel AdManager |
|---|---|---|---|---|
| How ads are played | native w3cmedia players | IMA HTML5 SDK in a WebView | through the Logix IMA integration | FreeWheel SDK (beta) |
| Your own VAST/VMAP server | yes | through Google Ad Manager | through Google Ad Manager | FreeWheel ad server |
| Skippable ads | yes, Skip with D-pad focus | not supported in the integration the OptiView sample uses | "not supported" in the sample | not stated |
| Remote and Alexa during ads | yes (media controls) | not stated | not stated | not stated |
| Licence and access | Apache-2.0, open | commercial | commercial | beta, FreeWheel customers |

Sources are in the list above. "Not stated" means the public pages do not say. If you need Google Ad Manager features (programmatic demand, Open Measurement), an IMA-based option fits better; `vega-ads` fits when you serve your own VAST/VMAP.

### Coming from react-native-video?

On iOS and Android, `react-native-video` plays IMA ads. On Vega there is no official port. The community port [react-native-video-vega](https://github.com/TheWidlarzGroup/react-native-video-vega) (MIT) plays a URL and keeps the ad prop types, but has no ad playback. Amazon's [multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) uses separate `.vega.tsx` player files on w3cmedia. `vega-ads` adds VAST/VMAP ads to that w3cmedia player: keep your `adTagUrl` (a VMAP tag) and pass it as `source: { vmapUrl }`.

## Features

- VMAP 1, or your own list of VAST tags with times (`start`, seconds, `end`).
- VAST 4 InLine and Wrapper (up to 5 levels), ad pods, skippable ads.
- Two ad players: the next ad is prebuffered while the current one plays.
- No black frame on content → ad → content. The content resumes at the same position.
- IAB tracking: impression, start, quartiles, complete, pause, resume, skip, error codes.
- Macros for the Fire TV advertising ID and the user's tracking choice (`IFA`, `LIMITADTRACKING`).
- Remote and Alexa play/pause during ads. Seek, skip and speed commands are blocked during an ad.
- 10-foot overlay: "Ad 1 of 3 · 0:12", a Skip button with D-pad focus, VoiceView announcements.
- Back during an ad returns to the content.
- Home during an ad releases the ad players, as Amazon requires for apps in the background. On return the content continues; the interrupted break is not shown again.
- Errors and timeouts never stop playback: the content continues. An ad that shows no frame in 5 s, buffers for 10 s, or stops with no media event for 30 s is skipped with VAST error 405. The long silent timeout covers Alexa requests: Fire TV stops the picture without an event while the viewer talks.
- Pure-JS XML parsing (`@xmldom/xmldom`). You can pass your own parser.

### Measured on a real device

Fire TV Stick 4K Select, Vega OS 2.0, 11.10.2026. Details: [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md).

| Check | Result |
|---|---|
| Switch content → ad | 56–151 ms, no dark frame on video at ~30 fps |
| Content resume position | drift 0.00 s on every break |
| Mid-roll prefetch | pod of 3 ads ready in 1.6 s, 15 s before the break |
| Gap between ads in a pod | next ad's first frame 64–85 ms before the previous ad ends |
| Tracking pixels | impression + 5 events per ad, all HTTP 200 |
| Memory, 9 breaks × 3 ads in 11 min | PSS peak 91 MB, then flat at 65–68 MB (Amazon KPI: < 400 MiB) |
| Remote play/pause and "Alexa, pause/play" | pass during ads and content, with the manifest entries below |
| Media controls focus switch | 197–217 ms |
| VAST parse, 34.4 KB, Release build | ~49 ms text → DOM, ~11 ms DOM → model (median of 30) |
| Cold launch: ad's first frame → impression pixel | 143 ms |
| Phone video, content → pod of 3 → content | no black frame, no content frame between ads |

## Quick start

### 1. Install

The packages are not published yet. Build and pack them from this repository:

```sh
npm ci
npm pack ./packages/vast ./packages/core ./packages/vega
```

Then, in your app, install the three `.tgz` files: `npm install --no-save path/to/vega-ads-*.tgz`. After the npm release this becomes `npm install @vega-ads/vega @vega-ads/core`.

Peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia` and `@amazon-devices/react-native-kepler`. Your Vega app already has them. The Amazon packages are marked optional, so `@vega-ads/core` also installs in non-Vega projects.

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

### 3. Use the hook

Create your content `VideoPlayer` as usual, with `autoplay = false`. The hook starts it after the pre-roll, or at once if there is none.

```tsx
import { useEffect, useState } from 'react';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import { AdOverlay, DualSurfaceView, useVegaAds } from '@vega-ads/vega';

export function PlayerScreen({ contentUrl, vmapUrl }: { contentUrl: string; vmapUrl: string }) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);

  useEffect(() => {
    const created = new VideoPlayer();
    let alive = true;
    void created.initialize().then(() => {
      if (!alive) {
        return; // the screen closed while the player was starting
      }
      created.autoplay = false;
      created.src = contentUrl;
      setPlayer(created);
    });
    return () => {
      alive = false;
      setPlayer(null);
      void created.deinitialize();
    };
  }, [contentUrl]);

  const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: player });

  return (
    <>
      <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} />
      <AdOverlay ui={ads.ui} onSkip={ads.skip} />
    </>
  );
}
```

Without VMAP, pass a list of breaks:

```ts
source: { breaks: [{ offset: 'start', vastUrl }, { offset: 600, vastUrl }, { offset: 'end', vastUrl }] }
```

With a post-roll, wait for `ads.ended` before you leave the screen at the end of the content.

To fill the Fire TV advertising ID macros (`IFA`, `IFATYPE`, `LIMITADTRACKING`):

```ts
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { adIdMacros, vegaAdIdSource } from '@vega-ads/vega';

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

### `useVegaAds(options)`

| Option | Description |
|---|---|
| `source` | `{ vmapUrl }` or `{ breaks: [{ offset, vastUrl }] }`. `null` waits. |
| `contentPlayer` | Your initialized content `VideoPlayer` (`autoplay = false`), or any `PlayerPort`. |
| `macros` | Ad tag macros, for example `adIdMacros(source)` for `IFA` and `LIMITADTRACKING`. |
| `prefetchSeconds` | How early a break is loaded and buffered. Default 15. |
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
| `surfaces` | Pass to `DualSurfaceView` or `AdSurfaceLayers`. |
| `skip()` | Skip the ad. Returns `false` if skip is not allowed yet. |
| `togglePause()` | Pause or play the ad from your own on-screen button. Not for the remote key. |
| `back()` | Leave the break and return to the content. |

### Components

| Component | Props |
|---|---|
| `DualSurfaceView` | `surfaces`, `contentPlayer?`, `onContentSurfaceCreated?`, `onContentSurfaceDestroyed?`, `scalingMode?` (default `'fit'`), `style?` |
| `AdSurfaceLayers` | `surfaces`, `scalingMode?` (default `'fit'`), `style?` |
| `AdOverlay` | `ui`, `onSkip`, `style?` |

## Architecture

Three packages:

| Package | What it does |
|---|---|
| `@vega-ads/vast` | Loads VAST/VMAP, chooses the media file, sends IAB tracking. No player code. |
| `@vega-ads/core` | Platform-independent logic: break schedule, pods, session state, overlay data. Re-exports `vast`. |
| `@vega-ads/vega` | Vega adapter: `W3cPlayerAdapter`, surfaces, media controls, React hook and overlay. |

`core` never imports a player SDK, `fetch` or timers. It talks to the platform through ports: `PlayerPort`, `HttpPort` and `ClockPort`.

To support another player or platform, implement `PlayerPort`:

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

Then pass your adapter as `contentPlayer`, or use `AdManager` from `@vega-ads/core` directly. `W3cPlayerAdapter` is the reference implementation.

## Compatibility

| Vega SDK | React Native | Status |
|---|---|---|
| 0.23 | 0.72 | Verified on Fire TV Stick 4K Select, Vega OS 2.0 (`apps/spike`) |
| 0.24 | 0.83 | Verified on the same device in Amazon's vega-video-sample with Shaka (`examples/vega-video-sample`) |

The device reports Vega OS 2.0 (`/etc/os-release`: "OS 2.0 (TV Ship/515)", read on 11.10.2026). The Vega Virtual Device of SDK 0.24 runs Vega OS 1.2.

## Tools

- [`tools/demo-ads`](tools/demo-ads) draws three demo ad creatives (invented brands, no third-party footage) and serves them with VAST, VMAP and a pixel log on the local network.
- [`tools/pixel-collector`](tools/pixel-collector) collects tracking pixels on AWS Lambda and DynamoDB.
- [`tools/make-vmap`](tools/make-vmap) finds mid-roll points in a video with Amazon Rekognition (shot cuts, black frames, credits) and writes a VMAP file for `vega-ads`.

## Development

```sh
npm ci
npm run check   # lint, types and all tests
```

## Known limitations

- **DRM.** The first Vega devices support only one secure video decoder ([media player requirements](https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html)). If both content and ads are DRM-protected, the second player cannot decode at the same time. Use clear (non-DRM) ad creatives.
- **1 GB devices.** All current Vega sticks have 1 GB RAM. `vega-ads` uses two ad players. Amazon's guide recommends one ad player on devices with limited memory or decoders. If the second ad player cannot start or fails, `vega-ads` continues with one ad player; the gap between ads in a pod is then longer. Test on your target devices.
- **Amazon Publisher Services (APS).** Amazon's [advertising policy](https://developer.amazon.com/docs/policy-center/amazon-appstore-advertising.html) can require large ad-supported Fire TV apps to give 30% of ad impressions to APS. `vega-ads` does not integrate APS. Check if the rule applies to your app.
- **HTTPS media only**, unless the host is in the manifest's cleartext list (see Quick start).
- **No VPAID or SIMID.** Interactive ads are not supported.
- **No NonLinear or Companion ads.**
- **No SSAI.** `vega-ads` is client-side only.
- **XML.** Vega has no `DOMParser`, and native XML modules are not available. `vega-ads` uses pure JS (`@xmldom/xmldom`). A 34.4 KB VAST takes about 60 ms on the JS thread. Ads load before the break, so the viewer does not wait. You can pass your own parser.

## Friction log

While building `vega-ads`, I logged platform issues with steps, expected and actual results, and suggestions. Full log: [`docs/friction-log.md`](docs/friction-log.md). Main points:

- A Google sample video URL used in many player samples returns HTTP 403. The JS error has code 4 and an empty message; the cause is only in the system log.
- The system log drops app `console.log` lines above 300 lines per second. Media pipeline logs use most of that budget.
- Media controls with two players need both the manifest entry and `setMediaControlFocus`. With one step missing, nothing works and nothing is logged. The CSAI guide does not mention media controls.
- The media control docs sample uses a deprecated API (`useComponentInstance`).
- A video surface turns empty after `ended`, so content shows through between two ads for ~0.5 s. `vega-ads` starts the next ad ~500 ms early to hide this.
- The play/pause key reaches both media controls and JS key handlers. Apps with their own remote handler toggle twice.
- Without the media controls entries, a legacy player session still pauses a playing player on play/pause, and undoes an app's own resume.
- The w3cmedia player refuses `http://` media; the manifest's cleartext list fixes it, but it is documented only for WebView.
- On a cold launch, `setMediaControlFocus` blocks the JS thread for 1–2 s. Called right after `play()`, it delayed the impression; `vega-ads` now takes media controls focus after the first frame.

## Credits

Device tests and the demo use *Tears of Steel*, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0. Soundtrack (C) Joram Letwory – www.tearsofsteel.org, CC BY-ND 3.0. The demo ads use the Inter font (SIL Open Font License).

## License

Apache-2.0

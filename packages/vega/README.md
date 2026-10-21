# react-native-vega-ads

VAST/VMAP video ads for React Native on Amazon Vega OS (Fire TV): w3cmedia players, a React hook, video surfaces and a 10-foot overlay.

Part of [react-native-vega-ads](https://github.com/kalenkou/react-native-vega-ads). Full guide and manifest entries: [main README](https://github.com/kalenkou/react-native-vega-ads#readme). Device measurements: [docs/device-results.md](https://github.com/kalenkou/react-native-vega-ads/blob/main/docs/device-results.md).

## Use

The shortest way: one component plays the content with its ads.

```tsx
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { VegaAdsPlayer } from 'react-native-vega-ads';

<VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }} adId={AdIdRetriever} onEnd={onClose} />;
```

With your own screen and controls, use the hook and the components:

```tsx
import { AdOverlay, DualSurfaceView, useVegaAds } from 'react-native-vega-ads';

const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: player });

return (
  <>
    <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} />
    <AdOverlay ui={ads.ui} onSkip={ads.skip} />
  </>
);
```

Required in `manifest.toml`: the media category, the `IMediaPlaybackServer` interface provider and, for the advertising ID, the ad manager service. See the main README. Media URLs must be HTTPS.

| Export | What it is |
|---|---|
| `<VegaAdsPlayer>` | content player, ad surfaces, overlay, "Ad in N" countdown and pause ad in one component. Every part can be replaced |
| `useVideoPlayer(uri)` | the content `VideoPlayer`, initialized, `autoplay` off, released when the screen closes |
| `useVegaAds(options)` | the hook: loads breaks, drives the players, returns `playing`, `ui`, `ad`, `surfaces`, `skip`, `back` |
| `DualSurfaceView` | content surface plus two ad surfaces |
| `AdSurfaceLayers` | only the two ad surfaces, for screens that render their own content surface. Mount it after that surface is created |
| `AdOverlay` | "Ad 1 of 3 · 0:12", Skip button with D-pad focus, VoiceView announcement |
| `useAdAnnouncements(ui)` | the VoiceView announcements of `AdOverlay`, for your own overlay |
| `AdSkipButton` | the Skip button of `AdOverlay` (D-pad focus, disabled until allowed, focus anchor), for your own overlay |
| `AdStyles` | your fonts and colours for the built-in ad UI (`adStyles` on `VegaAdsPlayer`, `styles` on each part) |
| `AdCountdown`, `PauseAd` | "Ad in N" before a mid-roll. The pause ad from `ads.pauseAd` |
| `W3cPlayerAdapter` | `PlayerPort` on a w3cmedia `VideoPlayer` |
| `createAdMediaControlHandler` | media controls during ads: play/pause allowed, seek and skip blocked |
| `preloadVegaAds(schedule)` | asks for the VMAP and the pre-roll on the title page, so the pre-roll starts sooner after Play |
| `useAdPlan(schedule)`, `adPlanLabel` | before Play: "4 ad breaks · first: 2 ads, 25 s, skippable after 5 s". `marks`: where each break is, with the scene signals from the VMAP |
| `vegaAdIdSource`, `adIdMacros` | the Fire TV advertising ID as `IFA`, `IFATYPE`, `LIMITADTRACKING` macros |
| `rnvPlayerPort(player)` | a react-native-video v7 `VideoPlayer` as the content player |
| `HeadlessPlayerAdapter`, `HeadlessPlayerService` | Amazon's CSAI "Headless approach": the content and every ad play as sessions of your app's player service (see below) |
| `useStitchedAds(options)` | ads the server already put into the stream (SSAI): IAB pixels and the ad label from the content time, skip by seek (see below) |
| `watchReport(events)`, `watchReportLabel` | after a watch, from the `onEvent` names: "3 ads · 1 repeat left out · 2 ads turned down, up to 9 dB" |

Peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia`, `@amazon-devices/react-native-kepler`.

### Headless approach (preview)

Amazon's CSAI guide offers a second way: the w3cmedia players run in a service component of
your app. The UI controls them through `IPlayerClient` (`@amazon-devices/kepler-player-client`).
The UI thread then never waits for the player. Here the content and each ad are sessions of
that service.

In the service (registered in `service.js`, as in Amazon's "Implement Headless JavaScript Playback"):

```ts
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia/dist/headless';
import { PlayerServerFactory } from '@amazon-devices/kepler-player-server';
import { HeadlessPlayerService } from 'react-native-vega-ads';

export const onStartService = async () => {
  const server = new PlayerServerFactory().getOrMakeServer();
  server.setHandler(new HeadlessPlayerService(server, () => new VideoPlayer()), 'com.example.app.service');
};
```

In the UI:

```tsx
const client = new PlayerClientFactory().getOrMakeClient('com.example.app.service');
const content = new HeadlessPlayerAdapter(client, { id: 1 }, getComponentInstance);
let session = 2;

await content.initialize(); // the content is your player: you start it
content.setSrc(movieUrl); // no autoplay: the library starts the movie after the pre-roll

<VegaAdsPlayer
  player={content}
  ads={{ vmapUrl }}
  createAdPlayer={() => new HeadlessPlayerAdapter(client, { id: session++ }, getComponentInstance)}>
  {() => (
    <KeplerVideoSurfaceView
      style={StyleSheet.absoluteFill}
      onSurfaceViewCreated={(handle) => content.attachSurface(handle)}
      onSurfaceViewDestroyed={(handle) => content.detachSurface(handle)}
    />
  )}
</VegaAdsPlayer>;
```

Checked on a Fire TV Stick 4K Select (muted): pre-roll, seek, a two-ad mid-roll pod with the
hand-over between ads, a repeated ad left out, the content back at the break time. The position
comes from the service 4 times a second, so a break starts at most about 0.25 s after its time.
Ad players from `createAdPlayer` take the remote through the service: `adPause` and the built-in
ad media-control handler (seek and skip blocked during ads) apply only to the default w3cmedia ad
players. The manifest needs the service component, the process group and `wants`/`offers` for the
service, as in Amazon's guide. With React Native 0.83, `@amazon-devices/kepler-player-client@2.3.0-rn-83`
asks for `kepler-player-server@^2.3.0`, which npm cannot match: add
`"overrides": { "@amazon-devices/kepler-player-server": "2.3.0-rn-83" }` to your `package.json`.

### Stitched ads (preview)

When the server already put the ads into the stream (server-side ad insertion, SSAI), the player
never switches. `useStitchedAds` only tracks: the content time says which ad plays. The same
IAB pixels go out as for client-side ads. The VMAP break times are positions in that stream, ads
included.

```tsx
const player = useVideoPlayer(streamUrl);
const ads = useStitchedAds({ vmapUrl, player, streamSeconds: 110, onEvent: console.log });
useEffect(() => {
  if (ads.ready) void player?.play(); // start once the ad schedule is known
}, [ads.ready, player]);

{ads.ad && <Text>{`Ad ${ads.ad.index} of ${ads.ad.count} · ${ads.ad.remaining}s`}</Text>}
{ads.ad?.secondsUntilSkip === 0 && <Button title="Skip" onPress={ads.skip} />}
```

Rules: an ad counts only when playback enters it at its start (within 2 s), so start the stream
when `ready` is true. A seek out of an ad ends its tracking without `complete`. Each ad is tracked
once. The end of the stream completes an ad that ends with it. `skip()` seeks to the end of the ad
once skipping is allowed. Each break holds the ads a client-side break would play: one where the
VMAP allows one (`allowMultipleAds="false"`), a pod in `sequence` order. `streamSeconds` is needed
for `n%` and `end` breaks. Leave it out while unknown and pass it when the player knows the
duration: those breaks are placed then, without loading the VMAP again. Break times come from the
VMAP only, not from SCTE-35 or HLS/DASH ad markers.

Checked on a Fire TV Stick 4K Select (muted), a 110 s stream with a 10 s pre-roll and a 10 s
mid-roll at 1:10: impression, start, quartiles and skip of the pre-roll (skip at 5 s moved the
player to 0:10), the full mid-roll to `complete`. In 4 of 5 runs all 11 pixels reached the ad server. One run sent no event after Skip. The cause is not known.


## License

Apache-2.0
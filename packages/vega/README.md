# react-native-vega-ads

VAST/VMAP video ads for React Native on Amazon Vega OS (Fire TV): w3cmedia players, a React hook, video surfaces and a 10-foot overlay.

Part of [react-native-vega-ads](https://github.com/kalenkou/vega-ads). Full guide, manifest entries and device measurements: [main README](https://github.com/kalenkou/vega-ads#readme).

## Use

The shortest way: one component plays the content with its ads.

```tsx
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
| `<VegaAdsPlayer>` | content player, ad surfaces, overlay, "Ad in N" countdown and pause ad in one component; every part can be replaced |
| `useVideoPlayer(uri)` | the content `VideoPlayer`, initialized, `autoplay` off, released when the screen closes |
| `useVegaAds(options)` | the hook: loads breaks, drives the players, returns `playing`, `ui`, `surfaces`, `skip`, `back` |
| `DualSurfaceView` | content surface plus two ad surfaces |
| `AdSurfaceLayers` | only the two ad surfaces, for screens that render their own content surface; mount it after that surface is created |
| `AdOverlay` | "Ad 1 of 3 · 0:12", Skip button with D-pad focus, VoiceView announcement |
| `useAdAnnouncements(ui)` | the VoiceView announcements of `AdOverlay`, for your own overlay |
| `AdCountdown`, `PauseAd` | "Ad in N" before a mid-roll; the pause ad from `ads.pauseAd` |
| `W3cPlayerAdapter` | `PlayerPort` on a w3cmedia `VideoPlayer` |
| `createAdMediaControlHandler` | media controls during ads: play/pause allowed, seek and skip blocked |
| `preloadVegaAds(schedule)` | asks for the VMAP and the pre-roll on the title page, so the pre-roll starts sooner after Play |
| `useAdPlan(schedule)`, `adPlanLabel` | before Play: "4 ad breaks · first: 2 ads, 25 s, skippable after 5 s", and `marks`: where each break is, with the scene signals from the VMAP |
| `vegaAdIdSource`, `adIdMacros` | the Fire TV advertising ID as `IFA`, `IFATYPE`, `LIMITADTRACKING` macros |
| `rnvPlayerPort(player)` | a react-native-video v7 `VideoPlayer` as the content player |
| `watchReport(events)`, `watchReportLabel` | after a watch, from the `onEvent` names: "3 ads · 1 repeat left out · 2 ads turned down, up to 9 dB" |

Peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia`, `@amazon-devices/react-native-kepler`.

## License

Apache-2.0

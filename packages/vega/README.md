# @vega-ads/vega

VAST/VMAP video ads for React Native on Amazon Vega OS (Fire TV): w3cmedia players, a React hook, video surfaces and a 10-foot overlay.

Part of [vega-ads](https://github.com/kalenkou/vega-ads). Full guide, manifest entries and device measurements: [main README](https://github.com/kalenkou/vega-ads#readme).

## Use

```tsx
import { AdOverlay, DualSurfaceView, useVegaAds } from '@vega-ads/vega';

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
| `useVegaAds(options)` | the hook: loads breaks, drives the players, returns `playing`, `ui`, `surfaces`, `skip`, `back` |
| `DualSurfaceView` | content surface plus two ad surfaces |
| `AdSurfaceLayers` | only the two ad surfaces, for screens that render their own content surface |
| `AdOverlay` | "Ad 1 of 3 · 0:12", Skip button with D-pad focus, VoiceView announcement |
| `W3cPlayerAdapter` | `PlayerPort` on a w3cmedia `VideoPlayer` |
| `createAdMediaControlHandler` | media controls during ads: play/pause allowed, seek and skip blocked |

Peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia`, `@amazon-devices/react-native-kepler`.

## License

Apache-2.0

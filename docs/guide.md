# Guide

Install and the manifest entries are in the [README](../README.md#quick-start). This page shows the rest: preloading, your own UI, your own player and surfaces.

## Play content with ads

One component creates the content player, draws the video surfaces and the ad overlay, and fills the Fire TV advertising ID:

```tsx
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { VegaAdsPlayer } from 'react-native-vega-ads';

export function PlayerScreen({ uri, vmapUrl, onClose }: { uri: string; vmapUrl: string; onClose: () => void }) {
  return <VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }} adId={AdIdRetriever} onEnd={onClose} />;
}
```

Remote and Alexa play/pause work through media controls. `onEnd` runs when the content and its post-roll are over. `adId` is optional. Without it, no ID is sent.

Mid-rolls are marked for your timeline (`ads.timeline.marks`), and "Ad in 5" shows before each one, so a break never comes as a surprise.

Start the ad requests on the title's page, so after Play the pre-roll only has to buffer:

```tsx
import { preloadVegaAds } from 'react-native-vega-ads';

useEffect(() => preloadVegaAds({ vmapUrl }, { adId: AdIdRetriever }), [vmapUrl]);
```

The player with the same `ads` uses the answers once, within five minutes. Otherwise it asks the ad server itself. Later breaks are requested during playback, as before.

`useAdPlan(ads, options)` preloads the same way and returns what the viewer can know before Play: the number of breaks, the pre-roll (ads, seconds, skip after) and `marks`, where each break is (`start`, `end`, a time or a percent) with the scene signals from the VMAP context. The demo draws its break map from it. `adPlanLabel(plan)` gives one line: "4 ad breaks · first: 1 ad, 10 s".

## Customise any part

You can replace every part of `<VegaAdsPlayer>`, and the ads keep working. The component is a thin default over the hook: `useVegaAds` gives the ad state (`ads.ui`, `ads.snapshot`, `ads.timeline`, `ads.pauseAd`) and the actions (`skip`, `togglePause`, `back`), and every built-in part reads only these. So you can draw all of the ad UI yourself. The components are optional defaults.

Your own controls over the video (hidden during ads):

```tsx
<VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }}>
  {({ player, ads }) => !ads.playing && <MyControls player={player} />}
</VegaAdsPlayer>
```

Your own player, for example the `VideoPlayer` that Shaka plays through. Create it as usual (initialized, `autoplay` off, source set). The component uses it and never releases it:

```tsx
<VegaAdsPlayer player={myVideoPlayer} ads={{ vmapUrl }} />
```

Your own content surface (the screen already draws one): the component adds only the ad surfaces above it.

```tsx
<VegaAdsPlayer player={myVideoPlayer} ads={{ vmapUrl }} contentSurface={false}>
  <MyPlayerScreen />
</VegaAdsPlayer>
```

Your fonts and colours on the built-in ad UI, with no own overlay: `adStyles` adds to the defaults of each part (`label`, `why`, `caption`, `skip`, `skipWaiting`, `skipText`, `skipWaitingText`, `countdown`, `pauseAdLabel`, `pauseAdHint`).

```tsx
<VegaAdsPlayer
  source={{ uri }}
  ads={{ vmapUrl }}
  adStyles={{
    label: { fontFamily: 'MyBrand-Bold', color: '#ffd166' },
    skip: { backgroundColor: '#ffd166', borderColor: '#ffd166', right: 96 },
    skipText: { color: '#111', fontFamily: 'MyBrand-Bold' },
    skipWaiting: { backgroundColor: 'rgba(0,0,0,0.7)' },
    skipWaitingText: { color: '#bbb' },
  }}
/>
```

Your own ad overlay, laid out as you like: `renderOverlay={(ads) => <MyAdOverlay ads={ads} />}`. `ads.ui` gives the text parts (`name` "Ad 1 of 3", `timeLeft` "0:12", `why`) and `ads.snapshot` the numbers (`position`, `total`, `adTime`, `adDuration`, `skipIn`). `ads.ad` is the ad on screen: `id`, `title`, `advertiser` and more. Put `<AdSkipButton ui={ads.ui} onSkip={ads.skip} styles={…} />` in it: the button takes the D-pad focus, ignores presses until Skip is allowed, and during a non-skippable ad holds the focus so the remote does not reach the screen behind the ad. Call `useAdAnnouncements(ads.ui)` in it: VoiceView then announces each ad and the moment Skip opens, as with the built-in overlay.

```tsx
function MyAdOverlay({ ads }: { ads: VegaAds }) {
  useAdAnnouncements(ads.ui);
  if (!ads.ui.visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Text style={styles.badge}>{ads.ui.name}</Text>
      <Text style={styles.clock}>{ads.ui.timeLeft}</Text>
      <AdSkipButton ui={ads.ui} onSkip={ads.skip} styles={{ skip: styles.skip, skipText: styles.skipText }} />
    </View>
  );
}
```

## Your own player UI, with the hook

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
import { useMemo } from 'react';
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { adIdMacros, vegaAdIdSource } from 'react-native-vega-ads';

// Read the ID once, not on every render.
const macros = useMemo(() => adIdMacros(vegaAdIdSource(AdIdRetriever)), []);
const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: player, macros });
```

When the user opts out of interest-based ads, or the ID service fails, the ID is not sent and `LIMITADTRACKING` is `1`. `<VegaAdsPlayer adId={AdIdRetriever}>` does this for you.

A full integration into Amazon's sample app (Shaka, MP4 and DASH) is in [`examples/vega-video-sample`](../examples/vega-video-sample).

## If your screen already renders the content surface

Some apps own their content surface, for example a Shaka player screen. Use `AdSurfaceLayers` instead of `DualSurfaceView`. Place it above your surface, over the same area. It adds only the two ad surfaces.

Mount `AdSurfaceLayers` after your content surface is created, for example once its `onSurfaceViewCreated` has run. On Vega a video surface created later is drawn above the earlier ones, whatever the zIndex. Mounted first, the ads play behind the content surface and the screen stays black.

```tsx
<View style={{ flex: 1 }}>
  <YourContentSurface />
  <AdSurfaceLayers surfaces={ads.surfaces} />
  <AdOverlay ui={ads.ui} onSkip={ads.skip} />
</View>
```

Pass the `VideoPlayer` that Shaka plays through as `contentPlayer`.

## If your app plays with react-native-video v7

`rnvPlayerPort(player)` turns a react-native-video v7 `VideoPlayer` into the content player for the ads, through its public API (no dependency on react-native-video). Your `<VideoView>` shows the content. The component adds the ad surfaces and the overlay:

```tsx
import { useVideoPlayer, VideoView } from 'react-native-video';
import { rnvPlayerPort, VegaAdsPlayer } from 'react-native-vega-ads';

const player = useVideoPlayer({ uri }); // do not call play() here: the ads start the content
const content = useMemo(() => rnvPlayerPort(player), [player]);

<VegaAdsPlayer player={content} ads={{ vmapUrl }} adId={AdIdRetriever}>
  {({ ads }) => <VideoView player={player} style={StyleSheet.absoluteFill} />}
</VegaAdsPlayer>
```

Hide your controls while `ads.playing`: react-native-video reports `readyToPlay` during the pre-roll. react-native-video needs a Vega backend for this. We tested it on a Fire TV Stick with a prototype backend (pre-roll, pod, seek and events after the breaks).

## If your app has its own remote handler (spatial navigation)

On Vega, the play/pause key reaches both media controls and your JS key handler. Media controls already pause and resume the ad. So ignore `playpause` in your handler while `ads.playing` is true. Otherwise the ad toggles twice.

```ts
useTVEventHandler((event) => {
  if (event.eventType === 'playpause' && ads.playing) {
    return; // media controls handle the ad
  }
  // your normal handling
});
```

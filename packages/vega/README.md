# react-native-vega-ads

Video ads (VAST 4 and VMAP 1) for React Native apps on Amazon Fire TV (Vega OS). One component plays the movie with its ads.

Part of [react-native-vega-ads](https://github.com/kalenkou/react-native-vega-ads). Full guide and manifest entries: [main README](https://github.com/kalenkou/react-native-vega-ads#readme). Device measurements: [docs/device-results.md](https://github.com/kalenkou/react-native-vega-ads/blob/main/docs/device-results.md).

## Install

```sh
npm install react-native-vega-ads
```

This also installs `react-native-ads-core`. It runs on Vega OS with React Native 0.72 or 0.83.

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

### Ad breaks on your seek bar

`ads.timeline.marks` lists the mid-rolls: `id`, `time` in content seconds, and `done` once the
break has started or a seek has passed it. Draw them on your own seek bar. This example uses
react-native-video v7 and `@react-native-community/slider` on React Native 0.83. Both need their
Vega ports, pull requests [#5171](https://github.com/TheWidlarzGroup/react-native-video/pull/5171)
and [#839](https://github.com/callstack/react-native-slider/pull/839), not merged yet. The whole
screen is in [`apps/streaming-kit`](https://github.com/kalenkou/react-native-vega-ads/tree/main/apps/streaming-kit).
On a Fire TV Stick it marks the two breaks of Sintel at 2:42 and 9:03, and the remote moves the
slider.

```tsx
const player = useVideoPlayer({ uri }, (p) => {
  p.showNotificationControls = true; // the remote's play/pause goes to the movie
});
const content = useMemo(
  () =>
    rnvPlayerPort(player, {
      // after a break, the ad players give the remote back to the movie
      takeMediaControlFocus: async () => {
        player.showNotificationControls = true;
      },
    }),
  [player],
);
const schedule = useMemo(() => ({ vmapUrl }), [vmapUrl]);
const [time, setTime] = useState(0);
const [duration, setDuration] = useState(0);
const [started, setStarted] = useState(false);
const sliding = useRef(false); // while a key moves the thumb, the clock must not pull it back
useEvent(player, 'onLoad', ({ duration: seconds }) => setDuration(seconds));
useEvent(player, 'onProgress', ({ currentTime }) => {
  if (!sliding.current) setTime(currentTime);
  if (currentTime > 0) setStarted(true);
});

<VegaAdsPlayer
  player={content}
  ads={schedule}
  // a break that starts during a key hold hides the bar before the slide ends: end it here
  onEvent={(name) => name === 'breakStart' && (sliding.current = false)}
>
  {({ ads }) => (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} />
      {started && !ads.playing && duration > 0 && (
        <View style={styles.bar}>
          {ads.timeline.marks.map((mark) => (
            <View
              key={mark.id}
              style={[styles.mark, { left: `${(mark.time / duration) * 100}%` }, mark.done && styles.played]}
            />
          ))}
          <Slider
            hasTVPreferredFocus
            value={time}
            maximumValue={duration}
            step={10}
            onSlidingStart={() => (sliding.current = true)}
            onSlidingComplete={(seconds) => {
              sliding.current = false;
              setTime(seconds);
              player.seekTo(seconds);
            }}
          />
        </View>
      )}
    </>
  )}
</VegaAdsPlayer>;
```

The bar waits for `started`: the movie starts only after the pre-roll, so the bar does not show
before it, and it hides during each break. `styles.mark` is a thin bar with `position: 'absolute'`.
To line the marks up with the thumb, inset them by half the thumb width on both sides.

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

Checked on a Fire TV Stick 4K Select (muted, React Native 0.72): pre-roll, seek, a two-ad mid-roll pod with the
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

Checked on a Fire TV Stick 4K Select (muted, React Native 0.72), a 110 s stream with a 10 s pre-roll and a 10 s
mid-roll at 1:10: impression, start, quartiles and skip of the pre-roll (skip at 5 s moved the
player to 0:10), the full mid-roll to `complete`. In 4 of 5 runs all 11 pixels reached the ad server. One run sent no event after Skip. The cause is not known.

### React Native 0.72 and 0.83

React Native 0.72 on Vega lays out in physical pixels, 1920x1080 on a 1080p TV. React Native 0.83
lays out in dp on a 960x540 canvas, so the same numbers draw twice as big. The built-in ad UI
(label, Skip, countdown, captions, pause ad) is sized for 1920x1080 and scales itself with the
window width, so it looks the same on both. Your own styles from a 0.72 app can do the same:

```tsx
import { scaleStyles } from 'react-native-vega-ads';

// Written for 1920x1080. Lengths are halved on React Native 0.83, kept on 0.72.
const styles = StyleSheet.create(scaleStyles({ title: { fontSize: 48, marginBottom: 24 } }));
```

`layoutScale()` gives the factor itself: 1 on React Native 0.72, 0.5 on 0.83. The built-in styles use
it once, when the package loads. Styles you pass in `adStyles` (on `VegaAdsPlayer`), `styles` (on each part) or
`pauseAdStyle` are yours and are not scaled. In Jest, mock `Dimensions.get('window')` to 1920x1080
before the import, or the built-in UI renders at the size of the mock's window.

## License

Apache-2.0
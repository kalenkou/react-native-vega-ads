# react-native-vega-ads

Video ads for React Native apps on Amazon Fire TV (Vega OS). The library reads VAST 4 and VMAP 1, plays the ads on the native w3cmedia player and sends the IAB tracking pixels. It is for apps that have their own ad server. Open source, Apache-2.0.

Breaks come at good moments. The `make-vmap` tool puts each break on a shot change, never in the middle of a line. A local vision model notes what the scene before the break shows. The player then leaves out ads that do not fit, for example a car ad right after a car crash. See [how the breaks are placed](docs/how-breaks-are-placed.md).

`make-vmap` is optional and runs on your computer, not on the TV. The player works with any VMAP.

| Movie page: where the ad breaks are, and what the scene before each break shows | During a break: the ad says what was left out and why | On pause: a pause ad with a QR code |
| --- | --- | --- |
| ![Sintel's movie page with the break map: pre-roll, 00:02:42.083 after injury, 00:09:03.125 after death and weapons, post-roll](docs/images/movie-page.jpg) | ![An ad in a mid-roll of Sintel: "No Kettlo ad after a scene with injury · Volume matched to the movie"](docs/images/ad-break.jpg) | ![The paused movie with a pause ad and a QR code](docs/images/pause-ad.jpg) |

Screenshots of the demo app on a Fire TV Stick 4K Select. Films: (CC) Blender Foundation, CC BY 3.0. Ads: invented brands.

> Tested on a Fire TV Stick 4K Select (Vega OS 2.0). The API can change before 1.0.

## Features

- Pre-, mid- and post-rolls from a VMAP, or from your own list of VAST tags.
- VAST 4 wrappers, ad pods and skippable ads.
- No black frame between the movie and the ads. The movie resumes where it stopped.
- The remote and Alexa pause and play the ads. Skip gets the D-pad focus, and each ad is announced to VoiceView.
- IAB tracking: impression, quartiles, pause, skip, VAST error codes and the VMAP break events.
- No repeats. The same ad does not come back within 30 minutes, and a break has one ad per advertiser.
- An ad is never louder than the movie, when its VAST carries the ad's loudness.
- Pause ads, captions in ads, and ad categories left out after sensitive scenes (from the VMAP that `make-vmap` writes).
- In preview: tracking for ads that a server stitched into the stream, and Amazon's headless player.

More detail: [docs/features.md](docs/features.md).

## Quick start

### 1. Install

```sh
npm install react-native-vega-ads
```

This also installs `react-native-ads-core`. Your Vega app already has the peer dependencies: `react`, `react-native`, `@amazon-devices/react-native-w3cmedia` and `@amazon-devices/react-native-kepler`. For the Fire TV advertising ID, add `@amazon-devices/kepler-adid-retriever`.

### 2. Add entries to `manifest.toml`

Without these entries, the remote and Alexa do not work during ads.

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

Ad and movie URLs must be HTTPS. The w3cmedia player refuses `http://` media and gives the app only a generic error. For a development server, add its address to the manifest:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.20"]
```

Keep the usual w3cmedia services of a Vega video app. The build adds the `[[needs.module]]` entries itself. A full manifest: [`apps/demo/manifest.toml`](apps/demo/manifest.toml).

### 3. Play a movie with ads

```tsx
import { AdIdRetriever } from '@amazon-devices/kepler-adid-retriever';
import { VegaAdsPlayer } from 'react-native-vega-ads';

export function PlayerScreen({ uri, vmapUrl, onClose }: { uri: string; vmapUrl: string; onClose: () => void }) {
  return (
    <VegaAdsPlayer
      source={{ uri }}
      ads={{ vmapUrl }}
      adId={AdIdRetriever}
      onEvent={(name, info) => console.log(name, info.ad?.id)}
      onEnd={onClose}
    />
  );
}
```

- `onEvent` gets every ad event, such as `impression`, the quartiles, `skip`, `breakStart`, `breakEnd` and `error:<code>`. The second argument tells which break and which ad. All events: [API reference](docs/api.md#events-onevent).
- `onEnd` runs when the movie and its post-roll are over.
- `adId` is optional. Without it, no advertising ID is sent.

Your own controls, ad overlay or player (Shaka, react-native-video v7), and ads loaded on the title page: see the [Guide](docs/guide.md).

## Packages

| Package | What it is |
|---|---|
| `react-native-vega-ads` | Install this one. The player component, the `useVegaAds` hook, the ad overlay, the remote and media controls on Vega. |
| `react-native-ads-core` | Comes with it. VAST and VMAP requests, the break schedule, pods and IAB tracking in plain TypeScript, with no React Native or Vega code. |

The core talks to the player through a small `PlayerPort` interface. So it can drive a player on another platform, but we tested it on a device only with Vega. See [Architecture](docs/architecture.md).

## Docs

- [Guide](docs/guide.md): preload the ads, your own UI, player and surfaces, react-native-video v7, your own remote handler.
- [API reference](docs/api.md): props, hook options, the returned object, events, components.
- [Features](docs/features.md), [measured on a real device](docs/device-results.md), [known limitations](docs/limitations.md).
- [Why this library](docs/why.md): what else plays ads on Vega today.
- [How the breaks are placed](docs/how-breaks-are-placed.md), with the blind-labelled eval of the vision model.
- [The ad backend on AWS](docs/aws.md): S3, CloudFront, Lambda and DynamoDB from one script.
- [Amazon requirements](docs/amazon-requirements.md) and [our requirements](docs/requirements.md).
- [Friction log](docs/friction-log.md): the project has 26 platform issues with steps and suggestions.

## Tools

- [`apps/demo`](apps/demo): a small Vega app on `<VegaAdsPlayer>`, with a movie page and a player.
- [`tools/make-vmap`](tools/make-vmap): finds the break points in a movie and writes the VMAP.
- [`tools/demo-ads`](tools/demo-ads): demo ad creatives, VAST, VMAP and a pixel log on your network.
- [`tools/pixel-collector`](tools/pixel-collector): counts the tracking pixels on AWS Lambda and DynamoDB.
- [`tools/vast-samples`](tools/vast-samples): every IAB Tech Lab VAST sample through the core.

## Development

You need Node.js 22 and npm 10. The demo app also needs the Vega SDK.

```sh
npm ci
npm run check   # lint, types and the tests of the packages and tools
# the demo app's tests (the demo is not a workspace)
cd apps/demo && npm ci && cp src/media.example.ts src/media.local.ts && npm run use-core && npm test
```

The demo app's 22 tests run with the commands above. All device runs, failures too: [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md).

## Credits

Films:

- *Tears of Steel*, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0. Soundtrack (C) Joram Letwory, www.tearsofsteel.org, CC BY-ND 3.0.
- *Sintel*, © copyright Blender Foundation | [durian.blender.org](https://durian.blender.org), CC BY 3.0.
- *Big Buck Bunny* (eval only), (CC) Blender Foundation | [www.bigbuckbunny.org](https://www.bigbuckbunny.org), CC BY 3.0.

Fonts: the demo ads use Inter, and the demo app ships [IBM Plex](https://github.com/IBM/plex). Both are under the SIL Open Font License 1.1. The IBM Plex TTF files are unchanged from IBM's releases, with the licence in `apps/demo/assets/fonts`.

The packages depend on [@dailymotion/vast-client](https://github.com/dailymotion/vast-client-js), [@dailymotion/vmap](https://github.com/dailymotion/vmap-js) and [@xmldom/xmldom](https://github.com/xmldom/xmldom), all MIT.

`make-vmap` runs [ffmpeg](https://ffmpeg.org) (LGPL/GPL, called as a program), [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) with its `ggml-base.en` model (MIT), and [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) with [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) (Apache-2.0). They are not in this repository or in the npm packages. You install them yourself.

## License

Apache-2.0

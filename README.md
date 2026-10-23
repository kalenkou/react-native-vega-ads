# react-native-vega-ads

[![CI](https://github.com/kalenkou/react-native-vega-ads/actions/workflows/ci.yml/badge.svg)](https://github.com/kalenkou/react-native-vega-ads/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/react-native-vega-ads)](https://www.npmjs.com/package/react-native-vega-ads) [![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Video ads for React Native apps on Amazon Fire TV (Vega OS). The library reads VAST 4 and VMAP 1, the IAB standards for video ads and ad breaks. It plays the ads on Vega's video player (w3cmedia) and sends the IAB tracking pixels: the requests that tell the ad server an ad was seen. It is for apps that have their own ad server.

Why it is needed: Vega has no client-side IMA SDK. Amazon's guide shows how to switch between a movie player and an ad player, and leaves the rest to each app: ad requests, VAST parsing, tracking, ad pods, Skip, the remote and Alexa. To my knowledge, no other open library does this on Vega. [Why this library](docs/why.md) compares the options.

An optional AI tool places the breaks between lines of dialogue and leaves out ads that do not fit the scene. See [AI break placement](#ai-break-placement-optional).

| Movie page: where the ad breaks are and what the scene before each break shows | During a break: the ad says what was left out and why | On pause: a pause ad with a QR code |
| --- | --- | --- |
| ![Sintel's movie page with the break map: pre-roll, 00:02:42.083 after injury, 00:09:03.125 after death and weapons, post-roll](docs/images/movie-page.jpg) | ![An ad in a mid-roll of Sintel: "No Kettlo ad after a scene with injury · Volume matched to the movie"](docs/images/ad-break.jpg) | ![The paused movie with a pause ad and a QR code](docs/images/pause-ad.jpg) |

Screenshots of the demo app on a Fire TV Stick 4K Select, React Native 0.83. Films: (CC) Blender Foundation, CC BY 3.0. Ads: invented brands.

## Run it

- **In your browser:** the [web demo](https://kalenkou.github.io/react-native-vega-ads/) runs the same ad logic (`react-native-ads-core`) with a web video element as the player. No Fire TV needed. Its source is in [`tools/web-demo`](tools/web-demo).
- **On a Fire TV Stick:** download `demo_armv7.vpkg` from the [latest release](https://github.com/kalenkou/react-native-vega-ads/releases/latest). Install it with `vega device install-app -p demo_armv7.vpkg -d <device>`.
  - The demo plays two films with ads, streamed over HTTPS.
  - The "Compare: ads as usual" button plays the same film with ads on a timer.
  - On the Vega Virtual Device of an Apple silicon Mac, use `demo_aarch64.vpkg`.
  - Source: [`apps/demo`](apps/demo).
- **In your app:** `npm install react-native-vega-ads`, then

  ```tsx
  <VegaAdsPlayer source={{ uri: movieUrl }} ads={{ vmapUrl }} onEnd={onClose} />
  ```

  The [Quick start](#quick-start) has the manifest entries and a public test VMAP.

| React Native | Vega SDK | Tested on |
| --- | --- | --- |
| 0.72 | 0.24 | Fire TV Stick 4K Select, Vega OS 2.0 |
| 0.83 | 0.24 | Fire TV Stick 4K Select, Vega OS 2.0 |

The API can change before 1.0.

Measured on that stick with React Native 0.72: the switch from the movie to an ad takes 56-151 ms. In an 11-minute stress test with 27 ads, memory peaked at 91 MB. Then it stayed at 65-68 MB. On React Native 0.83 a whole film with 5 ads used 56-96 MB in 6 samples (the log missed the first mid-roll). More: [device results](docs/device-results.md).

## Features

- **Ad breaks.** Ads before, during and after the movie (pre-, mid- and post-rolls). The break times come from a VMAP file or from your own list of ad URLs (VAST tags).
- **VAST 4.** Wrappers (one ad server passes the request on to another), ad pods (several ads in one break) and skippable ads.
- **No black frame** between the movie and the ads. The movie resumes where it stopped.
- **Home and Back.** In the background the library releases every video player, as Amazon requires. Back in the app, the movie continues at the same second, and ads already shown do not come again. [Details](docs/features.md), including the rare case when the system closes the app first.
- **Remote and Alexa.** They pause and play the ads. The Skip button gets the remote's focus. VoiceView, the Fire TV screen reader, reads out each ad.
- **IAB tracking.** The ad server learns when an ad was shown, each quarter of it, pause, skip and errors. It also learns when a break starts and ends.
- **No repeats.** The same ad does not come back within 30 minutes. A break has one ad per advertiser. With `avoidRepeats.memory` the app remembers the shown ads across movies and launches.
- **Loudness match.** When its VAST says how loud the ad is, a louder ad is turned down to the loudness of the movie.
- **Pause ads and captions.** A pause ad shows a QR code while the movie is paused. Ads can have captions.
- **Blocked categories.** A break can block ad categories, for example no car ads right after a car crash. The list comes from the VMAP or from your code.
- **Your own ad UI.** Ad events come with the ad's data (`onEvent(name, info)`). The ad on screen is in `ads.ad`. You can replace the overlay (`renderOverlay`), its styles (`adStyles`) and its texts in any language (`strings`).
- **Preview.** The API of these parts can change:
  - Tracking for server-side ads, where your server puts the ads into the video stream itself.
  - Amazon's headless player, where the video plays in a separate process.

More detail: [docs/features.md](docs/features.md).

## AI break placement (optional)

`make-vmap` is a command-line tool in this repository. It is not in the npm packages. You run it on your computer, once per movie, before you publish the movie. The player works with any VMAP, so you can skip this part.

What you get:

- Breaks at shot changes and never in the middle of a line of dialogue.
- After a sensitive scene, the break blocks ad categories that do not fit. For example, no car ad right after a car crash.
- With `showWhy`, the ad tells the viewer why: "No Kettlo ad after a scene with injury".

How to use it:

1. Install [ffmpeg](https://ffmpeg.org). For the speech step add [whisper.cpp](https://github.com/ggml-org/whisper.cpp) with a small speech model. For the scene step add [llama.cpp](https://github.com/ggml-org/llama.cpp) with the Qwen3.6 vision model (about 24 GB of memory). The speech and scene steps are optional. The scene step needs the speech step.
2. Run `make-vmap` on the movie file. It writes a VMAP file with the break times and, for each break, the blocked ad categories.
3. Put the VMAP file next to the movie on any HTTPS host.
4. Give its URL to the player: `ads={{ vmapUrl }}`.

What your ad server needs:

- An IAB category in each ad's VAST (`<Category>`). `make-vmap` uses IAB Ad Product Taxonomy 2.0 codes, for example `1571` for electric vehicles. An ad without a category is never left out.
- `[BLOCKEDADCATEGORIES]` in your VAST tag URL. The player fills it with the blocked categories of the break, so the ad server can send fitting ads up front.
- Spare ads in the response are a good idea: ads without `sequence` (a VAST 4 "ad buffet"). One of them takes the place of a blocked ad, in a pod too. Without them the break plays one ad less.

Everything runs on your computer. No cloud, no cost, no viewer data. On an Apple M5 Pro, Sintel (15 min, 2 mid-roll breaks) takes 31 s with all three steps. Commands: [tools/make-vmap](tools/make-vmap). How well the model does: [how the breaks are placed](docs/how-breaks-are-placed.md).

## Quick start

### 1. Install

```sh
npm install react-native-vega-ads
```

This also installs `react-native-ads-core`. Your Vega app already has the peer dependencies: `react` 18.2 or later, `react-native` 0.72 or later, `@amazon-devices/react-native-w3cmedia` 2.1 or later and `@amazon-devices/react-native-kepler` 2.0 or later. The built-in ad UI keeps its size on React Native 0.72 and 0.83 ([details](packages/vega/README.md#react-native-072-and-083)). Babel and Metro need no changes. For the Fire TV advertising ID, also run `npm install @amazon-devices/kepler-adid-retriever`.

### 2. Add entries to `manifest.toml`

Without these entries, the remote and Alexa do not work during ads.

```toml
[[components.interactive]]
id = "com.example.app.main"
# ...
# Media category: lets Vega media controls (remote, Alexa) reach your players.
categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]

# Advertising ID service (only with `adId`): without it the ID service reports "do not track" for every user.
[[wants.service]]
id = "com.amazon.admanager.service.main"

# Media playback server: without it media controls commands are not delivered.
# component-id is the id of your interactive component above.
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
allowed-domains = ["192.0.2.20"]
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
- No ad server yet? Google's public IMA sample VMAP has a pre-roll, a mid-roll and a post-roll: `https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/vmap_ad_samples&sz=640x480&cust_params=sample_ar%3Dpremidpost&ciu_szs=300x250&gdfp_req=1&ad_rule=1&output=vmap&unviewed_position_start=1&env=vp&impl=s&cmsid=496&vid=short_onecue&correlator=[CACHEBUSTING]`. The player fills `[CACHEBUSTING]` itself.

Your own controls, ad overlay or player (Shaka, react-native-video v7) and ads loaded on the title page: see the [Guide](docs/guide.md).

## Fixes in other libraries

To build vega-ads, I fixed gaps in libraries that Vega apps use. I sent each fix to the library itself. All are open pull requests. None is merged or reviewed yet.

| Pull request | What it does |
|---|---|
| [react-native-video #5171](https://github.com/TheWidlarzGroup/react-native-video/pull/5171) | Adds Vega OS to v7: `VideoPlayer` and `VideoView` on w3cmedia. Without it, v7 crashes a Vega app about 1 s after launch. 38 new tests, all 113 pass. |
| [@react-native-community/slider #839](https://github.com/callstack/react-native-slider/pull/839) | Vega support: D-pad focus, Left and Right, VoiceView. Before, Vega showed "Unimplemented component". 32 tests, 16 of them new. |
| [react-native-bootsplash #808](https://github.com/zoontek/react-native-bootsplash/pull/808) | Vega support. Before, it crashed a Vega app at import. `BootSplash.hide()` now keeps and hides the native Vega splash screen, and the CLI makes the Fire TV splash file. 14 tests. On the stick the splash stays until `hide()`. |
| [vast-client-js #512](https://github.com/dailymotion/vast-client-js/pull/512) | `trackingHandler`: send tracking pixels with your own function. React Native has no `Image`, so tracking threw an error. With tests. |
| [vast-client-js #513](https://github.com/dailymotion/vast-client-js/pull/513) | Keeps the `[ASSETURI]` macro that the player gives. With a test. |
| [vega-video-sample #14](https://github.com/AmazonAppDev/vega-video-sample/pull/14) | A title with `secure: true` now gets hardware DRM. 3 new tests. |
| [react-native-multi-tv-app-sample #139](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/pull/139) | Optional client-side ads on the Vega player screen, with this library. Off by default. |

The [streaming kit](apps/streaming-kit) runs the ports of react-native-video, the slider and bootsplash together in one app.

## Packages

| Package | What it is |
|---|---|
| `react-native-vega-ads` | Install this one. The player component, the `useVegaAds` hook, the ad overlay, the remote and media controls on Vega. |
| `react-native-ads-core` | Comes with it. VAST and VMAP requests, the break schedule, pods and IAB tracking in plain TypeScript, with no React Native or Vega code. |

The core talks to the player through a small `PlayerPort` interface. So it can drive a player on another platform. On a device I tested it only with Vega. The [web demo](tools/web-demo) runs the same core in a browser with an HTML video element. See [Architecture](docs/architecture.md).

## Docs

- [Guide](docs/guide.md): preload the ads, your own UI, player and surfaces, react-native-video v7, your own remote handler.
- [API reference](docs/api.md): props, hook options, the returned object, events, components.
- [Features](docs/features.md), [measured on a real device](docs/device-results.md), [known limitations](docs/limitations.md).
- [Why this library](docs/why.md): what else plays ads on Vega today.
- [How the breaks are placed](docs/how-breaks-are-placed.md), with the blind-labelled eval of the vision model.
- [The ad backend on AWS](docs/aws.md): S3, CloudFront, Lambda and DynamoDB from one script.
- [Amazon requirements](docs/amazon-requirements.md) and [the library's requirements](docs/requirements.md).
- [Friction log](docs/friction-log.md): 39 problems I hit on the Vega platform, with steps to repeat them and suggestions.

## Tools

- [`apps/demo`](apps/demo): a small Vega app on `<VegaAdsPlayer>`, with a movie page and a player.
- [`apps/streaming-kit`](apps/streaming-kit): one Fire TV app from four open-source parts. react-native-video v7 plays the movie and this library plays the ads. The slider seeks, with the ad breaks marked on it. Bootsplash holds the launch screen. It needs the Vega ports from the pull requests above.
- [`tools/make-vmap`](tools/make-vmap): finds the break points in a movie and writes the VMAP.
- [`tools/demo-ads`](tools/demo-ads): demo ad creatives, VAST, VMAP and a pixel log on your network.
- [`tools/pixel-collector`](tools/pixel-collector): counts the tracking pixels on AWS Lambda and DynamoDB.
- [`tools/vast-samples`](tools/vast-samples): every IAB Tech Lab VAST sample through the core.

## Development

You need Node.js 22 and npm 10. The demo app also needs the Vega SDK.

```sh
npm ci
npm run check   # lint, format, types and the tests of the packages and tools
# the demo app's tests (the demo is not a workspace)
cd apps/demo && npm ci && cp src/media.example.ts src/media.local.ts && npm run use-core && npm test
```

`npm run test:mutation` runs Stryker on `react-native-ads-core`. It makes 3,452 small changes to the code, one at a time, and the tests catch 89 % of them (23.10.2026). Property tests with fast-check feed the VAST, VMAP and WebVTT parsers random input.

Before a pull request run `npm run format` and `npm run check`. See [CONTRIBUTING.md](CONTRIBUTING.md). The demo app's 44 tests run with the commands above. All device runs, failures too: [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md).

## Credits

Films:

- *Tears of Steel*, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0. Soundtrack (C) Joram Letwory, www.tearsofsteel.org, CC BY-ND 3.0.
- *Sintel*, © copyright Blender Foundation | [durian.blender.org](https://durian.blender.org), CC BY 3.0.
- *Big Buck Bunny* (eval only), (CC) Blender Foundation | [www.bigbuckbunny.org](https://www.bigbuckbunny.org), CC BY 3.0.

Fonts: the demo ads use Inter. The demo app ships [IBM Plex](https://github.com/IBM/plex). Both are under the SIL Open Font License 1.1. The IBM Plex TTF files are unchanged from IBM's releases, with the license in `apps/demo/assets/fonts`.

The packages depend on [@dailymotion/vast-client](https://github.com/dailymotion/vast-client-js), [@dailymotion/vmap](https://github.com/dailymotion/vmap-js) and [@xmldom/xmldom](https://github.com/xmldom/xmldom), all MIT.

`make-vmap` runs these tools:

- [ffmpeg](https://ffmpeg.org) (LGPL/GPL, called as a program)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) with its `ggml-base.en` model (MIT)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) with [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) (Apache-2.0)

They are not in this repository or in the npm packages. You install them yourself.

## License

Apache-2.0

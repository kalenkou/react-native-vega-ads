# Vega streaming kit

One Fire TV app built from open-source parts ported to Vega OS. React Native 0.83.

| Part | What it does here | Vega support |
|---|---|---|
| [react-native-video](https://github.com/TheWidlarzGroup/react-native-video) v7 | plays the movie | pull request [#5171](https://github.com/TheWidlarzGroup/react-native-video/pull/5171), open |
| react-native-vega-ads | plays the VMAP ad breaks over the movie | this repository |
| [@react-native-community/slider](https://github.com/callstack/react-native-slider) | the seek bar, with the ad breaks marked on it | pull request [#839](https://github.com/callstack/react-native-slider/pull/839), open |
| [react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash) | keeps the launch screen until the posters load | pull request [#808](https://github.com/zoontek/react-native-bootsplash/pull/808), open |

The whole app is one file, [`src/KitApp.tsx`](src/KitApp.tsx).

## What it does

1. The launch screen stays until the first poster has loaded, at most 3 s.
2. Two poster cards. The remote moves the focus, and Enter plays the movie with its ads.
3. The pre-roll plays, then the movie starts.
4. The seek bar marks each mid-roll from `ads.timeline.marks`. A played break fades.
5. Left and Right move the slider by 10 s. Back returns to the posters.

Checked on a Fire TV Stick 4K Select with Vega OS 2.0 on 23.10.2026, with the sound off. The launch screen, the pre-roll and its tracking pixels worked. So did seeks with the slider. A seek past the 2:42 mark played the mid-roll. Play/Pause on the remote paused and resumed the movie, and also an ad. Back returned to the posters.

## Build and run

You need Node.js 22.14 or later, the Vega SDK and a Fire TV with Vega OS or the Vega Virtual
Device.

1. Pack the three ports into `ports/`. [`ports/README.md`](ports/README.md) says how.
2. From the repository root, install the tools of this repository. `use-core` in step 4 needs them:

   ```sh
   npm ci
   cd apps/streaming-kit
   ```

3. Copy `src/media.example.ts` to `src/media.local.ts`. Set `MEDIA_BASE` to
   `https://d3f9mqgmbcpau1.cloudfront.net/`, the media of the demo app on its CloudFront.
   Or run the demo's media server on your computer (step 1 in
   [the demo README](../demo/README.md)) and use its `http://` address. Then add its host to
   `apps/streaming-kit/manifest.toml` under `[network-traffic-policy.cleartext]`, as the demo
   README shows for the demo. Do not commit that. The Vega Virtual Device refuses `http://`
   media, so use the CloudFront address there.
4. Install, add the packages of this repository, and build:

   ```sh
   npm install
   npm run use-core
   npm run build:release
   ```

5. Install and start the app:

   ```sh
   vega run-app build/armv7-release/streaming-kit_armv7.vpkg -d DEVICE
   ```

   `vega device list` shows the device ID. Use `build/aarch64-release/streaming-kit_aarch64.vpkg`
   on a 64-bit device and on the Vega Virtual Device on a Mac with Apple silicon.

The Vega Virtual Device shows no launch screen, so bootsplash is visible only on a Fire TV.

Tears of Steel and Sintel: © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
